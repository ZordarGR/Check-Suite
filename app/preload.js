const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("reccheckUpdate", {
  onReady: (cb) => ipcRenderer.on("reccheck-update-ready", (_e, info) => cb(info)),
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
contextBridge.exposeInMainWorld("reccheckHelp", {
  open: () => ipcRenderer.invoke("open-help")
});
