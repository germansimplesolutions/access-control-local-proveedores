// Cliente del API de Taker (verificación de cobertura/seguro de un
// tercero). Cuando está activo (config del panel admin, ver adminConfig.js/
// adminPage.html), reemplaza la validación local de ART y Certificado de
// reincidencia (ver expirations.js, options.excludeKeys) por una consulta
// en vivo a /cobertura, y además notifica cada acceso a /acceso.
//
// Las URLs de los 3 endpoints, el "Taker ID" (que Taker usa como "barrio" -
// varía según el barrio/cliente, lo pone el admin a mano) y las
// credenciales son 3 campos separados + usuario/contraseña, configurables
// desde el panel (TAKER_*).
import axios from "axios";
import fs from "fs";
import path from "path";

// El token de /auth/login no parece expirar (confirmado con el usuario) -
// se guarda en memoria y además en disco (mismo estilo simple que
// personDatabase.js) para no tener que loguearse de nuevo en cada reinicio
// del contenedor. Se vuelve a pedir solo cuando una request falla con 401.
const TOKEN_FILE_PATH = process.env.TAKER_TOKEN_FILE_PATH || "./database/taker_token.json";

let cachedToken = null;

function readTokenFromDisk() {
  try {
    if (!fs.existsSync(TOKEN_FILE_PATH)) return null;
    const raw = fs.readFileSync(TOKEN_FILE_PATH, "utf-8");
    if (!raw || raw.trim() === "") return null;
    const parsed = JSON.parse(raw);
    return parsed.access_token || null;
  } catch (error) {
    console.error("Taker: error leyendo el token guardado:", error);
    return null;
  }
}

function writeTokenToDisk(token) {
  try {
    const dir = path.dirname(TOKEN_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify({ access_token: token }, null, 2));
  } catch (error) {
    console.error("Taker: error guardando el token:", error);
  }
}

// Mensaje genérico para cuando Taker no responde o devuelve algo que no es
// un error puntual de la persona (timeout, caída, 500, etc.) - decisión
// explícita del usuario: en ese caso se bloquea el acceso igual (fail
// closed) pero sin mostrar un error técnico en pantalla.
const GENERIC_DOWN_MESSAGE = "No se ha podido consultar la informacion. Contactese con TAKER";

// Toda llamada a Taker tiene este timeout - el usuario confirmó que Taker
// nunca debería tardar más de 10 segundos "ni a palos"; se deja un poco por
// debajo para que, si Taker se cuelga, todavía quede margen para contestar
// el remoteCheck del equipo dentro de SU propio timeout (configurado en el
// equipo, fuera de este código).
const REQUEST_TIMEOUT_MS = 8000;

// Cache muy corta por documento: la misma consulta de cobertura se usa dos
// veces por cada identificación (una para decidir si se abre la puerta,
// ver respondToRemoteCheck en faceIDController.js, y otra instantes después
// para mostrar el resultado en la ficha, ver databaseRoutes.js) - sin esto
// se le pegaría dos veces a Taker por el mismo evento. TTL corto a
// propósito: es para esas dos llamadas casi simultáneas, no para evitar
// consultar de nuevo en una identificación posterior.
const COBERTURA_CACHE_TTL_MS = 15000;
const coberturaCache = new Map();

function getTakerConfig() {
  return {
    enabled: process.env.TAKER_ENABLED === "1",
    loginUrl: process.env.TAKER_LOGIN_URL || "",
    coberturaUrl: process.env.TAKER_COBERTURA_URL || "",
    accesoUrl: process.env.TAKER_ACCESO_URL || "",
    takerId: process.env.TAKER_ID || "",
    user: process.env.TAKER_USER || "",
    pass: process.env.TAKER_PASS || "",
  };
}

