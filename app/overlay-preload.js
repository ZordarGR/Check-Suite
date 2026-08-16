const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("overlayBridge", {
  onData: (cb) => ipcRenderer.on("overlay-data", (_e, d) => cb(d)),
  onMode: (cb) => ipcRenderer.on("overlay-mode", (_e, m) => cb(m)),
  tick: (id) => ipcRenderer.invoke("overlay-tick", id),
  exitInteract: () => ipcRenderer.invoke("overlay-exit-interact")
});
