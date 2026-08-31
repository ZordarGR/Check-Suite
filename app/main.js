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
/* The overlay puts itself away once the night's tasks are all ticked. It still exists,
   just hidden, so "bring it back" is a distinct case from "switch it on". */
function overlayPutAway(){
  try{ return !!overlayWin && !overlayWin.isVisible(); }catch(e){ return false; }
}
function doneMsgEnabled(){
  try{ return !(overlayData && overlayData.cfg && overlayData.cfg.doneMsg === false); }catch(e){ return true; }
}
/* Asking for a finished overlay flashes "all done" and puts it away again. With the
   reminder switched off it behaves like an ordinary toggle instead, so somebody who
   does not want the interruption is not fighting it. */
function overlayRecall(){
  if(!overlayPutAway()) return false;
  if(!doneMsgEnabled()) return false;
  try{
    overlayWin.showInactive();
    overlayWin.webContents.send("overlay-done-msg");
  }catch(e){}
  return true;
}
function setOverlay(on){
  if(on) createOverlay(); else destroyOverlay();
  try{ const c = hub.readConfig(); c.overlayOn = !!overlayWin; hub.writeConfig(c); }catch(e){}
  announceOverlayState();
}
function toggleOverlayGlobal(){
  if(overlayRecall()) return;
  setOverlay(!overlayWin);
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
  /* A finished night answers the same way whichever hotkey asks it. Edit mode used to
     be the exception: it resurrected a put-away overlay so a task could be unticked
     without leaving protel. But the checklist is in the app too, so that hatch bought
     one alt-tab and cost a surprise -- and two hotkeys disagreeing about what
     "finished" means reads as a bug even when it is deliberate. */
  if(overlayRecall()) return;
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
  /* Only reachable now with the done reminder switched off, where a finished night has
     nothing to say and the hotkey behaves as an ordinary summon. With the reminder on,
     interactOverlayGlobal has already answered and never got here. */
  try{ if(INTERACT && !overlayWin.isVisible()) overlayWin.showInactive(); }catch(e){}
  try{
    overlayWin.setIgnoreMouseEvents(!INTERACT);
    overlayWin.setFocusable(INTERACT);
    if(INTERACT) overlayWin.focus();
  }catch(e){}
  try{
    if(overlayData) overlayWin.setBounds(overlayBounds((overlayData.tasks || []).length + (INTERACT ? 1 : 0), overlayData.cfg));
  }catch(e){}
  try{ overlayWin.webContents.send("overlay-mode", {interact: INTERACT}); }catch(e){}
  /* Leaving interact mode on a finished night puts the overlay away again — otherwise
     summoning it to untick something would leave it on screen for good. Never while an
     animation is playing: celebrate() drops interact mode itself as its first act. */
  if(!INTERACT && !OVERLAY_BUSY){
    try{
      const ts = (overlayData && overlayData.tasks) || [];
      if(ts.length && ts.every(x => x.done)) overlayWin.hide();
    }catch(e){}
  }
}
/* ---- Protel Shortcuts: managed native helper (rc-tbind.exe, ships beside app.asar) ----
   Triggers (a mouse side button or a key combo) are bound per PROFILE, so whoever is on
   shift keeps their own bindings. Config shape:
     {profiles: [{id, name, binds: {tau: <trigger>, altf4: <trigger>}}], activeProfile: id}
   A trigger is "m3"/"m4"/"m5" or "k<mods>-<vk>"; both are opaque to this layer. */
const ACTIONS = ["tau", "altf4", "altn", "seq"];
/* A trigger the helper cannot parse is worse than no trigger, because storing one
   silently replaces a binding that worked. Validate on the way in AND on the way out. */
const TRIGGER_RE = /^(?:m(?:[345]|\d{1,2}-[345])|k\d{1,2}-\d{1,3})$/;
function validTrigger(x){ return typeof x === "string" && TRIGGER_RE.test(x); }
/* The keystroke run is deliberately DATA, not code: it lives in config and travels to
   the helper on the command line, so tuning it later is a small update rather than a
   whole new installer. Enter, Enter, Right, Enter, Enter. */
