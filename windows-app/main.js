const { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { autoUpdater } = require("electron-updater");

// -----------------------------------------------------------------------
// Dónde vive la configuración editable (.env-be / .env-fe) y todo lo que el
// backend escribe en tiempo de ejecución (fotos cacheadas, cola de
// movimientos pendientes). NUNCA dentro de la carpeta de instalación
// (Program Files): ahí Windows no deja escribir a un usuario normal, y un
// update de la app podría borrar esos archivos. Se usa la carpeta de datos
// de usuario que Electron ya resuelve para cada SO:
//   Windows: C:\Users\<usuario>\AppData\Roaming\Face ID Proveedores
const userDataDir = app.getPath("userData");
const dataDir = path.join(userDataDir, "calocal-data");
const envBePath = path.join(dataDir, ".env-be");
const envFePath = path.join(dataDir, ".env-fe");
const uploadsDir = path.join(dataDir, "uploads");
const imagesDir = path.join(dataDir, "images");
const databaseDir = path.join(dataDir, "database");

const BACKEND_DIR = path.join(__dirname, "backend");

// La pantalla principal (fotos de entrada/salida) pinta bien una vez y
// después queda en blanco - el patrón clásico de un crash del proceso de
// GPU de Chromium que no puede repintar (muy común en PCs de Windows con
// drivers de video viejos/integrados, máquinas virtuales o acceso remoto
// tipo RDP/VNC - exactamente donde suelen vivir estos kioscos). Forzar
// renderizado por software evita ese crash a costa de un poco más de CPU,
// intrascendente para esta pantalla (no hay animaciones ni video). Tiene
// que llamarse ANTES de app.whenReady().
app.disableHardwareAcceleration();

let mainWindow = null;
let tray = null;
let backendPort = "3888";
let quittingForReal = false;

function ensureDataDirs() {
  for (const dir of [dataDir, uploadsDir, imagesDir, databaseDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(envBePath)) {
    const examplePath = path.join(BACKEND_DIR, ".env-example");
    fs.copyFileSync(examplePath, envBePath);
    // copyFileSync puede arrastrar el atributo "solo lectura" del archivo
    // empaquetado en la instalación - nos aseguramos de que la copia en la
    // carpeta de datos del usuario quede siempre escribible.
    try {
      fs.chmodSync(envBePath, 0o666);
    } catch (err) {
      // best-effort
    }
  }

  if (!fs.existsSync(envFePath)) {
    fs.writeFileSync(envFePath, 'VITE_HOST="http://localhost:3888"\n');
  }
}

function readPortFromEnvBe() {
  try {
    const content = fs.readFileSync(envBePath, "utf8");
    const match = content.match(/^\s*PORT\s*=\s*(\d+)/m);
    if (match) return match[1];
  } catch (err) {
    // keep default
  }
  return "3888";
}

async function startBackend() {
  ensureDataDirs();
  backendPort = readPortFromEnvBe();

  // Variables que el backend ya sabe leer (ver loadEnv.js / adminConfig.js
  // en el repo): esto es lo que redirige TODO lo editable y todo lo
  // escribible hacia la carpeta de datos de usuario en vez de la carpeta
  // de instalación, sin tocar una sola línea del backend.
  process.env.ENV_FILE_PATH = envBePath;
  process.env.ENV_FE_FILE_PATH = envFePath;

  // multer ("uploads/") y PENDING_MOVEMENTS_PATH ("./uploads/...") en
  // sync.js, y "./images/..." en faceIDController.js/events.js/sync.js,
  // son todos paths relativos al cwd del proceso. Cambiando el cwd del
  // proceso de Electron ANTES de levantar el backend, esos paths
  // relativos caen solos dentro de la carpeta de datos de usuario.
  process.chdir(dataDir);

  // El backend es un módulo ESM ("type": "module" en su package.json);
  // import() dinámico es la forma correcta de cargarlo desde este archivo
  // (CommonJS) del proceso principal de Electron.
  const backendIndexUrl = pathToFileURL(path.join(BACKEND_DIR, "index.js")).href;
  await import(backendIndexUrl);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, "assets", "icon.ico"),
    title: "Face ID Proveedores",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // Los console.log/warn/error que corren DENTRO de la pantalla (React, el
  // navegador embebido) no se ven en ningún lado en un kiosko sin devtools -
  // los reenviamos al console.* del proceso principal, que a esta altura ya
  // está envuelto por backend/index.js (ver startBackend) y manda todo al
  // buffer en memoria de la pestaña Logs del panel admin. Así un error de
  // React (pantalla en blanco, etc.) queda visible ahí en vez de perderse.
  const rendererLevelToConsole = ["log", "warn", "error", "debug"];
  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    const fn = console[rendererLevelToConsole[level]] || console.log;
    fn(`[pantalla] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on("render-process-gone", (event, details) => {
    console.error(`[pantalla] render-process-gone: ${JSON.stringify(details)}`);
  });

  mainWindow.loadURL(`http://localhost:${backendPort}/ficha`);

  // Cerrar la ventana (la X) la oculta en vez de cerrar la app: el backend
  // sigue corriendo en segundo plano (el ícono de la bandeja la vuelve a
  // mostrar). Solo "Salir" desde la bandeja cierra todo de verdad.
  mainWindow.on("close", (event) => {
    if (!quittingForReal) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function openAdminPanel() {
  shell.openExternal(`http://localhost:${backendPort}/admin/login`);
}

function showScreen(route) {
  if (!mainWindow) return;
  mainWindow.loadURL(`http://localhost:${backendPort}${route}`);
  mainWindow.show();
  mainWindow.focus();
}

// --- Actualizaciones automaticas ----------------------------------------
// Al arrancar y cada hora busca una version nueva en GitHub Releases (ver
// "publish" en package.json), la descarga sola y la instala en silencio
// cuando pasan 2 minutos sin ingresos. La configuracion y los datos estan en
// AppData, asi que no se pierden al actualizar.
const UPDATE_CHECK_MS = 60 * 60 * 1000;
const IDLE_BEFORE_INSTALL_MS = 2 * 60 * 1000;
let installTimer = null;

function checkForUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((err) => {
    console.error(`[update] no se pudo buscar actualizaciones: ${err.message}`);
  });
}

function installWhenIdle() {
  const idleFor = Date.now() - (globalThis.lastAccessEventAt || 0);
  if (idleFor < IDLE_BEFORE_INSTALL_MS) return;

  clearInterval(installTimer);
  console.log("[update] instalando la version nueva y reiniciando...");
  quittingForReal = true;
  autoUpdater.quitAndInstall(true, true); // silencioso y vuelve a abrir sola
}

function startAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (info) => console.log(`[update] hay version nueva ${info.version}, descargando...`));
  autoUpdater.on("update-not-available", () => console.log(`[update] sin novedades (v${app.getVersion()}).`));
  autoUpdater.on("error", (err) => console.error(`[update] error: ${err.message}`));
  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[update] version ${info.version} descargada, se instala cuando no haya movimiento.`);
    clearInterval(installTimer);
    installTimer = setInterval(installWhenIdle, 15000);
  });
  checkForUpdates();
  setInterval(checkForUpdates, UPDATE_CHECK_MS);
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, "assets", "tray-icon.png"));
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  tray.setToolTip(`Face ID Proveedores v${app.getVersion()}`);

  const contextMenu = Menu.buildFromTemplate([
    { label: `Versión ${app.getVersion()}`, enabled: false },
    { label: "Abrir ficha de la persona", click: () => showScreen("/ficha") },
    { label: "Abrir tablero de entradas/salidas", click: () => showScreen("/") },
    {
      label: "Abrir configuración (panel admin)",
      click: openAdminPanel,
    },
    { type: "separator" },
    {
      label: "Abrir carpeta de datos (config, fotos)",
      click: () => {
        shell.openPath(dataDir);
      },
    },
    { type: "separator" },
    {
      label: "Iniciar con Windows",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    { label: "Buscar actualizaciones", click: () => checkForUpdates() },
    { type: "separator" },
    {
      label: "Salir",
      click: () => {
        quittingForReal = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on("second-instance", () => {
  // Ya hay una instancia corriendo: traemos su ventana al frente en vez de
  // abrir una segunda (dos backends compitiendo por el mismo puerto, 2
  // íconos de bandeja, etc.).
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    try {
      await startBackend();
    } catch (err) {
      dialog.showErrorBox(
        "Error al iniciar",
        "No se pudo iniciar el servicio de control de acceso:\n\n" + (err && err.stack ? err.stack : String(err))
      );
      app.quit();
      return;
    }

    createWindow();
    createTray();
    startAutoUpdates();
  });

  app.on("window-all-closed", (event) => {
    // No cerramos la app al cerrar la ventana: sigue en la bandeja. Esto
    // solo importa en macOS/Linux porque en Windows "close" ya está
    // interceptado arriba (mainWindow.on("close", ...)).
    event.preventDefault?.();
  });

  app.on("before-quit", () => {
    quittingForReal = true;
  });
}
