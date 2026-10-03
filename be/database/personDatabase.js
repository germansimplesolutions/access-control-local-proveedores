import fs from "fs";
import path from "path";

// Base de datos local simple: un .json en disco con un registro por
// persona, indexado por documento (DNI). No usa node-json-db ni ninguna
// base de datos real a proposito - mismo estilo que el resto del proyecto
// (leer archivo entero, modificar en memoria, volver a escribir entero).
const DB_FILE_PATH = process.env.DB_FILE_PATH || "./database/database.json";

function readDatabase() {
  try {
    if (!fs.existsSync(DB_FILE_PATH)) {
      return {};
    }

    const raw = fs.readFileSync(DB_FILE_PATH, "utf-8");

    if (!raw || raw.trim() === "") {
      return {};
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error("Error leyendo la base de datos local:", error);
    return {};
  }
}

function writeDatabase(db) {
  try {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("Error escribiendo la base de datos local:", error);
  }
}

/**
 * Guarda/actualiza el registro de una persona en la base de datos local, a
 * partir del payload "auth" tal cual lo manda la plataforma central -
 * excepto los campos "user" y "resident_phones", que se descartan a
 * proposito y nunca se persisten en ningun lado.
 *
 * Se guarda tal cual llegue, tanto en altas como en bajas (DELETE) - esta
 * base local es un registro de "quien es esta persona y sus datos", no de
 * "quien tiene acceso habilitado ahora mismo". Si en algun momento se
 * necesita que una baja borre tambien el registro local, hay que agregarlo
 * a proposito (no lo asumo acá).
 */
const saveAuthToDatabase = (auth) => {
  const document = auth?.individual?.document;

  if (!document) {
    console.error("No se pudo guardar en la base de datos local: falta individual.document en el payload recibido.");
    return;
  }

  // eslint-disable-next-line no-unused-vars
  const { user, resident_phones, ...authWithoutUserData } = auth;

  const db = readDatabase();
  db[document.toString()] = authWithoutUserData;
  writeDatabase(db);
};

const getPersonByDocument = (document) => {
  if (!document) return null;
  const db = readDatabase();
  return db[document.toString()] || null;
};

const getAllPersons = () => {
  return readDatabase();
};

export { saveAuthToDatabase, getPersonByDocument, getAllPersons, DB_FILE_PATH };