const SEQ_DEFAULT = {keys: [13, 13, 39, 13, 13], gap: 25};
function seqConfig(){
  let c = {};
  try{ c = hub.readConfig(); }catch(e){}
  const raw = (c.seq && Array.isArray(c.seq.keys) && c.seq.keys.length) ? c.seq : SEQ_DEFAULT;
  const keys = raw.keys.filter(k => Number.isInteger(k) && k > 0 && k < 256).slice(0, 32);
  const gap = (Number.isInteger(raw.gap) && raw.gap >= 0 && raw.gap <= 2000) ? raw.gap : SEQ_DEFAULT.gap;
  return {keys: keys.length ? keys : SEQ_DEFAULT.keys.slice(), gap};
}
/* The shortcuts belong to protel. A bound side button is still a mouse button in every
   other window on this machine, so the helper can be told to fire only while a given
   window is in front. What "protel" looks like is not guessed here: the user points the
   app at the real window once and the needle comes from that. Off until they do, because
   a wrong needle would silently cost them every shortcut mid-shift. */
/* The τ is one keypress, and protel takes a moment to react to it before it will accept
   the Enter that always follows. Pressed by hand that Enter beats protel there and is
   lost — which is what "the shortcut needed two presses" actually was. The helper is the
   only one that can wait reliably, so it sends the Enter itself. Data, not code: the
   delay lives in config and travels on the command line. */
const TAU_ENTER_DEFAULT = {on: true, delay: 50};
function tauEnterConfig(){
  let c = {};
  try{ c = hub.readConfig(); }catch(e){}
  const f = (c && typeof c.tauEnter === "object" && c.tauEnter) || {};
  const d = (Number.isInteger(f.delay) && f.delay >= 0 && f.delay <= 5000)
            ? f.delay : TAU_ENTER_DEFAULT.delay;
  return {on: f.on !== false, delay: d};        // absent config means on
}
function tauSpec(){
  const f = tauEnterConfig();
  return f.on ? "tau:" + f.delay : "tau";
}
function focusConfig(){
  let c = {};
  try{ c = hub.readConfig(); }catch(e){}
  const f = c.focus || {};
  const needle = typeof f.needle === "string" ? f.needle.trim().slice(0, 64) : "";
  return {on: !!f.on && needle.length > 0, needle: needle};
}
function focusSpec(){
  const f = focusConfig();
  return f.on ? ["focus=" + f.needle] : [];
}
/* This keyboard has no Caps Lock light and Windows draws nothing either, so the state
   changes silently under a passport entry. Only the helper's hook can see the key while
   protel has the focus, so the helper reports it and the app flashes it. */
function capsConfig(){
  let c = {};
  try{ c = hub.readConfig(); }catch(e){}
  return {on: c.capsFlash !== false};          // absent config means on
}
function capsSpec(){ return capsConfig().on ? ["caps=on"] : []; }
function seqSpec(){
  const q = seqConfig();
  return "seq:" + q.keys.join(",") + "@" + q.gap;
}
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
  /* 1.15.0 could store "m0" for a mouse bind — a valid-looking but unbindable trigger
     that also displaced the working one. Drop anything unparsable so the row simply
     reads "not set" and can be bound again, instead of looking set and doing nothing. */
  let repaired = false;
  for(const prof of list){
    if(!prof.binds) continue;
    for(const a of Object.keys(prof.binds)){
      if(!validTrigger(prof.binds[a])){ delete prof.binds[a]; repaired = true; }
    }
  }
  if(repaired){ c.profiles = list; try{ hub.writeConfig(c); }catch(e){} }
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
/* Why the shortcuts are or are not working, in a form the app can show the user.
   Every failure below used to end in an empty catch, so a machine where the helper
   never starts looked exactly like one where nothing was bound. */
let TAUINFO = {state: "idle"};
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
/* The helper writes its own unhandled exception here before dying. Exit 0xE0434352
   only says "something threw"; this says what and where. Cleared by the helper on
   every successful start, so it never describes a run that has been superseded. */
