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
  en: {open: "Open RecCheck", overlay: "Toggle checklist overlay", check: "Check for updates",
       uptodate: "You are up to date — v", close: "Close RecCheck"},
  gr: {open: "Άνοιγμα RecCheck", overlay: "Εναλλαγή επικάλυψης λίστας", check: "Έλεγχος για ενημερώσεις",
       uptodate: "Είστε ενημερωμένοι — v", close: "Κλείσιμο RecCheck"}
};
let CHECKING = false, MANUAL_SHOWN = false;
async function runCheck(manual){
  if(CHECKING || !updater) return;
  CHECKING = true;
  MANUAL_SHOWN = !manual;                       // manual checks surface the window once a download starts
  try{
    if(updater.pending){
      if(win && !win.isDestroyed()) win.webContents.send("reccheck-update-ready", updater.pending);
      if(manual) showMain();
      return;
    }
    const info = await updater.check();
    if(info){
      if(win && !win.isDestroyed()) win.webContents.send("reccheck-update-ready", info);
      if(manual) showMain();
    }else if(manual && tray){
      const L = TRAY_TXT[TRAYLANG] || TRAY_TXT.en;
      try{ tray.displayBalloon({title: "RecCheck", content: L.uptodate + updater.effective().version, iconType: "info"}); }catch(e){}
    }
  }catch(e){}
  finally{ CHECKING = false; }   // the pending early-return used to skip this and wedge every later check
}
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
function currentIHotkey(){
  try{
    const c = hub.readConfig();
    return (c.interactHotkey !== undefined) ? c.interactHotkey : "Alt+Shift+Z";
  }catch(e){ return "Alt+Shift+Z"; }
}
function tryRegister(acc, fn){
  if(!acc) return true;                        // empty = hotkey disabled
  try{ return globalShortcut.register(acc, fn); }catch(e){ return false; }
}
/* register both system-wide combos: toggle, and interact (focus + tick tasks) */
function applyHotkeys(){
  try{ globalShortcut.unregisterAll(); }catch(e){}
  const tog = currentHotkey(), inter = currentIHotkey();
  const okT = tryRegister(tog, toggleOverlayGlobal);
  const okI = (inter && inter === tog) ? false : tryRegister(inter, interactOverlayGlobal);
  return {okT, okI};
}
/* the interact combo surfaces the overlay and lets the mouse reach it */
function interactOverlayGlobal(){
  if(!overlayWin){
    createOverlay();
    try{ const c = hub.readConfig(); c.overlayOn = true; hub.writeConfig(c); }catch(e){}
    announceOverlayState();
    setTimeout(() => setInteract(true), 120);   // let the window finish loading
    return;
  }
  setInteract(!INTERACT);
}
function setInteract(on){
  if(!overlayWin){ INTERACT = false; return; }
  INTERACT = !!on;
  try{
    overlayWin.setIgnoreMouseEvents(!INTERACT);
    overlayWin.setFocusable(INTERACT);
    if(INTERACT) overlayWin.focus();
  }catch(e){}
  try{
    if(overlayData) overlayWin.setBounds(overlayBounds((overlayData.tasks || []).length + (INTERACT ? 1 : 0), overlayData.cfg));
  }catch(e){}
  try{ overlayWin.webContents.send("overlay-mode", {interact: INTERACT}); }catch(e){}
}
/* ---- Protel Shortcuts: managed native helper (rc-tbind.exe, ships beside app.asar) ----
   Triggers (a mouse side button or a key combo) are bound per PROFILE, so whoever is on
   shift keeps their own bindings. Config shape:
     {profiles: [{id, name, binds: {tau: <trigger>, altf4: <trigger>}}], activeProfile: id}
   A trigger is "m3"/"m4"/"m5" or "k<mods>-<vk>"; both are opaque to this layer. */
