const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("capsBridge", {
  onFlash: (cb) => ipcRenderer.on("caps-flash", (_e, s) => cb(s)),
  gone: () => ipcRenderer.invoke("caps-gone")
});
