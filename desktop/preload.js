// Exposed only to the setup page (a local file). Pages loaded from a server get nothing.
const { contextBridge, ipcRenderer } = require("electron");
if (location.protocol === "file:") contextBridge.exposeInMainWorld("meridian", { saveServer: (u) => ipcRenderer.invoke("save-server", u) });
