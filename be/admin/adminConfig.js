import fs from "fs";
import dotenv from "dotenv";
import { ENV_FILE_PATH, reloadConfig } from "../loadEnv.js";
import { startSync } from "../sync/sync.js";

// Captured once, when the process boots, before any save could change it -
// used to tell whether a saved PORT actually differs from the one Node is
// currently listening on.
const PORT_AT_BOOT = process.env.PORT;

// The frontend's own .env-fe, bind-mounted into THIS container too (be) just
// so this same panel can edit it - the be process never reads or uses these
// values itself, it only writes the file. See docker-compose.yaml: this file
// is mounted into the fe container as its actual `.env`, so Vite's dev
// server (which fe already runs) picks up the change and restarts itself
// automatically - no image rebuild, no restart of the be container either.
const ENV_FE_FILE_PATH = process.env.ENV_FE_FILE_PATH || "./.env-fe";
const FE_FIELDS = ["VITE_HOST"];

const GLOBAL_FIELDS = [
  "ID_BARRIO",
  "ID_BARRIOS_SYNC",
  "GUARD_POST_NAME",
  "PORT",
  "TIME_SYNC",
  "TEST_MODE",
  "URL_API",
  "API_USERNAME",
  "API_PASSWORD",
  "ADMIN_USER",
  "ADMIN_PASSWORD",
  "PERSON_FILTER_MODE",
  "BLOCKLIST_LOTES",
  "BLOCKLIST_CATEGORIAS",
  "ALLOWLIST_LOTES",
  "ALLOWLIST_CATEGORIAS",
  "PHOTO_SOURCE"
];

function readRawEnv() {
  if (!fs.existsSync(ENV_FILE_PATH)) {
    return null;
  }
  return dotenv.parse(fs.readFileSync(ENV_FILE_PATH));
}

// Turns the flat FACEID_1_..., FACEID_2_... / SUBEVENTTYPE_1, CARDTYPE_1...
// keys from the .env-be file into the structured shape the admin page works
// with: a plain object of global settings, plus one array entry per device
// and per subEventType.
function envToStructuredConfig(env) {
  const global = {};
  for (const key of GLOBAL_FIELDS) {
    global[key] = env[key] !== undefined ? env[key] : "";
  }

  const devices_connected = parseInt(env.DEVICES_CONNECTED, 10) || 0;
  const devices = [];
  for (let i = 1; i <= devices_connected; i++) {
    devices.push({
      type: env["FACEID_" + i + "_TYPE"] || "",
      devicename: env["FACEID_" + i + "_DEVICENAME"] || "",
      user: env["FACEID_" + i + "_USER"] || "",
      pass: env["FACEID_" + i + "_PASS"] || "",
      ip: env["FACEID_" + i + "_IP"] || "",
      use_alpr: env["FACEID_" + i + "_USE_APLR"] || "0",
      rtsp_url: env["FACEID_" + i + "_RTSP_URL"] || "",
      time_elapsed_since_auth: env["FACEID_" + i + "_TIME_ELAPSED_SINCE_AUTH"] || "",
      waiting_time: env["FACEID_" + i + "_WAITING_TIME"] || ""
    });
  }

  const subEventTypes_enabled = parseInt(env.SUBEVENTTYPES_ENABLED, 10) || 0;
  const subEventTypes = [];
  for (let i = 1; i <= subEventTypes_enabled; i++) {
    subEventTypes.push({
      subEventType: env["SUBEVENTTYPE_" + i] || "",
      cardType: env["CARDTYPE_" + i] || "",
      isPanic: env["PANIC_" + i] || "0"
    });
  }

  return { global, devices, subEventTypes };
}

