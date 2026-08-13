const {app, BrowserWindow, ipcMain, shell, dialog, screen, Tray, Menu, globalShortcut} = require("electron");
const {spawn} = require("child_process");
const path = require("path");
const {pathToFileURL} = require("url");
const {Updater} = require("./updater.js");
const {FileHub} = require("./files.js");

const PKG_VERSION = require("./package.json").version;
const REPO_RAW = "https://raw.githubusercontent.com/ZordarGR/Check-Suite/main";
const ISSUES_URL = "https://github.com/ZordarGR/Check-Suite/issues";

let win = null, updater = null, hub = null;
let tray = null, QUITTING = false, TRAYLANG = "en";

/* ---- single instance: a second launch just resurfaces the running one ---- */
if(!app.requestSingleInstanceLock()){
  app.exit(0);
}
app.on("second-instance", () => { if(win){ win.show(); win.focus(); } });

const TRAY_TXT = {
  en: {open: "Open RecCheck", overlay: "Toggle checklist overlay", close: "Close RecCheck"},
  gr: {open: "Άνοιγμα RecCheck", overlay: "Εναλλαγή επικάλυψης λίστας", close: "Κλείσιμο RecCheck"}
};
function showMain(){ if(win){ win.show(); win.focus(); } }

/* ---- system-wide overlay hotkey (works unfocused / from the tray) ---- */
function toggleOverlayGlobal(){
  if(overlayWin) destroyOverlay(); else createOverlay();
  try{ const c = hub.readConfig(); c.overlayOn = !!overlayWin; hub.writeConfig(c); }catch(e){}
  announceOverlayState();
}
function currentHotkey(){
  try{
    const c = hub.readConfig();
    return (c.overlayHotkey !== undefined) ? c.overlayHotkey : "Control+T";
  }catch(e){ return "Control+T"; }
}
function applyHotkey(acc){
  try{ globalShortcut.unregisterAll(); }catch(e){}
  if(!acc) return true;                        // empty = hotkey disabled
  try{ return globalShortcut.register(acc, toggleOverlayGlobal); }catch(e){ return false; }
}
function announceOverlayState(){
  if(win && !win.isDestroyed()) win.webContents.send("overlay-state-changed", !!overlayWin);
}
function buildTray(){
  if(!tray){
    tray = new Tray(path.join(__dirname, "tray.ico"));
    tray.setToolTip("RecCheck");
    tray.on("click", showMain);
    tray.on("double-click", showMain);
  }
  const L = TRAY_TXT[TRAYLANG] || TRAY_TXT.en;
  tray.setContextMenu(Menu.buildFromTemplate([
    {label: L.open, click: showMain},
    {label: L.overlay, click: () => {
      if(overlayWin) destroyOverlay(); else createOverlay();
      try{ const c = hub.readConfig(); c.overlayOn = !!overlayWin; hub.writeConfig(c); }catch(e){}
      announceOverlayState();
    }},
    {type: "separator"},
    {label: L.close, click: () => { QUITTING = true; app.quit(); }}
  ]));
}
let overlayWin = null, overlayData = null;

/* ---- desktop checklist overlay: transparent, click-through, always on top ---- */
function overlayBounds(count, cfg){
  cfg = cfg || {};
  const wa = screen.getPrimaryDisplay().workArea;
  const size = Math.min(26, Math.max(10, cfg.size || 14));
  const W = Math.min(520, Math.max(300, Math.round(340 * size / 14)));
  const lineH = Math.round(size * 1.45 + 10);
  const H = Math.min(Math.max(60, 28 + count * lineH), Math.round(wa.height * 0.7));
  const pos = cfg.pos || "tr";
  const x = (pos === "tl" || pos === "bl") ? wa.x + 12 : wa.x + wa.width - W - 12;
  const y = (pos === "bl" || pos === "br") ? wa.y + wa.height - H - 12 : wa.y + 12;
  return {x, y, width: W, height: H};
}
function createOverlay(){
  if(overlayWin) return;
  overlayWin = new BrowserWindow(Object.assign(overlayBounds((overlayData && overlayData.tasks || []).length, overlayData && overlayData.cfg), {
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, resizable: false, movable: false, hasShadow: false, show: true,
    webPreferences: {contextIsolation: true, preload: path.join(__dirname, "overlay-preload.js")}
  }));
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.loadURL(pathToFileURL(path.join(__dirname, "overlay.html")).toString());
  overlayWin.webContents.once("did-finish-load", () => {
    if(overlayData && overlayWin) overlayWin.webContents.send("overlay-data", overlayData);
  });
  overlayWin.on("closed", () => { overlayWin = null; });
}
function destroyOverlay(){
  if(overlayWin){ try{ overlayWin.destroy(); }catch(e){} overlayWin = null; }
}

