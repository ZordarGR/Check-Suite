const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("overlayBridge", {
  onData: (cb) => ipcRenderer.on("overlay-data", (_e, d) => cb(d)),
  onMode: (cb) => ipcRenderer.on("overlay-mode", (_e, m) => cb(m)),
  onDoneMsg: (cb) => ipcRenderer.on("overlay-done-msg", () => cb()),
  tick: (id) => ipcRenderer.invoke("overlay-tick", id),
  exitInteract: () => ipcRenderer.invoke("overlay-exit-interact"),
  complete: () => ipcRenderer.invoke("overlay-complete"),
  busy: (on) => ipcRenderer.invoke("overlay-busy", on)
});
