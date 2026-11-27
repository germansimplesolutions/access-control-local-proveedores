import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { login, logout, requireSession } from "./adminAuth.js";
import { getConfig, saveConfig, getFeConfig, saveFeConfig } from "./adminConfig.js";
import { getAll as getAllLogs, subscribe as subscribeLogs } from "./logBuffer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = new Router();

router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "adminLoginPage.html"));
});

router.post("/login", login);
router.post("/logout", logout);

// Everything below here requires a valid session.
router.use(requireSession);

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "adminPage.html"));
});

router.get("/api/config", (req, res) => {
  res.json(getConfig());
});

router.post("/api/config", (req, res) => {
  const result = saveConfig(req.body);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

router.get("/api/fe-config", (req, res) => {
  res.json(getFeConfig());
});

router.post("/api/fe-config", (req, res) => {
  const result = saveFeConfig(req.body);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// Historial reciente (buffer en memoria, ver logBuffer.js) para cuando se
// abre la pestaña "Logs" del panel.
router.get("/api/logs", (req, res) => {
  res.json({ lines: getAllLogs() });
});

// Streaming en vivo (Server-Sent Events) de las líneas nuevas a partir de
// ahora. El navegador reconecta solo si se corta (comportamiento nativo de
// EventSource), y esta ruta ya está protegida por requireSession igual que
// el resto de /admin/api/*.
router.get("/api/logs/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  const send = (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  const unsubscribe = subscribeLogs(send);

  // Ping cada 20s para que la conexión no se corte sola por inactividad.
  const pingInterval = setInterval(() => {
    res.write(": ping\n\n");
  }, 20000);

  req.on("close", () => {
    clearInterval(pingInterval);
    unsubscribe();
  });
});

export { router as adminRouter };

