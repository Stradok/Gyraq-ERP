// A thin, locked-down window around the web app. All business logic, offline storage and sync live in the web app
// (service worker + outbox), so the desktop app works offline for exactly the same reasons the browser does.
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const cfgFile = () => path.join(app.getPath("userData"), "server.json");
const readUrl = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), "utf8")).url; } catch { return null; } };
const asOrigin = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.hostname === "localhost" ? x.origin : null; } catch { return null; } };

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 860, backgroundColor: "#0b0c0e", autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "preload.js") },
  });
  const url = readUrl();
  const allowed = url ? asOrigin(url) : null;
  if (url && allowed) win.loadURL(url); else win.loadFile(path.join(__dirname, "setup.html"));

  // The window may only ever show the setup page or the configured server; links to anywhere else open in the real browser.
  win.webContents.on("will-navigate", (e, to) => { if (!to.startsWith("file://") && asOrigin(to) !== allowed) { e.preventDefault(); shell.openExternal(to); } });
  win.webContents.setWindowOpenHandler(({ url: to }) => { if (to.startsWith("https://")) shell.openExternal(to); return { action: "deny" }; });
  win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media")); // camera for barcode scanning only
}

// The setup page sends the server address here. Only https (or localhost for a demo on this PC) is accepted.
ipcMain.handle("save-server", (_e, raw) => {
  const origin = asOrigin(String(raw).trim());
  if (!origin) return { ok: false, error: "Enter an https:// address (or http://localhost:3000)." };
  fs.writeFileSync(cfgFile(), JSON.stringify({ url: origin + "/login" }));
  BrowserWindow.getAllWindows().forEach((w) => w.loadURL(origin + "/login"));
  return { ok: true };
});
ipcMain.handle("reset-server", () => { try { fs.unlinkSync(cfgFile()); } catch { /* none saved */ } app.relaunch(); app.exit(0); });

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
