const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("reccheckUpdate", {
  onReady: (cb) => ipcRenderer.on("reccheck-update-ready", (_e, info) => cb(info)),
  onProgress: (cb) => ipcRenderer.on("reccheck-update-progress", (_e, p) => cb(p)),
  apply: () => ipcRenderer.invoke("reccheck-apply-update"),
  version: () => ipcRenderer.invoke("reccheck-get-version")
});
contextBridge.exposeInMainWorld("reccheckFiles", {
  getDir: () => ipcRenderer.invoke("files-get-dir"),
  pickDir: () => ipcRenderer.invoke("files-pick-dir"),
  list: (rel) => ipcRenderer.invoke("files-list", rel),
  read: (p) => ipcRenderer.invoke("files-read", p),
  stat: (p) => ipcRenderer.invoke("files-stat", p),
  onDirEvent: (cb) => ipcRenderer.on("reccheck-dir-event", () => cb())
});
contextBridge.exposeInMainWorld("reccheckOverlay", {
  toggle: () => ipcRenderer.invoke("overlay-toggle"),
  state: () => ipcRenderer.invoke("overlay-state"),
  setData: (d) => ipcRenderer.invoke("overlay-data", d),
  onState: (cb) => ipcRenderer.on("overlay-state-changed", (_e, on) => cb(on))
});
contextBridge.exposeInMainWorld("reccheckApp", {
  setLang: (l) => ipcRenderer.invoke("app-set-lang", l)
});
contextBridge.exposeInMainWorld("reccheckHelp", {
  open: () => ipcRenderer.invoke("open-help")
});
