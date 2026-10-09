// Logica de vencimientos compartida entre faceIDController.js (para decidir
// si se abre la puerta) y la API de la ficha que consume el front nuevo -
// para que las dos usen exactamente el mismo criterio de "vencido".

const EXPIRATION_FIELDS = [
  { key: "art_date", label: "ART" },
  { key: "cert_penalty_date", label: "Certificado de reincidencia" },
  { key: "drive_license_exp_date", label: "Registro de conducir" },
];

function isExpired(dateStr) {
  if (!dateStr) return false; // sin fecha cargada: no se considera vencido

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expDate = new Date(dateStr + "T00:00:00");

  if (isNaN(expDate.getTime())) return false;

  return expDate < today;
}

// Una autorizacion puntual (un lote/UF con su tipo y categoria) vencida
// segun su propia fecha "Autorizado Hasta" (dates.auth_date_to). Sin fecha
// cargada (null o "0000-00-00") = autorizacion sin vencimiento, no se
// considera vencida - mismo criterio que isExpired() de arriba.
function isAuthExpired(auth) {
  const dateTo = auth?.dates?.auth_date_to;
  if (!dateTo || dateTo === "0000-00-00") return false;
  return isExpired(dateTo);
}

// Listado de autorizaciones de ingreso de la persona (para la tabla de la
// ficha), cada una con su propio estado vigente/vencido - pensado para
// mostrar, no para decidir apertura (eso lo hace hasValidAuthorization).
function getAuthorizationsList(person) {
  const authorizations = person?.authorizations || {};
  return Object.values(authorizations)
    .map((auth) => ({
      id: auth.id,
      uf: auth.uf,
      type: auth.type,
      category: auth.category,
      authDateTo: (auth?.dates?.auth_date_to && auth.dates.auth_date_to !== "0000-00-00") ? auth.dates.auth_date_to : null,
      expired: isAuthExpired(auth),
    }))
    .sort((a, b) => (a.id || 0) - (b.id || 0));
}

// Si la persona tiene al menos UNA autorizacion vigente (sin vencer). Sin
// ninguna autorizacion registrada se considera que no tiene autorizacion
// vigente (comportamiento conservador, igual que cuando no hay ficha local
// en absoluto).
function hasValidAuthorization(person) {
  const authorizations = person?.authorizations || {};
  const list = Object.values(authorizations);
  if (list.length === 0) return false;
  return list.some((auth) => !isAuthExpired(auth));
}

// Devuelve la lista de cosas vencidas en formato legible, por ejemplo:
// ["ART", "Seguro del vehiculo (AA123BB)"]. Incluye tanto documentacion
// personal vencida como el caso de que NINGUNA autorizacion de ingreso de
// la persona este vigente (antes esto ultimo no se chequeaba en absoluto -
// una persona con documentos al dia pero autorizacion ya vencida igual
// conseguia que se abriera la puerta).
// options.excludeKeys: claves de EXPIRATION_FIELDS (ej. "art_date") que no
// se chequean acá - pensado para cuando Taker está activo y reemplaza esa
// validación puntual por su propia consulta de cobertura (ver
// ../taker/takerClient.js y sus usos en faceIDController.js/databaseRoutes.js).
function getExpiredFields(person, options = {}) {
  const { excludeKeys = [] } = options;
  const expired = [];
  const individual = person?.individual;

  if (individual) {
    for (const field of EXPIRATION_FIELDS) {
      if (excludeKeys.includes(field.key)) continue;
      if (isExpired(individual[field.key])) {
        expired.push(field.label);
      }
    }

    if (Array.isArray(individual.cars)) {
      for (const car of individual.cars) {
        if (isExpired(car.insurance_exp_date)) {
          expired.push(`Seguro del vehiculo${car.plate ? " (" + car.plate + ")" : ""}`);
        }
      }
    }
  }

  if (!hasValidAuthorization(person)) {
    expired.push("Autorización de ingreso");
  }

  return expired;
}

// Devuelve el detalle de cada item chequeado (vigente o vencido, con su
// fecha), pensado para mostrar en la ficha del front - no solo la lista de
// lo vencido, sino el estado de TODO lo que se chequea.
function getExpirationDetails(person, options = {}) {
  const { excludeKeys = [] } = options;
  const individual = person?.individual;
  const details = [];

  if (!individual) return details;

  for (const field of EXPIRATION_FIELDS) {
    if (excludeKeys.includes(field.key)) continue;
    const date = individual[field.key] || null;
    details.push({
      label: field.label,
      date,
      expired: isExpired(date),
    });
  }

  if (Array.isArray(individual.cars)) {
    for (const car of individual.cars) {
      const date = car.insurance_exp_date || null;
      details.push({
        label: `Seguro del vehiculo${car.plate ? " (" + car.plate + ")" : ""}`,
        date,
        expired: isExpired(date),
      });
    }
  }

  return details;
}

export { EXPIRATION_FIELDS, isExpired, getExpiredFields, getExpirationDetails, isAuthExpired, getAuthorizationsList, hasValidAuthorization };
