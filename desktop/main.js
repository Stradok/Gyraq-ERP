// A thin, locked-down window around the web app. All business logic, offline storage and sync live in the web app
// (service worker + outbox), so the desktop app works offline for exactly the same reasons the browser does.
const { app, BrowserWindow, Menu, ipcMain, shell } = require("electron");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const path = require("node:path");

const SETUP = pathToFileURL(path.join(__dirname, "setup.html")).href;
const cfgFile = () => path.join(app.getPath("userData"), "server.json");
const asOrigin = (u) => { try { const x = new URL(u); return x.protocol === "https:" || (x.protocol === "http:" && x.hostname === "localhost") ? x.origin : null; } catch { return null; } };
// The demo installer ships a defaults.json with the demo address; the real installer ships none and starts on the setup page.
const bundled = (() => { try { return asOrigin(JSON.parse(fs.readFileSync(path.join(__dirname, "defaults.json"), "utf8")).url); } catch { return null; } })();
const readOrigin = () => { if (bundled) return bundled; try { return asOrigin(JSON.parse(fs.readFileSync(cfgFile(), "utf8")).url); } catch { return null; } };
const sameOrigin = (u, origin) => origin !== null && asOrigin(u) === origin; // null never matches anything

function show(win) { const o = readOrigin(); if (o) win.loadURL(bundled ? o + "/products/erp/distribution/overview" : o + "/login"); else win.loadURL(SETUP); }

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 860, backgroundColor: "#0b0c0e",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "preload.js") },
  });
  show(win);

  // The window may show only the setup page or the configured server. Anything else is blocked; real web links open in the browser.
  const allowedHere = (to) => to === SETUP || sameOrigin(to, readOrigin());
  win.webContents.on("will-navigate", (e, to) => { if (!allowedHere(to)) { e.preventDefault(); openSafely(to); } });
  win.webContents.on("will-redirect", (e, to) => { if (!allowedHere(to)) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => { openSafely(url); return { action: "deny" }; });
  win.webContents.session.setPermissionRequestHandler((wc, perm, cb) => cb(perm === "media" && sameOrigin(wc.getURL(), readOrigin()))); // camera for barcodes, our server only
  return win;
}

// Only plain web links ever reach the operating system's "open" handler. Other schemes (file:, smb:, ms-msdt:, custom app protocols)
// can start programs, so they are dropped.
function openSafely(url) { try { if (new URL(url).protocol === "https:") void shell.openExternal(url); } catch { /* not a URL */ } }

// The setup page sends the server address. Only that page may do this: a page loaded from the server must not be able to repoint the app.
ipcMain.handle("save-server", (e, raw) => {
  if (e.senderFrame.url !== SETUP) return { ok: false, error: "Not allowed." };
  const origin = asOrigin(String(raw).trim());
  if (!origin) return { ok: false, error: "Enter an https:// address (or http://localhost:3000)." };
  fs.writeFileSync(cfgFile(), JSON.stringify({ url: origin }));
  show(BrowserWindow.fromWebContents(e.sender));
  return { ok: true };
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: "Meridian", submenu: [
    ...(bundled ? [] : [{ label: "Change server…", click: () => { try { fs.unlinkSync(cfgFile()); } catch { /* none saved */ } BrowserWindow.getAllWindows().forEach(show); } }]),
    { role: "reload" }, { role: "quit" },
  ] }]));
  createWindow();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