function tauCrash(){
  try{
    const fs = require("fs");
    const base = process.env.LOCALAPPDATA;
    if(!base) return null;
    const txt = fs.readFileSync(path.join(base, "RecCheck", "rc-tbind-crash.txt"), "utf8");
    return txt.trim().split(/\r?\n/).slice(0, 4).join(" | ").slice(0, 400) || null;
  }catch(e){ return null; }
}
function tauStart(){
  tauStop();
  if(process.platform !== "win32"){ TAUINFO = {state: "not-windows"}; return; }
  const exe = tauPath();
  if(!exe){ TAUINFO = {state: "no-exe"}; return; }
  let binds = {};
  try{ binds = activeBinds(); }catch(e){}
  const specs = ACTIONS.filter(a => binds[a])
    .map(a => binds[a] + "=" + (a === "seq" ? seqSpec() : a === "tau" ? tauSpec() : a));
  const caps = capsConfig();
  /* nothing bound and nothing to watch — don't hook at all */
  if(!specs.length && !caps.on){
    TAUINFO = {state: "idle", exe: exe};
    capsHide();
    return;
  }
  /* The gate is passed to the helper, never applied here: only the hook thread knows
     what was in front at the instant of the press. */
  const args = ["bind", String(process.pid)].concat(focusSpec()).concat(capsSpec()).concat(specs);
  try{
    /* stdout is only opened when something is expected on it. The helper writes one
       short line per Caps Lock change and nothing else; a full pipe would stall the
       hook thread, so the lines are read as they arrive and never buffered up. */
    const child = spawn(exe, args,
      {stdio: ["ignore", caps.on ? "pipe" : "ignore", "ignore"], windowsHide: true});
    if(caps.on && child.stdout){
      let buf = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", d => {
        buf += d;
        if(buf.length > 4096) buf = buf.slice(-1024);   // never grow on unexpected output
        let i;
        while((i = buf.indexOf("\n")) >= 0){
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if(line === "CAPS:1" || line === "CAPS:0"){
            if(TAU === child) capsFlash(line === "CAPS:1");
          }
        }
      });
      child.stdout.on("error", () => {});
    }
    TAU = child;
    const started = Date.now();
    TAUINFO = {state: "running", exe: exe, pid: child.pid, specs: args.slice(2), since: started};
    /* Only report on the child we still consider current: tauStop() clears TAU before
       the kill lands, so a replaced helper's exit must not overwrite its successor. */
    child.on("exit", (code, signal) => {
      if(TAU !== child) return;
      TAU = null;
      TAUINFO = {state: "exited", exe: exe, code: code, signal: signal,
                 specs: specs, ranMs: Date.now() - started};
      capsHide();
    });
    child.on("error", (err) => {
      if(TAU !== child) return;
      TAU = null;
      TAUINFO = {state: "spawn-failed", exe: exe, specs: specs,
                 err: (err && (err.code || err.message)) || "unknown"};
    });
  }catch(e){
    TAU = null;
    TAUINFO = {state: "spawn-failed", exe: exe, specs: specs,
               err: (e && (e.code || e.message)) || "unknown"};
  }
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
    {label: L.overlay, click: toggleOverlayGlobal},
    {type: "separator"},
    {label: L.close, click: () => { QUITTING = true; app.quit(); }}
  ]));
}
let overlayWin = null, overlayData = null, INTERACT = false;
let OVERLAY_BUSY = false;      // an animation is on screen — do not hide it out from under itself

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
/* ---- Caps Lock flash: its own window, so it is there whether or not the checklist
   overlay is up and stays after the night's tasks are ticked and that one puts itself
   away. Transparent, click-through and never focusable — protel keeps the keyboard.
   Created on the first flash and then kept hidden between them rather than rebuilt,
   because a window built from scratch cannot animate in fast enough to be read. ---- */
