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
/* The room database mirrored into the app's own folder. Obfuscated, not encrypted — the
   key is in the program. Named for what it is so nobody reading this assumes otherwise. */
contextBridge.exposeInMainWorld("reccheckRooms", {
  read: () => ipcRenderer.invoke("rooms-read"),
  write: (obj) => ipcRenderer.invoke("rooms-write", obj)
});
contextBridge.exposeInMainWorld("reccheckOverlay", {
  toggle: () => ipcRenderer.invoke("overlay-toggle"),
  state: () => ipcRenderer.invoke("overlay-state"),
  setData: (d) => ipcRenderer.invoke("overlay-data", d),
  onState: (cb) => ipcRenderer.on("overlay-state-changed", (_e, on) => cb(on)),
  hotkeyGet: () => ipcRenderer.invoke("overlay-hotkey-get"),
  hotkeySet: (acc) => ipcRenderer.invoke("overlay-hotkey-set", acc),
  ihotkeyGet: () => ipcRenderer.invoke("overlay-ihotkey-get"),
  ihotkeySet: (acc) => ipcRenderer.invoke("overlay-ihotkey-set", acc),
  onTick: (cb) => ipcRenderer.on("reccheck-overlay-tick", (_e, id) => cb(id))
});
contextBridge.exposeInMainWorld("reccheckShortcuts", {
  get: () => ipcRenderer.invoke("sc-get"),
  detect: (action) => ipcRenderer.invoke("sc-detect", action),
  cancel: () => ipcRenderer.invoke("sc-cancel"),
  diag: (ms) => ipcRenderer.invoke("sc-diag", ms),
  scan: (ms) => ipcRenderer.invoke("sc-scan", ms),
  helper: () => ipcRenderer.invoke("sc-helper"),
  tauLog: () => ipcRenderer.invoke("sc-taulog"),
  watchLog: () => ipcRenderer.invoke("sc-watchlog"),
  readList: (ms, rows) => ipcRenderer.invoke("sc-readlist", ms, rows),
  inhouse: (rows) => ipcRenderer.invoke("sc-inhouse", rows),
  tauEnterSet: (on, delay) => ipcRenderer.invoke("sc-tauenter-set", on, delay),
  bootSet: (on) => ipcRenderer.invoke("sc-boot-set", on),
  focusSet: (on, needle) => ipcRenderer.invoke("sc-focus-set", on, needle),
  focusPick: (ms) => ipcRenderer.invoke("sc-focus-pick", ms),
  clear: (action) => ipcRenderer.invoke("sc-clear", action),
  profileAdd: (name) => ipcRenderer.invoke("sc-profile-add", name),
  profileRename: (id, name) => ipcRenderer.invoke("sc-profile-rename", id, name),
  profileDelete: (id) => ipcRenderer.invoke("sc-profile-delete", id),
  profileSelect: (id) => ipcRenderer.invoke("sc-profile-select", id)
});
contextBridge.exposeInMainWorld("reccheckApp", {
  setLang: (l) => ipcRenderer.invoke("app-set-lang", l)
});
contextBridge.exposeInMainWorld("reccheckHelp", {
  open: () => ipcRenderer.invoke("open-help")
});
