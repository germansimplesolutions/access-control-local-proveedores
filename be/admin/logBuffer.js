import { EventEmitter } from "events";

// Buffer en memoria de las últimas líneas de log (console.log/warn/error del
// backend), para poder verlas en vivo desde la pestaña "Logs" del panel de
// admin - el equivalente a "docker logs" cuando no hay contenedor (app de
// Windows) o simplemente para no tener que ir a buscarlo a otro lado.
//
// No persiste a disco a propósito: es nada más un historial corto en
// memoria (se pierde si se reinicia el proceso), igual que "docker logs"
// se pierde si se borra el contenedor.
const MAX_LINES = 1000;
const lines = [];
const emitter = new EventEmitter();

function push(level, text) {
  const entry = { ts: new Date().toISOString(), level, text };
  lines.push(entry);
  if (lines.length > MAX_LINES) {
    lines.shift();
  }
  emitter.emit("line", entry);
  return entry;
}

function getAll() {
  return lines.slice();
}

// Devuelve una función para desuscribirse.
function subscribe(listener) {
  emitter.on("line", listener);
  return () => emitter.off("line", listener);
}

export { push, getAll, subscribe };
