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
/* ONE of these, not two. It was declared twice, byte for byte, and JavaScript quietly
   kept the second. Nothing misbehaved — but this is the line that decides whether the
   helper's window watcher runs at all, and an edit made to the copy that loses would have
   gone nowhere with no error to show for it. */
function focusSpec(){
  const f = focusConfig();
  return f.on ? ["focus=" + f.needle] : [];
}
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
let TAU_DETECT = null;          // the short-lived `detect` child; the standalone is not ours to hold
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
/* rc-tbind is NOT a child of this app any more. It starts at Windows login, keeps the
   Caps Lock indicator going with RecCheck closed, and only fires protel's shortcuts
   while RecCheck is also running — it works that out from our process, we do not tell
   it. So there is no child handle to kill here: asking it to stand down is a verb. */
function tauStop(){ return helperVerb("stop"); }
/* One short line on stdout: "RCTBIND <on|off> <running|stopped> <ver>". */
function helperVerb(verb){
  return new Promise(res => {
    const exe = tauPath();
    if(process.platform !== "win32" || !exe){ res({available: false, on: false, running: false}); return; }
    const chunks = []; let done = false;
    const fin = () => {
      if(done) return; done = true;
      const out = Buffer.concat(chunks).toString("utf8");
      const m = /^RCTBIND\s+(on|off)\s+(running|stopped)\s+(\S+)/m.exec(out);
      res(m ? {available: true, on: m[1] === "on", running: m[2] === "running", ver: m[3]}
            : {available: true, on: false, running: false, err: (out.trim() || "no answer").slice(0, 120)});
    };
    try{
      const child = spawn(exe, [verb], {windowsHide: true});
      child.stdout.on("data", d => { chunks.push(d); });
      child.on("exit", fin);
      child.on("error", fin);
      setTimeout(fin, 4000);                  // never leave the settings panel waiting
    }catch(e){ fin(); }
  });
}
/* The bindings used to travel on the command line, because this app started the helper.
   It does not any more, so they travel in a file the helper re-reads when its write time
   changes. One token per line — the same words that used to be arguments. */
function bindsPath(){
  const base = process.env.LOCALAPPDATA;
  if(!base) return null;
  return path.join(base, "RecCheck", "rc-tbind-binds.txt");
}
/* WHAT WENT INTO THE FILE, kept where the diagnostic can find it.

   sc-helper reports `specs: TAUINFO.specs` and nothing in this file ever assigned it —
   one grep hit in the whole of main.js, the read. So DEBUG's detail line never printed
   binds= for anybody, and its absence looked like "nothing is bound". It was read as
   exactly that here on 05/09 and the conclusion drawn from it was wrong. A diagnostic
   field that is always empty is worse than no field: it reads as a measurement. */
let LAST_SPECS = [];
function writeBinds(){
  const f = bindsPath();
  if(!f) return false;
  let binds = {};
  try{ binds = activeBinds(); }catch(e){}
  const focus = focusSpec();
  const acts = ACTIONS.filter(a => binds[a])
      .map(a => binds[a] + "=" + (a === "seq" ? seqSpec() : a === "tau" ? tauSpec() : a));
  LAST_SPECS = focus.concat(acts);
  const lines = ["# written by RecCheck — edited here has no effect, use the app"]
    .concat(focus).concat(acts);
  try{
    const fs = require("fs");
    fs.mkdirSync(path.dirname(f), {recursive: true});
    fs.writeFileSync(f, lines.join("\r\n") + "\r\n");
    return true;
  }catch(e){ return false; }
}
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
/* Publish the current bindings and make sure the helper is running. It may already be
   — started at login, or left over from before this app opened — and that is the normal
   case now rather than the exception. Spawned DETACHED and unref'd: it has to outlive
   us, which is the entire point of the change. */
