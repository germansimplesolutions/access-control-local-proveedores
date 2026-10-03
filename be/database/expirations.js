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

// Devuelve la lista de cosas vencidas en formato legible, por ejemplo:
// ["ART", "Seguro del vehiculo (AA123BB)"]
function getExpiredFields(person) {
  const expired = [];
  const individual = person?.individual;

  if (!individual) return expired;

  for (const field of EXPIRATION_FIELDS) {
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

  return expired;
}

// Devuelve el detalle de cada item chequeado (vigente o vencido, con su
// fecha), pensado para mostrar en la ficha del front - no solo la lista de
// lo vencido, sino el estado de TODO lo que se chequea.
function getExpirationDetails(person) {
  const individual = person?.individual;
  const details = [];

  if (!individual) return details;

  for (const field of EXPIRATION_FIELDS) {
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

export { EXPIRATION_FIELDS, isExpired, getExpiredFields, getExpirationDetails };
