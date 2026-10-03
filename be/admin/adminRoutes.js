import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { login, logout, requireSession } from "./adminAuth.js";
import { getConfig, saveConfig, getFeConfig, saveFeConfig } from "./adminConfig.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = new Router();

router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "adminLoginPage.html"));
});

router.post("/login", login);
router.post("/logout", logout);

// Everything below here requires a valid session.
router.use(requireSession);

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "adminPage.html"));
});

router.get("/api/config", (req, res) => {
  res.json(getConfig());
});

router.post("/api/config", (req, res) => {
  const result = saveConfig(req.body);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

router.get("/api/fe-config", (req, res) => {
  res.json(getFeConfig());
});

router.post("/api/fe-config", (req, res) => {
  const result = saveFeConfig(req.body);
  if (!result.ok) {
    return res.status(400).json(result);
  }
  res.json(result);
});

export { router as adminRouter };