let capsWin = null, CAPS_LAST = null;
function capsBounds(){
  /* Dead centre of the screen itself, not of the work area: "centre" means centre,
     and the taskbar must not push the icon off it. bounds, not workArea, for that. */
  const b = screen.getPrimaryDisplay().bounds;
  const W = 170, H = 170;
  return {x: Math.round(b.x + (b.width - W) / 2), y: Math.round(b.y + (b.height - H) / 2),
          width: W, height: H};
}
function createCaps(){
  if(capsWin) return;
  capsWin = new BrowserWindow(Object.assign(capsBounds(), {
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: false, resizable: false, movable: false, hasShadow: false, show: false,
    webPreferences: {contextIsolation: true, preload: path.join(__dirname, "caps-preload.js")}
  }));
  capsWin.setIgnoreMouseEvents(true);
  capsWin.setAlwaysOnTop(true, "screen-saver");
  capsWin.loadURL(pathToFileURL(path.join(__dirname, "caps.html")).toString());
  capsWin.webContents.once("did-finish-load", () => {
    /* a change that landed while the page was still loading must not be lost */
    if(capsWin && CAPS_LAST !== null) capsFlash(CAPS_LAST);
  });
  capsWin.on("closed", () => { capsWin = null; });
}
function capsFlash(on){
  if(process.platform !== "win32") return;
  if(!capsConfig().on) return;
  CAPS_LAST = !!on;
  if(!capsWin){ createCaps(); return; }        // did-finish-load replays it
  try{
    if(!capsWin.webContents.isLoading()){
      capsWin.setBounds(capsBounds());          // the work area can change under us
      capsWin.showInactive();
      capsWin.setAlwaysOnTop(true, "screen-saver");
      capsWin.webContents.send("caps-flash", {on: !!on});
      CAPS_LAST = null;
    }
  }catch(e){}
}
function capsHide(){
  if(capsWin){ try{ capsWin.destroy(); }catch(e){} capsWin = null; }
  CAPS_LAST = null;
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
  if(overlayRecall()) return true;          // finished for tonight — flash and stay away
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
    /* The overlay hides itself once the last task is ticked. Untick anything — or let
       07:00 clear the night — and it comes straight back. showInactive keeps it from
       stealing focus from protel. */
    const tasks = (d && d.tasks) || [];
    const finished = tasks.length > 0 && tasks.every(t => t.done);
    if(!finished){
      try{ if(!overlayWin.isVisible()) overlayWin.showInactive(); }catch(e){}
    }
    overlayWin.webContents.send("overlay-data", d);
  }
  return true;
});
/* an animation is starting or ending in the overlay window */
ipcMain.handle("overlay-busy", (_e, on) => { OVERLAY_BUSY = !!on; return true; });
/* the celebration (or the reminder) has finished playing — put the overlay away */
ipcMain.handle("overlay-complete", () => {
  OVERLAY_BUSY = false;
  if(overlayWin){ try{ overlayWin.hide(); }catch(e){} }
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
    return {profiles: list, active, seq: seqConfig(), focus: focusConfig(),
            tauEnter: tauEnterConfig(), caps: capsConfig(),
            available: process.platform === "win32" && !!tauPath()};
  }catch(e){ return {profiles: [], active: null, available: false}; }
});
/* The pill has finished fading — put the window away until the next change. */
ipcMain.handle("caps-gone", () => {
  try{ if(capsWin) capsWin.hide(); }catch(e){}
  return true;
});
/* Whether the Caps Lock change is flashed. Turning it off also takes the keyboard hook
   back out of the input path, since nothing else on a mouse-only profile needs it. */
ipcMain.handle("sc-caps-set", (_e, on) => {
  try{ const c = hub.readConfig(); c.capsFlash = !!on; hub.writeConfig(c); }catch(e){}
  if(!capsConfig().on) capsHide();
  tauStart();                                  // the helper takes this at spawn time
  return capsConfig();
});
/* Whether the helper presses the Enter after the τ, and how long it waits first. */
ipcMain.handle("sc-tauenter-set", (_e, on, delay) => {
  try{
    const c = hub.readConfig();
    /* The right number is whatever protel turns out to need, and that is not something
       this side can know — so it is settable, and out-of-range means "leave it alone"
       rather than a wait nobody asked for. */
    const d = (Number.isInteger(delay) && delay >= 0 && delay <= 2000)
              ? delay : tauEnterConfig().delay;
    c.tauEnter = {on: !!on, delay: d};
    hub.writeConfig(c);
  }catch(e){}
  tauStart();                                  // the helper takes its actions at spawn time
  return tauEnterConfig();
});
/* Turn the gate on or off, and store what it should match. An empty needle can only
   mean off — a gate matching nothing would swallow the shortcuts entirely. */
ipcMain.handle("sc-focus-set", (_e, on, needle) => {
  try{
    const c = hub.readConfig();
    const n = typeof needle === "string" ? needle.trim().slice(0, 64) : (focusConfig().needle || "");
    c.focus = {on: !!on && n.length > 0, needle: n};
    hub.writeConfig(c);
  }catch(e){}
  tauStart();                                  // the helper takes the gate at spawn time
  return focusConfig();
});
/* Ask the helper what is in front after a countdown, so the user can put protel there
   and have the needle taken from the real window rather than from a guess. */
