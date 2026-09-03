/* Drives the REAL main.js overlay-data handler with electron stubbed. */
const Module = require("module");
const path = require("path");
const handlers = {};
let shown = 0, hidden = false, boundsCalls = 0, sentToOverlay = [];

function FakeWin(){
  this.webContents = {send: (ch, d) => sentToOverlay.push(ch), once: () => {}, on: () => {}, openDevTools(){}};
}
FakeWin.prototype.setIgnoreMouseEvents = function(){};
FakeWin.prototype.setAlwaysOnTop = function(){};
FakeWin.prototype.loadURL = function(){};
FakeWin.prototype.on = function(){};
FakeWin.prototype.setBounds = function(){ boundsCalls++; };
FakeWin.prototype.isVisible = function(){ return !hidden; };
FakeWin.prototype.showInactive = function(){ shown++; hidden = false; };
FakeWin.prototype.hide = function(){ hidden = true; };
FakeWin.prototype.show = function(){ shown++; hidden = false; };
FakeWin.prototype.focus = function(){};
FakeWin.prototype.destroy = function(){};
FakeWin.prototype.isDestroyed = function(){ return false; };
FakeWin.prototype.setFocusable = function(){};

const electron = {
  app: {requestSingleInstanceLock: () => true, on(){}, whenReady: () => new Promise(()=>{}), exit(){},
        getPath: () => "/tmp", setLoginItemSettings(){}, getLoginItemSettings: () => ({}), isPackaged: false, quit(){}},
  BrowserWindow: FakeWin,
  ipcMain: {handle: (ch, fn) => handlers[ch] = fn, on: () => {}},
  shell: {openExternal(){}}, dialog: {}, Tray: function(){ this.setToolTip=()=>{}; this.setContextMenu=()=>{}; this.on=()=>{}; },
  Menu: {buildFromTemplate: () => ({})}, globalShortcut: {register: () => true, unregisterAll(){}, unregister(){}},
  screen: {getPrimaryDisplay: () => ({workArea: {x:0,y:0,width:1920,height:1080}}),
           getDisplayNearestPoint: () => ({workArea: {x:0,y:0,width:1920,height:1080}}), getCursorScreenPoint: () => ({x:0,y:0})}
};
const realLoad = Module._load;
Module._load = function(req, parent, isMain){
  if(req === "electron") return electron;
  return realLoad.apply(this, arguments);
};
require(path.resolve("app/main.js"));
Module._load = realLoad;

const set = handlers["overlay-data"];
const toggle = handlers["overlay-toggle"];
if(!set) { console.log("overlay-data handler not captured"); process.exit(1); }

(async () => {
  await toggle();                                  // create the overlay window
  const tasks = n => Array.from({length:n}, (_,i) => ({id:"t"+i, text:"task "+i, done:true, tier:"low"}));
  const untick = t => t.map(x => ({...x, done:false}));

  const T = tasks(3);
  await set({}, {tasks: T, cfg: {}, lang: "en"});   // all done -> overlay puts itself away
  hidden = true; shown = 0;                        // (the renderer's complete() does the hiding)

  await set({}, {tasks: untick(T), cfg: {}, lang: "en"});
  const onManualUntick = shown;
  shown = 0; hidden = true;

  await set({}, {tasks: untick(T), cfg: {}, lang: "en", quiet: true});
  const onQuietReset = shown;

  shown = 0; hidden = false;                        // already on screen
  await set({}, {tasks: untick(T), cfg: {}, lang: "en", quiet: true});
  const whenVisible = hidden;

  const checks = [
    ["a manual untick still brings a hidden overlay back", onManualUntick === 1],
    ["the 07:00 reset leaves a hidden overlay hidden",     onQuietReset === 0],
    ["a visible overlay is never hidden by the reset",     whenVisible === false],
    ["data still reaches the overlay window either way",   sentToOverlay.filter(c => c === "overlay-data").length >= 4]
  ];
  let bad = 0;
  for(const [l, ok] of checks){ if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); }
  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
})();
