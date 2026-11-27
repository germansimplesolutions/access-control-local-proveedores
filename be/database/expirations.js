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

// --- Vencimientos obligatorios u opcionales (panel /admin) ---
// Obligatorio: si esta vencido, o no tiene fecha cargada, NO abre.
// Excepcion: registro de conducir sin fecha cargada abre igual (solo
// bloquea si esta cargado y vencido).
// Opcional: nunca bloquea, solo se muestra en la ficha.
// Sin configurar = obligatorio.
const REQUIRED_ENV_KEYS = {
  art_date: "EXP_ART_REQUIRED",
  cert_penalty_date: "EXP_CERT_REQUIRED",
  drive_license_exp_date: "EXP_LICENSE_REQUIRED",
  insurance_exp_date: "EXP_INSURANCE_REQUIRED",
};

function isRequired(key) {
  return process.env[REQUIRED_ENV_KEYS[key]] !== "0";
}

function hasDate(dateStr) {
  return Boolean(dateStr) && !isNaN(new Date(dateStr + "T00:00:00").getTime());
}

function buildDetail(key, label, date, { blocksWhenMissing = true } = {}) {
  const missing = !hasDate(date);
  const expired = !missing && isExpired(date);
  const required = isRequired(key);
  const blocking = required && (expired || (missing && blocksWhenMissing));
  return { label, date: missing ? null : date, missing, expired, required, blocking };
}

// Detalle de cada item chequeado, para la ficha y para decidir la apertura.
// options.excludeKeys: claves que no se chequean aca - pensado para cuando
// Taker esta activo y reemplaza esa validacion por su propia consulta (ver
// ../taker/takerClient.js y sus usos en faceIDController.js/databaseRoutes.js).
function getExpirationDetails(person, options = {}) {
  const { excludeKeys = [] } = options;
  const individual = person?.individual || {};
  const details = [];

  for (const field of EXPIRATION_FIELDS) {
    if (excludeKeys.includes(field.key)) continue;
    details.push(buildDetail(field.key, field.label, individual[field.key], {
      blocksWhenMissing: field.key !== "drive_license_exp_date",
    }));
  }

  const cars = Array.isArray(individual.cars) ? individual.cars : [];

  for (const car of cars) {
    const label = `Seguro del vehiculo${car.plate ? " (" + car.plate + ")" : ""}`;
    details.push(buildDetail("insurance_exp_date", label, car.insurance_exp_date));
  }

  // Sin vehiculo cargado no hay seguro que exigir: se muestra "Sin datos"
  // pero no bloquea (si no, nadie que entre a pie podria ingresar).
  if (cars.length === 0) {
    details.push(buildDetail("insurance_exp_date", "Seguro del vehiculo", null, { blocksWhenMissing: false }));
  }

  return details;
}

// Motivos por los que NO se abre la puerta. La autorizacion de ingreso es
// siempre obligatoria.
function getBlockingReasons(person, options = {}) {
  const reasons = getExpirationDetails(person, options)
    .filter((item) => item.blocking)
    .map((item) => (item.missing ? `${item.label} (sin datos)` : item.label));

  if (!hasValidAuthorization(person)) {
    reasons.push("Autorización de ingreso");
  }

  return reasons;
}

export { EXPIRATION_FIELDS, isExpired, getBlockingReasons, getExpirationDetails, isAuthExpired, getAuthorizationsList, hasValidAuthorization };
