import crypto from "crypto";

// A real login with a real logout, instead of HTTP Basic Auth.
//
// Basic Auth has no logout: once a browser sends the right credentials
// once, it keeps re-sending them automatically on every request to this
// path, forever, until the whole browser is closed (not just the tab).
// On a shared computer (a guard post, a lobby PC) that's a real problem.
//
// Sessions here are an in-memory token -> expiry map. There's no database
// involved on purpose - it's fine for this: if the process restarts,
// everyone just has to log in again, same as any single-server app without
// a shared session store.
const SESSION_IDLE_MS = 20 * 60 * 1000; // 20 minutes of inactivity
const SESSION_COOKIE = "admin_session";

const sessions = new Map(); // token -> expiresAt (epoch ms)

function createSession() {
  const token = crypto.randomUUID();
  sessions.set(token, Date.now() + SESSION_IDLE_MS);
  return token;
}

// Sliding expiration: every valid request pushes the expiry forward another
// 20 minutes, so an active user is never logged out mid-work, but walking
// away for 20+ minutes (or closing the browser and coming back later) means
// logging in again.
function touchSession(token) {
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  sessions.set(token, Date.now() + SESSION_IDLE_MS);
  return true;
}

function destroySession(token) {
  sessions.delete(token);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach(pair => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function checkCredentials(user, pass) {
  const expectedUser = process.env.ADMIN_USER || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD || "admin";

  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    console.warn(
      "ADVERTENCIA: el panel de configuración (/admin) está usando usuario/contraseña por defecto (admin/admin). " +
      "Configurá ADMIN_USER y ADMIN_PASSWORD en el .env-be."
    );
  }

  return user === expectedUser && pass === expectedPass;
}

function login(req, res) {
  const { user, pass } = req.body || {};
  if (!checkCredentials(user, pass)) {
    return res.status(401).json({ ok: false, error: "Usuario o contraseña incorrectos." });
  }
  const token = createSession();
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    maxAge: SESSION_IDLE_MS
  });
  res.json({ ok: true });
}

function logout(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) destroySession(token);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
}

// Gate for everything under /admin except the login/logout endpoints
// themselves. Not logged in (or session expired) → API calls get a plain
// 401 JSON (so the page's JS can redirect to the login screen itself),
// page loads get redirected there directly.
function requireSession(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];

  if (token && touchSession(token)) {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ ok: false, error: "Sesión no iniciada o vencida." });
  }
  return res.redirect("/admin/login");
}

export { login, logout, requireSession };