function tauStart(){
  if(process.platform !== "win32"){ TAUINFO = {state: "not-windows"}; return; }
  const exe = tauPath();
  if(!exe){ TAUINFO = {state: "no-exe"}; return; }
  const wrote = writeBinds();
  helperVerb("status").then(st => {
    TAUINFO = {state: st.running ? "running" : "stopped", exe: exe, boot: !!st.on,
               ver: st.ver, binds: wrote ? bindsPath() : "COULD NOT WRITE", err: st.err,
               specs: LAST_SPECS.slice()};
    if(st.available && !st.running){
      try{
        const child = spawn(exe, ["run"], {detached: true, stdio: "ignore", windowsHide: true});
        child.unref();
        TAUINFO = Object.assign({}, TAUINFO, {state: "started", pid: child.pid});
      }catch(e){
        TAUINFO = Object.assign({}, TAUINFO, {state: "spawn-failed",
                   err: (e && (e.code || e.message)) || "unknown"});
      }
    }
  }).catch(() => {});
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
  /* Kill anything left from an older build FIRST — a pre-1.17.11 helper does not have
     the caps window, so the new one's single-instance check cannot see it, and two
     helpers would mean two sets of hooks. Then publish the bindings and bring the
     standalone up. It is spawned detached, so it outlives us. */
  tauKillStrays(() => {
    tauStart();
    /* 1.17.10 drew the Caps Lock icon inside this app and shipped with it ON. 1.17.11
       moved it into the helper, which only survives RecCheck closing if it starts at
       login. Carry that setting across exactly ONCE, so a feature he already had does
       not go quiet the night the update lands. After this, unticking it stays unticked. */
    try{
      const c = hub.readConfig();
      if(!c.bootMigrated){
        c.bootMigrated = true;
        hub.writeConfig(c);
        if(c.capsFlash !== false) setTimeout(() => helperVerb("install"), 1500);
      }
    }catch(e){}
  });
  MANUAL_SHOWN = true;                        // startup check never pops the window
  updater.check().then(info => {
    if(info && win && !win.isDestroyed())
      win.webContents.send("reccheck-update-ready", info);
  });
  setInterval(() => runCheck(false), 6 * 3600e3);
});

/* ---- the room database on disk ----

   His call, 04/09: the rooms fed from protel persist in the tool's own directory rather
   than only in localStorage. That REVERSES the 03/09 "tonight only" decision for names,
   knowingly and on his instruction, so guest names now sit on the hotel's PC between
   shifts. He asked for them not to sit there in plain sight.

   WHAT THIS IS, SAID HONESTLY: obfuscation, not encryption. The key is in the program, so
   anyone holding the exe holds the key. It stops the file being read by opening it, and
   nothing stronger than that. He chose this knowing so, with a real key to come if the
   app ever grows logins. It is never described to him as encryption anywhere.

   localStorage stays the working store — synchronous, and the renderer boots off it. This
   is a mirror written beside it, read back only to fill in what localStorage has lost.
   Nothing here can cost the existing store: every path returns null on failure and the
   renderer carries on with what it already had. */
const ROOMS_FILE = "rooms.dat";
const ROOMS_MAGIC = "RCR1";
function roomsPath(){
  const path2 = require("path");
  return path2.join(app.getPath("userData"), ROOMS_FILE);
}
/* A repeating-key XOR over the bytes, with the length folded in so two saves of similar
   data do not line up. Deliberately simple: something that LOOKS like real encryption
   would be worse than something that plainly is not. */
