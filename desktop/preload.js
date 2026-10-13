const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("meridian", { saveServer: (u) => ipcRenderer.invoke("save-server", u), resetServer: () => ipcRenderer.invoke("reset-server") });
