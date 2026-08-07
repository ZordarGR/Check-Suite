const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("reccheckUpdate", {
  onReady: (cb) => ipcRenderer.on("reccheck-update-ready", (_e, info) => cb(info)),
  apply: () => ipcRenderer.invoke("reccheck-apply-update"),
  version: () => ipcRenderer.invoke("reccheck-get-version")
});
contextBridge.exposeInMainWorld("reccheckFiles", {
  getDir: () => ipcRenderer.invoke("files-get-dir"),
  pickDir: () => ipcRenderer.invoke("files-pick-dir"),
  list: () => ipcRenderer.invoke("files-list"),
  read: (p) => ipcRenderer.invoke("files-read", p),
  onDirEvent: (cb) => ipcRenderer.on("reccheck-dir-event", () => cb())
});
contextBridge.exposeInMainWorld("reccheckHelp", {
  open: () => ipcRenderer.invoke("open-help")
});
