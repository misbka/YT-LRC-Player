/* App Electron do YT Player
 * Reusa o mesmo servidor (server.js) e frontend (public/) da versão web.
 */
const { app, BrowserWindow, shell, session, Menu } = require("electron");
const path = require("path");
const net = require("net");

// Evita múltiplas instâncias do app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main() {
  app.whenReady().then(async () => {
    // User-Agent do Chrome — sem ele, o YouTube pode recusar o embed no Electron.
    session.defaultSession.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    );

    // Sobe o servidor local em uma porta livre.
    const port = await getFreePort();
    process.env.PORT = String(port);
    require(path.join(__dirname, "..", "server.js")).start(port);

    createWindow(`http://localhost:${port}`);
    buildMenu();
  });

  // macOS: reabrir janela ao clicar no ícone do dock.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(`http://localhost:${process.env.PORT}`);
    }
  });

  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

let mainWindow = null;

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: "#0e0f13",
    autoHideMenuBar: true,
    title: "YT Player",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Links que abrem nova janela (ex.: links do YouTube) vão pro navegador padrão.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.loadURL(url);
}

/** Menu mínimo com atalhos de recarregar/devtools (o menu fica oculto). */
function buildMenu() {
  const template = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
    {
      label: "Exibir",
      submenu: [
        { role: "reload", accelerator: "F5" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Escolhe uma porta TCP livre no momento do start. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}
