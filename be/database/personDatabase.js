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
 * Guarda/actualiza una autorizacion puntual de una persona en la base de
 * datos local, a partir del payload "auth" tal cual lo manda la plataforma
 * central - excepto los campos "user" y "resident_phones", que se
 * descartan a proposito y nunca se persisten en ningun lado.
 *
 * Cada persona puede tener MAS DE UNA autorizacion (distintos lotes/UF,
 * tipos - Resident/Permanent/Temporal - y fechas de vencimiento cada una).
 * Antes esto guardaba el auth entero plano por documento, asi que una
 * segunda autorizacion pisaba a la primera y se perdia. Ahora el registro
 * de cada persona tiene la forma:
 *   { individual: {...}, authorizations: { "<auth.id>": {...}, ... } }
 * "individual" son los datos biograficos/documentales (nombre, ART,
 * registro de conducir, etc.) - son los mismos para todas las
 * autorizaciones de esa persona, asi que se actualizan con el ultimo valor
 * que llegue. "authorizations" es un mapa por id de autorizacion.
 *
 * isDelete=true: en vez de guardar, BORRA esa autorizacion puntual (por su
 * "id") del mapa de la persona - "individual" no se toca (sigue siendo la
 * misma persona, solo perdio esa autorizacion puntual - por ejemplo, el
 * acceso a un lote especifico).
 */
const saveAuthToDatabase = (auth, isDelete = false) => {
  const document = auth?.individual?.document;

  if (!document) {
    console.error("No se pudo guardar en la base de datos local: falta individual.document en el payload recibido.");
    return;
  }

  const docKey = document.toString();
  const db = readDatabase();

  const existing = db[docKey] && db[docKey].authorizations
    ? db[docKey]
    : { individual: null, authorizations: {} }; // sin registro previo, o en el formato viejo (se reemplaza)

  if (isDelete) {
    delete existing.authorizations[auth.id];
  } else {
    existing.individual = auth.individual;
    existing.authorizations[auth.id] = {
      id: auth.id,
      uf: auth.uf,
      type: auth.type,
      category: auth.category,
      check_on_exit: auth.check_on_exit,
      sn_art: auth.sn_art,
      comment: auth.comment,
      dates: auth.dates,
    };
  }

  db[docKey] = existing;
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