function roomsMask(buf){
  const key = Buffer.from("RecCheck/Kernos/rooms/v1", "utf8");
  const out = Buffer.allocUnsafe(buf.length);
  for(let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length] ^ ((i * 31) & 0xff);
  return out;
}
ipcMain.handle("rooms-read", () => {
  try{
    const fs = require("fs");
    const raw = fs.readFileSync(roomsPath());
    if(raw.length < 4 || raw.slice(0, 4).toString("latin1") !== ROOMS_MAGIC) return null;
    const txt = roomsMask(raw.slice(4)).toString("utf8");
    const o = JSON.parse(txt);
    return (o && typeof o === "object" && !Array.isArray(o)) ? o : null;
  }catch(e){ return null; }
});
ipcMain.handle("rooms-write", (_e, obj) => {
  try{
    if(!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    const fs = require("fs"), path2 = require("path");
    const p = roomsPath();
    fs.mkdirSync(path2.dirname(p), {recursive: true});
    const body = roomsMask(Buffer.from(JSON.stringify(obj), "utf8"));
    /* written beside and renamed, so a crash mid-write cannot leave half a database */
    const tmp = p + ".tmp";
    fs.writeFileSync(tmp, Buffer.concat([Buffer.from(ROOMS_MAGIC, "latin1"), body]));
    fs.renameSync(tmp, p);
    return true;
  }catch(e){ return false; }
});
/* The overlay he asked for on 04/09: the icon centred with a donut ring around it in the
   update button's blue, instead of the nothing he watches now.

   IT CANNOT BE THE HELPER, and that was the plan until the .nsi was read properly. The
   installer's first act is `taskkill /F /IM rc-tbind.exe`, because Windows will not
   overwrite a running exe. So the helper is copied to TEMP under ANOTHER NAME and that
   copy is what draws: `taskkill /IM` matches the image name, so it does not match this,
   and nothing in TEMP is touched by the install.

   Purely cosmetic and deliberately unable to break anything. If the copy fails, the spawn
   fails, or the drawing fails, the install proceeds exactly as before — nothing waits on
   it and nothing checks it. It closes itself when RecCheck comes back and on a hard
   timeout regardless, so a failed install cannot leave it on screen. */
function startInstallSplash(){
  if(process.platform !== "win32") return;
  try{
    const fs = require("fs"), os = require("os");
    const exe = tauPath();
    if(!exe || !fs.existsSync(exe)) return;
    const dst = path.join(os.tmpdir(), "rc-splash.exe");
    let ready = false;
    try{ fs.unlinkSync(dst); }catch(e){}
    try{ fs.copyFileSync(exe, dst); ready = true; }
    catch(e){ ready = fs.existsSync(dst); }      // locked by a previous run: that one draws too
    if(!ready) return;
    const child = spawn(dst, ["splash", "240"], {detached: true, stdio: "ignore", windowsHide: true});
    child.unref();
  }catch(e){}
}
ipcMain.handle("reccheck-apply-update", () => {
  if(!updater || !updater.pending) return false;
  if(updater.pending.full){
    if(updater.pending.downloaded && updater.pending.setupPath){
      // run the downloaded installer silently; it relaunches the app when done
      startInstallSplash();
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
    /* The overlay hides itself once the last task is ticked. Untick anything and it comes
       straight back — showInactive keeps it from stealing focus from protel.
       The 07:00 reset is the exception: it unticks the whole night by itself, and being
       shown the overlay for it is not wanted ("ill know it has happened"), so that push
       arrives flagged quiet and a hidden overlay stays hidden. One already on screen is
       left alone in both cases. */
    const tasks = (d && d.tasks) || [];
    const finished = tasks.length > 0 && tasks.every(t => t.done);
    if(!finished && !(d && d.quiet)){
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
ipcMain.handle("sc-get", async () => {
  try{
    const {list, active} = readProfiles();
    /* The login entry's state is read back FROM the helper, never mirrored over here —
       a copy in this app's config could only ever drift from what is actually set. */
    return {profiles: list, active, seq: seqConfig(), focus: focusConfig(),
            tauEnter: tauEnterConfig(), boot: await helperVerb("status"),
            available: process.platform === "win32" && !!tauPath()};
  }catch(e){ return {profiles: [], active: null, available: false}; }
});
/* On writes the login entry and starts the helper; off removes it and stops it. This is
   the switch for the whole standalone: with it off, nothing starts with Windows and the
   Caps Lock indicator only exists while RecCheck itself is open. */
ipcMain.handle("sc-boot-set", (_e, on) => helperVerb(on ? "install" : "uninstall"));
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
  const chunks = []; let done = false;
  const finish = () => {
    if(done) return; done = true;
    const out = Buffer.concat(chunks).toString("utf8");
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
    child.stdout.on("data", d => { chunks.push(d); });
    child.on("exit", finish);
    child.on("error", finish);
    setTimeout(() => { try{ child.kill(); }catch(e){} finish(); }, wait + 10000);
  }catch(e){ finish(); }
}));
/* listen for one trigger and store it against an action in the active profile */
ipcMain.handle("sc-detect", (_e, action) => new Promise(async res => {
  if(process.platform !== "win32" || !tauPath() || ACTIONS.indexOf(action) < 0){ res(null); return; }
  try{ if(TAU_DETECT) TAU_DETECT.kill(); }catch(e){}
  TAU_DETECT = null;
  /* The standalone has to stand down first, or its own hooks would swallow the very
     press we are trying to read. AWAITED, not fired and hoped for: it is a separate
     process now, so "asked it to stop" and "it has stopped" are not the same moment. */
  await tauStop();
  const chunks = []; let done = false;
  const finish = v => { if(done) return; done = true; TAU_DETECT = null; tauStart(); res(v); };
  try{
    const child = spawn(tauPath(), ["detect", String(process.pid)], {windowsHide: true});
    TAU_DETECT = child;
    child.stdout.on("data", d => {
      chunks.push(d);
      const out = Buffer.concat(chunks).toString("utf8");
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
  const chunks = []; let done = false;
  /* concat first, decode once: a Greek character split across two chunks is destroyed
     by decoding each chunk on its own. */
  const finish = () => { if(done) return; done = true;
    const out = Buffer.concat(chunks).toString("utf8");
    res(out || null); };
  try{
    const child = spawn(tauPath(), ["diag", String(process.pid), String(wait)], {windowsHide: true});
    child.stdout.on("data", d => { chunks.push(d); });
    child.on("exit", finish);
    child.on("error", finish);
    setTimeout(() => { try{ child.kill(); }catch(e){} finish(); }, wait + 20000);
  }catch(e){ finish(); }
}));
/* The read-only window scan. One shot, installs nothing, spawns a short-lived helper
   that walks the window in front and prints what it is built from — plus, at the end,
   how many messages it asked of protel and how long the sweep took. That last line is
   the whole basis on which he decides whether this stays. */
/* Read a few rows out of the list in the window in front. This is the ONE thing the tool
   does that is not free — the list control writes its answer into a buffer, and for a
   control in another process that buffer must live in that process. The report says so
   itself and prints how many messages it asked and how long it took, the same terms the
   window scan shipped on. Nothing here feeds the ledger yet. */
/* protel's in-house list, straight into the ledger. Same read as sc-readlist and the same
   cost — fewer columns, so fewer messages: six of sixteen over 250 rows is 1500 rather
   than 4000. Returns the helper's raw tab-separated answer; the page parses it, because
   the page is where the shape it has to become already lives. */
/* ---- the lists the resident helper captured when protel opened them ----

   The helper holds a WinEvent hook on protel and reads a list the moment it appears,
   writing the rows to %LOCALAPPDATA%\\RecCheck\\rc-list-<tag>.tsv. This just hands those
   files to the page.

   NOTHING HERE LAUNCHES A PROCESS AND NOTHING HERE TOUCHES PROTEL. It is a file read, so
   the page can ask as often as it likes, and a list he opened for two seconds is still
   there to be collected minutes later. The mtime is returned so the page can tell a new
   capture from one it has already taken. */
ipcMain.handle("sc-listfile", (_e, tag) => {
  try{
    const t = String(tag || "").toUpperCase();
    if(["IH", "MV", "AR", "DP"].indexOf(t) < 0) return null;
    const fs = require("fs"), path2 = require("path");
    const base = process.env.LOCALAPPDATA;
    if(!base) return null;
    const p = path2.join(base, "RecCheck", "rc-list-" + t + ".tsv");
    const st = fs.statSync(p);
    /* a list this old is not news; it is last night's, and the page has had it */
    if(Date.now() - st.mtimeMs > 20 * 3600e3) return null;
    return {tag: t, at: st.mtimeMs, text: fs.readFileSync(p, "utf8")};
  }catch(e){ return null; }
});
/* The other three lists. Same shape as sc-inhouse — one verb per list, the helper picks
   its own window by caption, and the answer is the same TSV with a different tag. */
["moves", "arrivals", "departures"].forEach(verb => {
  ipcMain.handle("sc-" + verb, (_e, maxRows) => new Promise(res => {
    if(process.platform !== "win32" || !tauPath()){ res(null); return; }
    const n = Math.max(1, Math.min(2000, +maxRows || 400));
    const chunks = []; let done = false;
    const finish = () => { if(done) return; done = true;
      res(Buffer.concat(chunks).toString("utf8") || null); };
    try{
      const child = spawn(tauPath(), [verb, String(process.pid), "0", String(n)], {windowsHide: true});
      child.stdout.on("data", d => { chunks.push(d); });
      child.on("exit", finish);
      child.on("error", finish);
      setTimeout(() => { try{ child.kill(); }catch(e){} finish(); }, 30000);
    }catch(e){ finish(); }
  }));
});
ipcMain.handle("sc-inhouse", (_e, maxRows) => new Promise(res => {
  if(process.platform !== "win32" || !tauPath()){ res(null); return; }
  const n = Math.max(1, Math.min(2000, +maxRows || 400));
  const chunks = []; let done = false;
  const finish = () => { if(done) return; done = true;
    const out = Buffer.concat(chunks).toString("utf8");
    res(out || null); };
  try{
    const child = spawn(tauPath(), ["inhouse", String(process.pid), "0", String(n)], {windowsHide: true});
    child.stdout.on("data", d => { chunks.push(d); });
    child.on("exit", finish);
    child.on("error", finish);
    setTimeout(() => { try{ child.kill(); }catch(e){} finish(); }, 30000);
  }catch(e){ finish(); }
}));
ipcMain.handle("sc-readlist", (_e, delayMs, rows) => new Promise(res => {
  if(process.platform !== "win32" || !tauPath()){ res(null); return; }
  const wait = Math.max(1000, Math.min(30000, +delayMs || 6000));
  const n = Math.max(1, Math.min(50, +rows || 5));
  const chunks = []; let done = false;
  /* concat first, decode once: a Greek character split across two chunks is destroyed
     by decoding each chunk on its own. */
  const finish = () => { if(done) return; done = true;
    const out = Buffer.concat(chunks).toString("utf8");
    res(out || null); };
  try{
    const child = spawn(tauPath(), ["readlist", String(process.pid), String(wait), String(n)], {windowsHide: true});
    child.stdout.on("data", d => { chunks.push(d); });
    child.on("exit", finish);
    child.on("error", finish);
    setTimeout(() => { try{ child.kill(); }catch(e){} finish(); }, wait + 30000);
  }catch(e){ finish(); }
}));
ipcMain.handle("sc-scan", (_e, delayMs) => new Promise(res => {
  if(process.platform !== "win32" || !tauPath()){ res(null); return; }
  const wait = Math.max(1000, Math.min(30000, +delayMs || 6000));
  const chunks = []; let done = false;
  /* concat first, decode once: a Greek character split across two chunks is destroyed
     by decoding each chunk on its own. */
  const finish = () => { if(done) return; done = true;
    const out = Buffer.concat(chunks).toString("utf8");
    res(out || null); };
  try{
    const child = spawn(tauPath(), ["scan", String(process.pid), String(wait)], {windowsHide: true});
    child.stdout.on("data", d => { chunks.push(d); });
    child.on("exit", finish);
    child.on("error", finish);
    setTimeout(() => { try{ child.kill(); }catch(e){} finish(); }, wait + 30000);
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
  const chunks = []; let done = false;
  const fin = p => { if(done) return; done = true; const i = snap(); i.probe = p; res(i); };
  try{
    const child = spawn(exe, ["ping"], {windowsHide: true});
    child.stdout.on("data", d => { chunks.push(d); });
    child.on("error", e => fin("spawn-error:" + ((e && (e.code || e.message)) || "unknown")));
    child.on("exit", c => fin(/RCTBIND OK/.test(Buffer.concat(chunks).toString("utf8"))
                              ? "ok" : ("no-reply:exit=" + c)));
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
/* What protel opened tonight — the zero-touch half of the live read. The helper records
   it from WinEvents with nothing sent to protel at all, and clears it at 07:00 with the
   shift. Read straight off disk; the helper is not disturbed to produce it. */
/* WHICH NOTHING IT IS.

   This used to return null for four different situations — no local app-data folder, no
   file, an unreadable file, and a file that is genuinely empty — and the screen turned
   every one of them into the same sentence: "Nothing recorded this shift. It only watches
   once a protel window has been picked as the target." That sentence asserts that protel
   was quiet, which is a fact about protel the tool had not established and could not.
   Three of the four mean something is wrong with the tool, not with the shift.

   So it says which. The reason is a code, not a sentence: the wording belongs in the two
   language tables with everything else he reads. */
ipcMain.handle("sc-watchlog", () => {
  try{
    const fs = require("fs");
    const base = process.env.LOCALAPPDATA;
    if(!base) return {why: "nobase"};
    let txt;
    try{ txt = fs.readFileSync(path.join(base, "RecCheck", "rc-tbind-watch.log"), "utf8"); }
    catch(e){
      const code = (e && (e.code || e.message)) || "unknown";
      return code === "ENOENT" ? {why: "nofile"} : {why: "unread", detail: String(code)};
    }
    if(!txt.trim()) return {why: "blank"};
    /* Keep the head — it names the shift — and the most recent tail, which is the part
       worth reading. A whole shift fits well inside this; the cap is for the pathological
       night, so the dialog stays a dialog. */
    return {log: txt.length > 40000 ? txt.slice(0, 400) + "\n   …\n" + txt.slice(-36000) : txt};
  }catch(e){ return {why: "unread", detail: String((e && (e.code || e.message)) || "unknown")}; }
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
  /* The helper is NOT stopped here. It outliving this app is the whole point of it: the
     Caps Lock indicator has to keep working with RecCheck closed. It notices we are gone
     within two seconds and takes the mouse hook back out on its own, so protel is left
     with exactly what it had before — no hook it did not have while we were running. */
  try{ if(TAU_DETECT) TAU_DETECT.kill(); }catch(e){}
});

ipcMain.handle("app-set-lang", (_e, l) => {
  TRAYLANG = l === "gr" ? "gr" : "en";
  buildTray();
  return true;
});