function escapeValue(value) {
  const str = (value === undefined || value === null) ? "" : String(value);
  // dotenv treats a value with spaces/#/quotes more predictably when quoted.
  if (/[\s#"]/.test(str)) {
    return '"' + str.replace(/"/g, '\\"') + '"';
  }
  return str;
}

function line(key, value) {
  return key + "=" + escapeValue(value) + "\n";
}

// Renders the structured config back into a plain .env-be file. This
// regenerates the file cleanly on every save - any custom comments/spacing
// from manual edits won't be preserved, but every key the app actually
// reads is written out.
function structuredConfigToEnvText(config) {
  let out = "";

  out += "# Barrio / config general\n";
  for (const key of GLOBAL_FIELDS) {
    if (config.global[key] === "" || config.global[key] === undefined) continue;
    out += line(key, config.global[key]);
  }

  out += "\n# Dispositivos Face ID\n";
  out += line("DEVICES_CONNECTED", config.devices.length);
  out += "\n";
  config.devices.forEach((d, idx) => {
    const i = idx + 1;
    out += line(`FACEID_${i}_TYPE`, d.type);
    out += line(`FACEID_${i}_DEVICENAME`, d.devicename);
    out += line(`FACEID_${i}_USER`, d.user);
    out += line(`FACEID_${i}_PASS`, d.pass);
    out += line(`FACEID_${i}_IP`, d.ip);
    out += line(`FACEID_${i}_USE_APLR`, d.use_alpr || "0");
    out += line(`FACEID_${i}_RTSP_URL`, d.rtsp_url || "");
    out += line(`FACEID_${i}_TIME_ELAPSED_SINCE_AUTH`, d.time_elapsed_since_auth || "");
    out += line(`FACEID_${i}_WAITING_TIME`, d.waiting_time || "");
    out += "\n";
  });

  out += "# Tipos de evento habilitados\n";
  out += line("SUBEVENTTYPES_ENABLED", config.subEventTypes.length);
  out += "\n";
  config.subEventTypes.forEach((s, idx) => {
    const i = idx + 1;
    out += line(`SUBEVENTTYPE_${i}`, s.subEventType);
    out += line(`CARDTYPE_${i}`, s.cardType);
    out += line(`PANIC_${i}`, s.isPanic || "0");
    out += "\n";
  });

  return out;
}

function getConfig() {
  const env = readRawEnv();
  if (env === null) {
    return {
      available: false,
      reason: `No se encontró el archivo en ${ENV_FILE_PATH} dentro del contenedor. Falta agregar el volumen del .env-be en el docker-compose.yaml.`
    };
  }
  return { available: true, config: envToStructuredConfig(env) };
}

function validateConfig(config) {
  const errors = [];

  if (!Array.isArray(config.devices) || config.devices.length === 0) {
    errors.push("Tiene que haber al menos un dispositivo Face ID.");
  } else {
    config.devices.forEach((d, idx) => {
      const n = idx + 1;
      if (!d.devicename) errors.push(`Dispositivo ${n}: falta el nombre.`);
      if (!d.type || !["ENTRY", "EXIT"].includes(d.type)) errors.push(`Dispositivo ${n}: el tipo tiene que ser ENTRY o EXIT.`);
      if (!d.ip) errors.push(`Dispositivo ${n}: falta la IP.`);
      if (!d.user) errors.push(`Dispositivo ${n}: falta el usuario.`);
      if (!d.pass) errors.push(`Dispositivo ${n}: falta la contraseña.`);
    });
    const names = config.devices.map(d => d.devicename);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) errors.push(`Hay nombres de dispositivo repetidos: ${[...new Set(dupes)].join(", ")}`);
  }

  const filterMode = config.global.PERSON_FILTER_MODE || "none";
  if (!["none", "blocklist", "allowlist"].includes(filterMode)) {
    errors.push("El modo de filtro de personas tiene que ser uno de: sin filtro, todos menos estos, o nadie salvo estos.");
  }

  const photoSource = config.global.PHOTO_SOURCE || "local"; // v2: default "local", ver nota en faceIDController.js
  if (!["device", "local"].includes(photoSource)) {
    errors.push("El origen de las fotos tiene que ser: equipo o carpeta local.");
  }

  return errors;
}

// Writes the new config to ENV_FILE_PATH and reloads it into the running
// process immediately (except PORT, which needs an actual restart to
// rebind - see loadEnv.js).
function saveConfig(config) {
  const errors = validateConfig(config);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const text = structuredConfigToEnvText(config);

  try {
    fs.writeFileSync(ENV_FILE_PATH, text);
  } catch (error) {
    return { ok: false, errors: [`No se pudo escribir ${ENV_FILE_PATH}: ${error.message}`] };
  }

  reloadConfig();

  // Most global fields (ID_BARRIO, credentials, TIME_SYNC, etc.) are read
  // straight from process.env by the rest of the app (sync.js, adminAuth.js),
  // but process.env only gets populated once at container boot via
  // env_file. Update it here too so a save takes effect immediately,
  // without needing a restart - except PORT, which needs an actual restart
  // to rebind the listening socket.
  for (const key of GLOBAL_FIELDS) {
    if (key === "PORT") continue;
    process.env[key] = config.global[key] !== undefined ? String(config.global[key]) : "";
  }

  // TIME_SYNC drives a setInterval that was already running with the old
  // period baked in - updating process.env alone doesn't reschedule it, so
  // tear it down and set it up again with whatever the value is now.
  startSync();

  const needsRestartForPort = Boolean(config.global.PORT) && String(config.global.PORT) !== String(PORT_AT_BOOT);
  return { ok: true, needsRestartForPort };
}

// --- .env-fe (frontend) ---------------------------------------------------
// Much simpler than .env-be: just a handful of flat KEY=VALUE pairs, no
// devices/subEventTypes structure. This process never uses these values
// itself - it only reads/writes the file for the fe container to pick up.

function readRawFeEnv() {
  if (!fs.existsSync(ENV_FE_FILE_PATH)) {
    return null;
  }
  return dotenv.parse(fs.readFileSync(ENV_FE_FILE_PATH));
}

function getFeConfig() {
  const env = readRawFeEnv();
  if (env === null) {
    return {
      available: false,
      reason: `No se encontró el archivo en ${ENV_FE_FILE_PATH} dentro del contenedor. Falta agregar el volumen del .env-fe en el docker-compose.yaml.`
    };
  }
  const config = {};
  for (const key of FE_FIELDS) {
    config[key] = env[key] !== undefined ? env[key] : "";
  }
  return { available: true, config };
}

function validateFeConfig(config) {
  const errors = [];
  if (!config.VITE_HOST) {
    errors.push("Falta la URL del backend (VITE_HOST).");
  } else if (!/^https?:\/\/.+/.test(config.VITE_HOST)) {
    errors.push("La URL del backend tiene que empezar con http:// o https:// (ej: http://192.168.1.50:3888).");
  }
  return errors;
}

// Writes .env-fe. Nothing to reload on this side - the fe container's own
// Vite dev server watches this file (mounted as its `.env`) and restarts
// itself automatically when it changes.
function saveFeConfig(config) {
  const errors = validateFeConfig(config);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  let out = "";
  for (const key of FE_FIELDS) {
    if (config[key] === "" || config[key] === undefined) continue;
    out += line(key, config[key]);
  }

  try {
    fs.writeFileSync(ENV_FE_FILE_PATH, out);
  } catch (error) {
    return { ok: false, errors: [`No se pudo escribir ${ENV_FE_FILE_PATH}: ${error.message}`] };
  }

  return { ok: true };
}

export {
  getConfig,
  saveConfig,
  envToStructuredConfig,
  structuredConfigToEnvText,
  getFeConfig,
  saveFeConfig
};