ipcMain.handle("sc-focus-pick", (_e, delayMs) => new Promise(res => {
  if(process.platform !== "win32" || !tauPath()){ res(null); return; }
  const wait = Math.max(1000, Math.min(30000, +delayMs || 5000));
  let out = "", done = false;
  const finish = () => {
    if(done) return; done = true;
    const line = /^FG\t(.*)$/m.exec(out);
    if(!line){ res(null); return; }
    const [exe, cls, title] = (line[1] + "\t\t").split("\t");
    /* The likeliest way to get this wrong is not alt-tabbing at all, which would aim the
       gate at RecCheck and stop every shortcut working in protel. Say so instead. */
    let me = "";
    try{ me = String(process.execPath).split(/[\\/]/).pop().replace(/\.exe$/i, ""); }catch(e){}
    const self = !!(me && exe && exe.toLowerCase() === me.toLowerCase());
    res({exe: exe || "", cls: cls || "", title: title || "", self: self});
  };
  try{
    const child = spawn(tauPath(), ["fg", String(process.pid), String(wait)], {windowsHide: true});
    child.stdout.on("data", d => { out += d; });
    child.on("exit", finish);
    child.on("error", finish);
    setTimeout(() => { try{ child.kill(); }catch(e){} finish(); }, wait + 10000);
  }catch(e){ finish(); }
}));
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
      /* The helper reports "BTN:<mods>-<btn>" since 1.15. The older single-number form
         is still accepted so a mismatched pair can never silently store nonsense — which
         is exactly what happened when only one side of this was updated. */
      let trigger = null;
      let mb = out.match(/BTN:(\d+)-(\d+)/);
      if(mb) trigger = "m" + mb[1] + "-" + mb[2];
      else if((mb = out.match(/BTN:(\d)\b/))) trigger = "m0-" + mb[1];
      else{
        const mk = out.match(/KEY:(\d+)-(\d+)/);
        if(mk) trigger = "k" + mk[1] + "-" + mk[2];
      }
      if(!trigger || !validTrigger(trigger)) return;   // never overwrite a good bind with junk
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
/* Run the shortcut against whatever the user brings forward and hand back the
   helper's own step-by-step report. Observes only — installs no hooks. */
ipcMain.handle("sc-diag", (_e, delayMs) => new Promise(res => {
  if(process.platform !== "win32" || !tauPath()){ res(null); return; }
  const wait = Math.max(1000, Math.min(30000, +delayMs || 5000));
  let out = "", done = false;
  const finish = () => { if(done) return; done = true; res(out || null); };
  try{
    const child = spawn(tauPath(), ["diag", String(process.pid), String(wait)], {windowsHide: true});
    child.stdout.on("data", d => { out += d; });
    child.on("exit", finish);
    child.on("error", finish);
    setTimeout(() => { try{ child.kill(); }catch(e){} finish(); }, wait + 20000);
  }catch(e){ finish(); }
}));
/* Ask the helper to say hello and report what came back, alongside what the bound
   helper is currently doing. This is the difference between "you have not bound
   anything", "the file is not on disk", "Windows will not start it" and "it starts
   and is then refused its hooks" — four causes with one symptom. */
ipcMain.handle("sc-helper", () => new Promise(res => {
  const exe = tauPath();
  /* TAUINFO is read when the answer is sent, not when it is asked for: a helper that
     fails to start reports that through an async "error" event, so a snapshot taken
     up front would still say "running". The probe below gives it that moment. */
  const snap = () => ({exe: exe, state: TAUINFO.state, code: TAUINFO.code, signal: TAUINFO.signal,
                       err: TAUINFO.err, pid: TAUINFO.pid, ranMs: TAUINFO.ranMs,
                       specs: TAUINFO.specs, since: TAUINFO.since, crash: tauCrash()});
  if(process.platform !== "win32"){ const i = snap(); i.probe = "not-windows"; res(i); return; }
  if(!exe){ const i = snap(); i.probe = "missing"; res(i); return; }
  let out = "", done = false;
  const fin = p => { if(done) return; done = true; const i = snap(); i.probe = p; res(i); };
  try{
    const child = spawn(exe, ["ping"], {windowsHide: true});
    child.stdout.on("data", d => { out += d; });
    child.on("error", e => fin("spawn-error:" + ((e && (e.code || e.message)) || "unknown")));
    child.on("exit", c => fin(/RCTBIND OK/.test(out) ? "ok" : ("no-reply:exit=" + c)));
    setTimeout(() => { try{ child.kill(); }catch(e){} fin("timeout"); }, 5000);
  }catch(e){ fin("throw:" + ((e && (e.code || e.message)) || "unknown")); }
}));
/* What the last real presses actually did. The Test button only ever exercised an idle
   protel; this is the record of the presses that happen for real, which is where the
   shortcut misbehaves. */
ipcMain.handle("sc-taulog", () => {
  try{
    const fs = require("fs");
    const base = process.env.LOCALAPPDATA;
    if(!base) return null;
    const txt = fs.readFileSync(path.join(base, "RecCheck", "rc-tbind-tau.log"), "utf8");
    // newest first, and only as much as anyone will actually read
    const runs = txt.split(/(?==== tau press )/).filter(x => x.trim());
    return runs.slice(-6).reverse().join("\n").slice(0, 20000) || null;
  }catch(e){ return null; }
});
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
