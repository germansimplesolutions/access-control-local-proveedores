import { Router } from "express";
import { getPersonByDocument, getAllPersons } from "./personDatabase.js";
import { getExpirationDetails, getExpiredFields, getAuthorizationsList } from "./expirations.js";
import { gates } from "../loadEnv.js";

const router = new Router();

// GET /api/devices - lista de nombres de equipos Face ID configurados, para
// que el front de la ficha pueda armar el selector de "que equipo ver" en
// su pantalla de configuracion.
router.get("/api/devices", (req, res) => {
  res.json({ devices: gates });
});

// GET /api/ficha/:document - datos completos de una persona (sin user ni
// resident_phones, nunca se guardaron) mas el detalle de vencimientos, para
// que el front arme la ficha.
router.get("/api/ficha/:document", (req, res) => {
  const person = getPersonByDocument(req.params.document);

  if (!person) {
    res.statusCode = 404;
    return res.json({ found: false, message: "No hay datos locales para ese documento." });
  }

  const expirationDetails = getExpirationDetails(person);
  const expiredFields = getExpiredFields(person);
  const authorizations = getAuthorizationsList(person);

  res.json({
    found: true,
    person,
    expirationDetails,
    authorizations,
    hasExpired: expiredFields.length > 0,
    expiredFields,
  });
});

// GET /api/ficha - lista resumida de todas las personas en la base local
// (para busqueda/listado desde el front, si hace falta).
router.get("/api/ficha", (req, res) => {
  const all = getAllPersons();

  const summary = Object.values(all).map((person) => ({
    document: person?.individual?.document,
    name: person?.individual?.name,
    lastname: person?.individual?.lastname,
    category: person?.individual?.category_id,
    company: person?.individual?.company,
    authorizationsCount: Object.keys(person?.authorizations || {}).length,
    hasExpired: getExpiredFields(person).length > 0,
  }));

  res.json({ persons: summary });
});

export { router as databaseRouter };