async function login() {
  const config = getTakerConfig();

  if (!config.loginUrl || !config.user || !config.pass) {
    console.error("Taker: falta configurar la URL de login, usuario o contraseña - no se puede loguear.");
    return null;
  }

  try {
    const response = await axios.post(
      config.loginUrl,
      { username: config.user, password: config.pass },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const token = response.data?.access_token || null;

    if (!token) {
      console.error("Taker: login respondió sin access_token.");
      return null;
    }

    cachedToken = token;
    writeTokenToDisk(token);

    return token;
  } catch (error) {
    console.error("Taker: error haciendo login:", error.response?.data || error.message);
    return null;
  }
}

async function getToken() {
  if (cachedToken) return cachedToken;

  const fromDisk = readTokenFromDisk();
  if (fromDisk) {
    cachedToken = fromDisk;
    return cachedToken;
  }

  return login();
}

function invalidateToken() {
  cachedToken = null;
}

// Hace una request autenticada contra Taker, reintentando una sola vez con
// un token nuevo si la primera respondió 401 (token vencido/inválido).
async function authenticatedRequest(requestFn) {
  let token = await getToken();

  if (!token) {
    return { down: true };
  }

  try {
    const response = await requestFn(token);
    return { response };
  } catch (error) {
    if (error.response?.status === 401) {
      invalidateToken();
      const newToken = await login();

      if (!newToken) {
        return { down: true };
      }

      try {
        const response = await requestFn(newToken);
        return { response };
      } catch (retryError) {
        return errorToResult(retryError);
      }
    }

    return errorToResult(error);
  }
}

function errorToResult(error) {
  if (error.response) {
    // Taker respondió con un error puntual (404 documento no encontrado,
    // 403 cobertura/póliza vencida, etc. - confirmado con pruebas reales,
    // siempre con forma { statusCode, message }). No es una caída de Taker.
    return { response: error.response };
  }
  // Sin respuesta - timeout, Taker caído, error de red.
  return { down: true };
}

// Consulta si la persona tiene cobertura vigente. Devuelve:
// - { ok: true } si Taker confirma cobertura.
// - { ok: false, message } si Taker respondió con un error puntual de esa
//   persona (documento no encontrado, póliza vencida, etc.) - message es el
//   texto que mandó Taker, para mostrarlo tal cual en la ficha.
// - { ok: false, message: GENERIC_DOWN_MESSAGE, down: true } si Taker no
//   respondió o dio un error inesperado (no puntual de la persona).
async function checkCobertura(documento) {
  const cached = coberturaCache.get(documento);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const config = getTakerConfig();

  if (!config.coberturaUrl) {
    console.error("Taker: falta configurar la URL de /cobertura.");
    return { ok: false, message: GENERIC_DOWN_MESSAGE, down: true };
  }

  const { response, down } = await authenticatedRequest((token) =>
    axios.get(config.coberturaUrl, {
      params: { documento, barrio: config.takerId },
      headers: { Authorization: `Bearer ${token}` },
      timeout: REQUEST_TIMEOUT_MS,
    })
  );

  let result;

  if (down) {
    result = { ok: false, message: GENERIC_DOWN_MESSAGE, down: true };
  } else if (response.status >= 200 && response.status < 300) {
    result = { ok: true };
  } else {
    // Error puntual de la persona (404, 403, etc. con { statusCode, message }).
    const message = response.data?.message || response.data?.error || GENERIC_DOWN_MESSAGE;
    result = { ok: false, message };
  }

  coberturaCache.set(documento, { result, expiresAt: Date.now() + COBERTURA_CACHE_TTL_MS });

  return result;
}

// Notifica un acceso (entrada o salida) a Taker - "ademas de todo lo que ya
// hacemos hoy" (logs locales/plataforma central, sin cambios). Taker decide
// él mismo si es entrada o salida según el último estado que tenga de esa
// persona (su propia respuesta trae "salida": true/false) - acá no se le
// manda esa información. Falla en silencio (no corta ni afecta el resto del
// flujo): esto es un efecto secundario, no algo que pueda bloquear un
// acceso que ya se decidió.
async function registerAcceso(documentNumber) {
  const config = getTakerConfig();

  if (!config.accesoUrl) {
    console.error("Taker: falta configurar la URL de /acceso.");
    return;
  }

  try {
    const { response, down } = await authenticatedRequest((token) =>
      axios.post(
        config.accesoUrl,
        { documentNumber },
        { headers: { Authorization: `Bearer ${token}` }, timeout: REQUEST_TIMEOUT_MS }
      )
    );

    if (down) {
      console.error(`Taker: no se pudo notificar /acceso para ${documentNumber} (sin respuesta).`);
      return;
    }

    if (response.status >= 200 && response.status < 300) {
      console.log(`Taker: /acceso notificado para ${documentNumber}.`);
    } else {
      console.error(`Taker: /acceso para ${documentNumber} respondió ${response.status}:`, response.data);
    }
  } catch (error) {
    console.error(`Taker: error notificando /acceso para ${documentNumber}:`, error.message);
  }
}

export { getTakerConfig, checkCobertura, registerAcceso, GENERIC_DOWN_MESSAGE };
