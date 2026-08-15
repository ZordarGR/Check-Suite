const {contextBridge, ipcRenderer} = require("electron");
contextBridge.exposeInMainWorld("reccheckUpdate", {
  onReady: (cb) => ipcRenderer.on("reccheck-update-ready", (_e, info) => cb(info)),
  onProgress: (cb) => ipcRenderer.on("reccheck-update-progress", (_e, p) => cb(p)),
  apply: () => ipcRenderer.invoke("reccheck-apply-update"),
  version: () => ipcRenderer.invoke("reccheck-get-version")
});
contextBridge.exposeInMainWorld("reccheckFiles", {
  getDir: (profile) => ipcRenderer.invoke("files-get-dir", profile),
  pickDir: (profile) => ipcRenderer.invoke("files-pick-dir", profile),
  list: (profile, rel) => ipcRenderer.invoke("files-list", profile, rel),
  read: (profile, p) => ipcRenderer.invoke("files-read", profile, p),
  stat: (profile, p) => ipcRenderer.invoke("files-stat", profile, p),
  perTool: true,
  onDirEvent: (cb) => ipcRenderer.on("reccheck-dir-event", (_e, profile) => cb(profile))
});
contextBridge.exposeInMainWorld("reccheckOverlay", {
  toggle: () => ipcRenderer.invoke("overlay-toggle"),
  state: () => ipcRenderer.invoke("overlay-state"),
  setData: (d) => ipcRenderer.invoke("overlay-data", d),
  onState: (cb) => ipcRenderer.on("overlay-state-changed", (_e, on) => cb(on)),
  hotkeyGet: () => ipcRenderer.invoke("overlay-hotkey-get"),
  hotkeySet: (acc) => ipcRenderer.invoke("overlay-hotkey-set", acc)
});
contextBridge.exposeInMainWorld("reccheckApp", {
  setLang: (l) => ipcRenderer.invoke("app-set-lang", l)
});
contextBridge.exposeInMainWorld("reccheckHelp", {
  open: () => ipcRenderer.invoke("open-help")
});