const ACTIONS = ["tau", "altf4"];
function newProfileId(){ return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
/* pre-1.12 config kept a single c.tauButton — fold it into a first profile so nobody
   loses the binding they already had */
function readProfiles(){
  let c = {};
  try{ c = hub.readConfig(); }catch(e){ c = {}; }
  let list = Array.isArray(c.profiles) ? c.profiles.filter(p => p && p.id) : null;
  if(!list || !list.length){
    const binds = {};
    if(c.tauButton >= 3 && c.tauButton <= 5) binds.tau = "m" + c.tauButton;
    list = [{id: newProfileId(), name: "Default", binds}];
    c.profiles = list;
    c.activeProfile = list[0].id;
    try{ hub.writeConfig(c); }catch(e){}
  }
  const active = list.some(p => p.id === c.activeProfile) ? c.activeProfile : list[0].id;
  return {list, active, cfg: c};
}
function writeProfiles(list, active){
  let c = {};
  try{ c = hub.readConfig(); }catch(e){ c = {}; }
  c.profiles = list;
  c.activeProfile = active;
  delete c.tauButton;                       // migrated; never read again
  try{ hub.writeConfig(c); }catch(e){}
}
function activeBinds(){
  const {list, active} = readProfiles();
  const p = list.find(x => x.id === active);
  return (p && p.binds) || {};
}
let TAU = null, TAU_DETECT = null;
function tauPath(){
  const fs = require("fs");
  const cands = [path.join(path.dirname(__dirname), "rc-tbind.exe"),   // packaged: resources/rc-tbind.exe
                 path.join(__dirname, "rc-tbind.exe")];                // dev: next to main.js
  for(const c of cands){ try{ if(fs.existsSync(c)) return c; }catch(e){} }
  return null;
}
function tauStop(){ if(TAU){ try{ TAU.kill(); }catch(e){} TAU = null; } }
/* kill any rc-tbind left over from a previous run (incl. crashed/old versions) */
function tauKillStrays(cb){
  if(process.platform !== "win32"){ if(cb) cb(); return; }
  let done = false;
  const fin = () => { if(!done){ done = true; if(cb) cb(); } };
  try{
    const k = spawn("taskkill", ["/F", "/IM", "rc-tbind.exe"], {stdio: "ignore", windowsHide: true});
    k.on("exit", fin);
    k.on("error", fin);
    setTimeout(fin, 1500);
  }catch(e){ fin(); }
}
function tauStart(){
  tauStop();
  if(process.platform !== "win32") return;
  const exe = tauPath();
  if(!exe) return;
  let binds = {};
  try{ binds = activeBinds(); }catch(e){}
  const specs = ACTIONS.filter(a => binds[a]).map(a => binds[a] + "=" + a);
  if(!specs.length) return;                 // nothing bound in this profile — don't hook at all
  try{
    TAU = spawn(exe, ["bind", String(process.pid)].concat(specs), {stdio: "ignore", windowsHide: true});
    TAU.on("exit", () => { TAU = null; });
    TAU.on("error", () => { TAU = null; });
  }catch(e){ TAU = null; }
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
    {label: L.check, click: () => runCheck(true)},
    {label: L.overlay, click: () => {
      if(overlayWin) destroyOverlay(); else createOverlay();
      try{ const c = hub.readConfig(); c.overlayOn = !!overlayWin; hub.writeConfig(c); }catch(e){}
      announceOverlayState();
    }},
    {type: "separator"},
    {label: L.close, click: () => { QUITTING = true; app.quit(); }}
  ]));
}
let overlayWin = null, overlayData = null, INTERACT = false;

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
  overlayWin.on("blur", () => { if(INTERACT) setInteract(false); });
  overlayWin.on("closed", () => { overlayWin = null; INTERACT = false; });
}
function destroyOverlay(){
  if(overlayWin){ try{ overlayWin.destroy(); }catch(e){} overlayWin = null; }
  INTERACT = false;
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
    onProgress: (p) => {
      if(win && !win.isDestroyed()) win.webContents.send("reccheck-update-progress", p);
      if(!MANUAL_SHOWN && p && p.phase === "downloading"){ MANUAL_SHOWN = true; showMain(); }
    }
  });
  hub = new FileHub({
    configPath: path.join(app.getPath("userData"), "config.json"),
    onDirEvent: (profile) => { if(win && !win.isDestroyed()) win.webContents.send("reccheck-dir-event", profile); }
  });
  hub.startWatch();
  const eff = updater.effective();
  createWindow(eff.file);
  try{ if(hub.readConfig().overlayOn) createOverlay(); }catch(e){}
  buildTray();
  applyHotkeys();
  tauKillStrays(() => tauStart());
  MANUAL_SHOWN = true;                        // startup check never pops the window
  updater.check().then(info => {
    if(info && win && !win.isDestroyed())
      win.webContents.send("reccheck-update-ready", info);
  });
  setInterval(() => runCheck(false), 6 * 3600e3);
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

