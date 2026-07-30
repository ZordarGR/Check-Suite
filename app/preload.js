const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("reccheckUpdate", {
  onReady: (cb) => ipcRenderer.on("reccheck-update-ready", (_e, info) => cb(info)),
  apply: () => ipcRenderer.invoke("reccheck-apply-update"),
  version: () => ipcRenderer.invoke("reccheck-get-version")
});
