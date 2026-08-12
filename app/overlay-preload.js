const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("overlayBridge", {
  onData: (cb) => ipcRenderer.on("overlay-data", (_e, d) => cb(d))
});
