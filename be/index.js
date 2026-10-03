import "./loadEnv.js"; // Import enviroments variables
import express from "express";
import { Server } from "socket.io";
import { routes, socketEvent} from "./events/events.js";
import { getAuthorizations, startSync } from "./sync/sync.js";
import { adminRouter } from "./admin/adminRoutes.js";
import { databaseRouter } from "./database/databaseRoutes.js";
import fs from "fs";
import moment from "moment";

let listenPort = process.env.PORT;

// App setup
const app = express();
const server = app.listen(listenPort, function () {
  console.log("listening for requests on port " + listenPort + "...");
});

// Socket setup & pass server
const io = new Server(server);

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

