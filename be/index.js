import "./loadEnv.js"; // Import enviroments variables
import express from "express";
import { Server } from "socket.io";
import { routes, socketEvent} from "./events/events.js";
import { getAuthorizations, startSync } from "./sync/sync.js";
import { adminRouter } from "./admin/adminRoutes.js";
import { databaseRouter } from "./database/databaseRoutes.js";
import fs from "fs";
import moment from "moment";
import path from "path";
import { fileURLToPath } from "url";
import { push as pushLog } from "./admin/logBuffer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Todo lo que el backend ya imprimía con console.log/warn/error/info queda
// IGUAL en la consola de siempre (docker logs sigue funcionando exactamente
// igual que antes), y ADEMÁS se guarda en el buffer en memoria que sirve la
// pestaña "Logs" del panel de admin (ver admin/logBuffer.js y
// admin/adminRoutes.js). No cambia ningún console.log existente en el resto
// del código - esto solo intercepta las 4 funciones una vez, acá.
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function formatLogArgs(args) {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack || a.message;
      try {
        return JSON.stringify(a);
      } catch (err) {
        return String(a);
      }
    })
    .join(" ");
}

console.log = (...args) => {
  originalConsole.log(...args);
  pushLog("log", formatLogArgs(args));
};
console.info = (...args) => {
  originalConsole.info(...args);
  pushLog("info", formatLogArgs(args));
};
console.warn = (...args) => {
  originalConsole.warn(...args);
  pushLog("warn", formatLogArgs(args));
};
console.error = (...args) => {
  originalConsole.error(...args);
  pushLog("error", formatLogArgs(args));
};


let listenPort = process.env.PORT;

// App setup
const app = express();
const server = app.listen(listenPort, function () {
  console.log("listening for requests on port " + listenPort + "...");
});

// Socket setup & pass server
// v2: sin esto, el socket.io (a diferencia de lo que dice el comentario de
// mas abajo sobre las rutas de Express) SI rechaza las conexiones
// cross-origin por defecto desde socket.io v3 - el handshake inicial usa
// HTTP normal (polling) antes de subir a WebSocket, y esta sujeto a CORS
// igual que cualquier fetch/XHR. fe y be corren en puertos distintos
// (8080 y 3888), asi que son origenes distintos para el navegador sea
// cual sea el dispositivo (PC, celular, tablet) - sin esta opcion el
// evento "accessControlEvent" nunca llega, aunque la pantalla/fondo se
// vea bien (eso lo sirve Vite, no pasa por el socket).
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.json());

// v2: el front nuevo (ficha) corre en otro puerto/origen (el 8080 de fe),
// asi que sus pedidos a /api/ficha/* son cross-origin - sin esto el
// navegador los bloquea. El socket.io de siempre no necesita esto porque
// las conexiones WebSocket no estan sujetas a CORS como fetch/XHR.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use("/admin", adminRouter);
app.use(databaseRouter);
app.use(routes(io));

// Sirve el build de produccion del front SOLO si existe "fe-dist" (app de
// Windows). En Docker esa carpeta no existe y no cambia nada.
const FRONTEND_DIST_PATH = process.env.FRONTEND_DIST_PATH || path.join(__dirname, "fe-dist");
if (fs.existsSync(FRONTEND_DIST_PATH)) {
  console.log("Sirviendo el front empaquetado desde " + FRONTEND_DIST_PATH);
  app.use(express.static(FRONTEND_DIST_PATH));
  app.get("/ficha", (req, res) => res.sendFile("index.html", { root: FRONTEND_DIST_PATH }));
}

const onConnection = (socket) => {
  console.info(`Client connected [id=${socket.id}]`);
  initInterval(io, socket);
  socketEvent(io, socket);
  
};

io.on("connection", onConnection);

//getAuthorizations();
startSync();

function initInterval(io, socket) {
  if (process.env.TEST_MODE == 1) {
    var test_event = "entry";

    setInterval(() => {
      if (test_event == "entry") {
        fs.readFile("./event_test_entry.json", "utf8", function (err, data) {
          if (err) throw err;
          // obj = JSON.parse(data);
          console.log("Send ENTRY event");
          socket.emit("accessControlEvent", data);
          test_event = "exit";
        });
      } else {
        fs.readFile("./event_test_exit.json", "utf8", function (err, data) {
          if (err) throw err;
          // obj = JSON.parse(data);
          console.log("Send EXIT event");
          socket.emit("accessControlEvent", data);
          test_event = "entry";
        });
      }
    }, 10000);
  }
}