function createWindow(file){
  win = new BrowserWindow({
    width: 1180,
    height: 860,
    autoHideMenuBar: true,
    backgroundColor: "#0a0e14",
    title: "REC CHECK",
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });
  win.loadURL(pathToFileURL(file).toString());
  win.webContents.once("did-finish-load", () => {
    if(updater && updater.pending)
      win.webContents.send("reccheck-update-ready", updater.pending);
  });
  win.on("close", e => {
    if(!QUITTING){ e.preventDefault(); win.hide(); }   // X hides to tray — the overlay stays up
  });
  win.on("closed", () => { win = null; destroyOverlay(); });
}

app.whenReady().then(() => {
  updater = new Updater({
    userDataDir: app.getPath("userData"),
    packagedDir: __dirname,
    pkgVersion: PKG_VERSION,
    updateUrl: (process.env.RECCHECK_UPDATE_URL || REPO_RAW + "/update/latest.json"),
    fallbackReleaseUrl: "https://github.com/ZordarGR/Check-Suite/releases/latest",
    onProgress: (p) => { if(win && !win.isDestroyed()) win.webContents.send("reccheck-update-progress", p); }
  });
  hub = new FileHub({
    configPath: path.join(app.getPath("userData"), "config.json"),
    onDirEvent: () => { if(win && !win.isDestroyed()) win.webContents.send("reccheck-dir-event"); }
  });
  hub.startWatch();
  const eff = updater.effective();
  createWindow(eff.file);
  try{ if(hub.readConfig().overlayOn) createOverlay(); }catch(e){}
  buildTray();
  applyHotkey(currentHotkey());
  updater.check().then(info => {
    if(info && win && !win.isDestroyed())
      win.webContents.send("reccheck-update-ready", info);
  });
});

ipcMain.handle("reccheck-apply-update", () => {
  if(!updater || !updater.pending) return false;
  if(updater.pending.full){
    if(updater.pending.downloaded && updater.pending.setupPath){
      // run the downloaded installer silently; it relaunches the app when done
      try{
        const child = spawn(updater.pending.setupPath, ["/S"], {detached: true, stdio: "ignore"});
        child.unref();
      }catch(e){ return false; }
      setTimeout(() => app.exit(0), 300);
      return true;
    }
    shell.openExternal(updater.pending.url);
    return true;
  }
  if(!updater.promote()) return false;
  app.relaunch();
  app.exit(0);
  return true;
});
ipcMain.handle("reccheck-get-version", () => updater ? updater.effective().version : PKG_VERSION);

ipcMain.handle("files-get-dir", () => hub ? hub.getDir() : null);
ipcMain.handle("files-pick-dir", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
    title: "Choose the folder where the protel reports are saved"
  });
  if(r.canceled || !r.filePaths[0]) return hub.getDir();
  return hub.setDir(r.filePaths[0]);
});
ipcMain.handle("files-list", (_e, rel) => hub ? hub.list(rel) : {dir: null, rel: "", dirs: [], files: []});
ipcMain.handle("files-read", (_e, p) => hub.read(p));
ipcMain.handle("files-stat", (_e, p) => hub ? hub.stat(p) : null);
ipcMain.handle("open-help", () => { shell.openExternal(ISSUES_URL); return true; });

ipcMain.handle("overlay-toggle", () => {
  const on = !overlayWin;
  if(on) createOverlay(); else destroyOverlay();
  try{ const c = hub.readConfig(); c.overlayOn = on; hub.writeConfig(c); }catch(e){}
  return on;
});
ipcMain.handle("overlay-state", () => !!overlayWin);
ipcMain.handle("overlay-data", (_e, d) => {
  overlayData = d;
  if(overlayWin){
    try{ overlayWin.setBounds(overlayBounds((d && d.tasks || []).length, d && d.cfg)); }catch(e){}
    overlayWin.webContents.send("overlay-data", d);
  }
  return true;
});

app.on("before-quit", () => { QUITTING = true; });
app.on("window-all-closed", () => { if(QUITTING) app.quit(); });   // otherwise we live in the tray

ipcMain.handle("overlay-hotkey-get", () => currentHotkey());
ipcMain.handle("overlay-hotkey-set", (_e, acc) => {
  acc = typeof acc === "string" ? acc : "";
  const prev = currentHotkey();
  if(!applyHotkey(acc)){
    applyHotkey(prev);                         // keep the old one working
    return false;
  }
  try{ const c = hub.readConfig(); c.overlayHotkey = acc; hub.writeConfig(c); }catch(e){}
  return true;
});
app.on("will-quit", () => { try{ globalShortcut.unregisterAll(); }catch(e){} });

ipcMain.handle("app-set-lang", (_e, l) => {
  TRAYLANG = l === "gr" ? "gr" : "en";
  buildTray();
  return true;
});