const PICK_TITLES = {
  en: {dept: "Choose the folder with the Department Check reports (ΕΛΕΓΧΟΣ ΤΜΗΜΑΤΩΝ BY ROOM)",
       tax:  "Choose the folder with the Tax Check reports"},
  gr: {dept: "Επιλέξτε τον φάκελο με τις αναφορές του Ελέγχου Τμημάτων (ΕΛΕΓΧΟΣ ΤΜΗΜΑΤΩΝ BY ROOM)",
       tax:  "Επιλέξτε τον φάκελο με τις αναφορές του Ελέγχου ΤΑ"}
};
ipcMain.handle("files-get-dir", (_e, profile) => hub ? hub.getDir(profile) : null);
ipcMain.handle("files-pick-dir", async (_e, profile) => {
  const p = hub.norm(profile);
  const r = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
    title: (PICK_TITLES[TRAYLANG] || PICK_TITLES.en)[p]
  });
  if(r.canceled || !r.filePaths[0]) return hub.getDir(p);
  return hub.setDir(p, r.filePaths[0]);
});
ipcMain.handle("files-list", (_e, profile, rel) => hub ? hub.list(profile, rel) : {dir: null, rel: "", dirs: [], files: []});
ipcMain.handle("files-read", (_e, profile, p) => hub.read(profile, p));
ipcMain.handle("files-stat", (_e, profile, p) => hub ? hub.stat(profile, p) : null);
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
    try{ overlayWin.setBounds(overlayBounds((d && d.tasks || []).length + (INTERACT ? 1 : 0), d && d.cfg)); }catch(e){}
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
  try{ const c = hub.readConfig(); c.overlayHotkey = acc; hub.writeConfig(c); }catch(e){}
  if(!applyHotkeys().okT){
    try{ const c = hub.readConfig(); c.overlayHotkey = prev; hub.writeConfig(c); }catch(e){}
    applyHotkeys();                            // keep the old one working
    return false;
  }
  return true;
});
ipcMain.handle("overlay-ihotkey-get", () => currentIHotkey());
ipcMain.handle("overlay-ihotkey-set", (_e, acc) => {
  acc = typeof acc === "string" ? acc : "";
  const prev = currentIHotkey();
  try{ const c = hub.readConfig(); c.interactHotkey = acc; hub.writeConfig(c); }catch(e){}
  if(acc && !applyHotkeys().okI){
    try{ const c = hub.readConfig(); c.interactHotkey = prev; hub.writeConfig(c); }catch(e){}
    applyHotkeys();
    return false;
  }
  if(!acc) applyHotkeys();
  return true;
});
ipcMain.handle("sc-get", () => {
  try{
    const {list, active} = readProfiles();
    return {profiles: list, active, available: process.platform === "win32" && !!tauPath()};
  }catch(e){ return {profiles: [], active: null, available: false}; }
});
/* listen for one trigger and store it against an action in the active profile */
ipcMain.handle("sc-detect", (_e, action) => new Promise(res => {
  if(process.platform !== "win32" || !tauPath() || ACTIONS.indexOf(action) < 0){ res(null); return; }
  try{ if(TAU_DETECT) TAU_DETECT.kill(); }catch(e){}
  TAU_DETECT = null;
  tauStop();                                   // release the hooks while listening
  let out = "", done = false;
  const finish = v => { if(done) return; done = true; TAU_DETECT = null; tauStart(); res(v); };
  try{
    const child = spawn(tauPath(), ["detect", String(process.pid)], {windowsHide: true});
    TAU_DETECT = child;
    child.stdout.on("data", d => {
      out += d;
      const m = out.match(/BTN:(\d)/) || out.match(/KEY:(\d+)-(\d+)/);
      if(!m) return;
      const trigger = m.length === 2 ? "m" + m[1] : "k" + m[1] + "-" + m[2];
      try{
        const {list, active} = readProfiles();
        const p = list.find(x => x.id === active);
        if(p){
          p.binds = p.binds || {};
          // one physical trigger drives one action — steal it from any other action
          for(const a of ACTIONS) if(a !== action && p.binds[a] === trigger) delete p.binds[a];
          p.binds[action] = trigger;
          writeProfiles(list, active);
        }
      }catch(e){}
      try{ child.kill(); }catch(e){}
      finish(trigger);
    });
    child.on("exit", () => finish(null));
    child.on("error", () => finish(null));
    setTimeout(() => { try{ child.kill(); }catch(e){} }, 15000);
  }catch(e){ finish(null); }
}));
ipcMain.handle("sc-cancel", () => { try{ if(TAU_DETECT) TAU_DETECT.kill(); }catch(e){} return true; });
ipcMain.handle("sc-clear", (_e, action) => {
  try{
    const {list, active} = readProfiles();
    const p = list.find(x => x.id === active);
    if(p && p.binds) delete p.binds[action];
    writeProfiles(list, active);
  }catch(e){}
  tauStart();                                  // rebind whatever is left
  return true;
});
ipcMain.handle("sc-profile-add", (_e, name) => {
  try{
    const {list} = readProfiles();
    const p = {id: newProfileId(), name: String(name || "").slice(0, 40) || "Profile", binds: {}};
    list.push(p);
    writeProfiles(list, p.id);                 // a new profile becomes the active one
    tauStart();
    return {profiles: list, active: p.id};
  }catch(e){ return null; }
});
ipcMain.handle("sc-profile-rename", (_e, id, name) => {
  try{
    const {list, active} = readProfiles();
    const p = list.find(x => x.id === id);
    if(p) p.name = String(name || "").slice(0, 40) || p.name;
    writeProfiles(list, active);
    return {profiles: list, active};
  }catch(e){ return null; }
});
ipcMain.handle("sc-profile-delete", (_e, id) => {
  try{
    let {list, active} = readProfiles();
    if(list.length <= 1) return {profiles: list, active};   // always keep one
    list = list.filter(x => x.id !== id);
    if(!list.some(x => x.id === active)) active = list[0].id;
    writeProfiles(list, active);
    tauStart();
    return {profiles: list, active};
  }catch(e){ return null; }
});
ipcMain.handle("sc-profile-select", (_e, id) => {
  try{
    const {list} = readProfiles();
    if(!list.some(x => x.id === id)) return null;
    writeProfiles(list, id);
    tauStart();                                // swap the hooks over to the new bindings
    return {profiles: list, active: id};
  }catch(e){ return null; }
});
ipcMain.handle("overlay-tick", (_e, id) => {
  if(win && !win.isDestroyed()) win.webContents.send("reccheck-overlay-tick", id);
  return true;
});
ipcMain.handle("overlay-exit-interact", () => { setInteract(false); return true; });
app.on("will-quit", () => {
  try{ globalShortcut.unregisterAll(); }catch(e){}
  tauStop();
  try{ if(TAU_DETECT) TAU_DETECT.kill(); }catch(e){}
});

ipcMain.handle("app-set-lang", (_e, l) => {
  TRAYLANG = l === "gr" ? "gr" : "en";
  buildTray();
  return true;
});
