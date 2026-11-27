// Arma windows-app/backend a partir de ../be y del build de ../fe, para que el
// codigo viva en un solo lugar (Docker y Windows salen de la misma fuente).
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..", "..");
const beDir = path.join(root, "be");
const feDir = path.join(root, "fe");
const outDir = path.join(__dirname, "..", "backend");

// Sin VITE_HOST: el front usa la misma direccion desde la que se abre.
const env = { ...process.env, VITE_HOST: "" };
execSync("npm install", { cwd: feDir, stdio: "inherit" });
execSync("npm run build", { cwd: feDir, stdio: "inherit", env });

fs.rmSync(outDir, { recursive: true, force: true });

// Nunca empaquetar datos ni configuracion real de esta PC.
const SKIP = new Set(["node_modules", ".env-be", ".env-fe", ".env", "images", "uploads", "database.json", "taker_token.json"]);
fs.cpSync(beDir, outDir, { recursive: true, filter: (src) => !SKIP.has(path.basename(src)) });
fs.cpSync(path.join(feDir, "dist"), path.join(outDir, "fe-dist"), { recursive: true });

