/* The room database mirrored into the app's own folder, driven through the REAL main.js
   handlers with electron stubbed — the same rig as stdout.js.

   Two things matter here and neither is the obfuscation, which is deliberately weak and
   only there so the file cannot be read by opening it. What matters is that it ROUND
   TRIPS a Greek guest name exactly, and that every way it can fail returns null instead
   of throwing — because the renderer treats a failure as "carry on with localStorage",
   and an exception there would take the room database out with it. */
const Module = require("module"), path = require("path"), fs = require("fs"), os = require("os");
const { EventEmitter } = require("events");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rcrooms-"));
const handlers = {};
function FakeWin(){ this.webContents = {send(){}, once(){}, on(){}, openDevTools(){}}; }
["setIgnoreMouseEvents","setAlwaysOnTop","loadURL","on","setBounds","showInactive","hide","show",
 "focus","destroy","setFocusable"].forEach(m => FakeWin.prototype[m] = function(){});
FakeWin.prototype.isVisible = () => true; FakeWin.prototype.isDestroyed = () => false;
const electron = {
  app:{requestSingleInstanceLock:()=>true,on(){},whenReady:()=>new Promise(()=>{}),exit(){},
       getPath:()=>DIR,setLoginItemSettings(){},getLoginItemSettings:()=>({}),isPackaged:false,quit(){}},
  BrowserWindow: FakeWin,
  ipcMain:{handle:(c,f)=>handlers[c]=f, on(){}},
  shell:{openExternal(){}}, dialog:{},
  Tray:function(){this.setToolTip=()=>{};this.setContextMenu=()=>{};this.on=()=>{};},
  Menu:{buildFromTemplate:()=>({})},
  globalShortcut:{register:()=>true,unregisterAll(){},unregister(){}},
  screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1080}}),
          getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1920,height:1080}}),
          getCursorScreenPoint:()=>({x:0,y:0})}
};
const realCP = require("child_process");
const fakeCP = Object.assign({}, realCP, {
  spawn(){ const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
           c.kill = () => {}; c.unref = () => {}; setImmediate(() => c.emit("exit", 0)); return c; }
});
const realLoad = Module._load;
Module._load = function(req){ if(req === "electron") return electron;
                              if(req === "child_process") return fakeCP;
                              return realLoad.apply(this, arguments); };
Object.defineProperty(process, "platform", {value: "win32", configurable: true});
require(path.resolve("app/main.js"));
Module._load = realLoad;

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };
const F = path.join(DIR, "rooms.dat");

(async () => {
  ck("both handlers are registered", !!handlers["rooms-read"] && !!handlers["rooms-write"]);
  ck("nothing on disk reads back as null, not a throw",
     (await handlers["rooms-read"]()) === null);

  const ROOMS = {
    "426": {guest: "ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA", liveKey: 20260904, seen: null},
    "112": {guest: "ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ/ΕΛΕΝΗ", nick: "η γωνία", seen: "4/9/2026"},
    "94":  {guest: "AUSWOGER/WINKLER FABIAN/NATALIE", liveKey: 20260904}
  };
  ck("it writes", (await handlers["rooms-write"](null, ROOMS)) === true);
  ck("the file is really there", fs.existsSync(F));

  const raw = fs.readFileSync(F);
  ck("and is not the names in plain sight",
     raw.toString("latin1").indexOf("ABBUSHI") < 0 && raw.toString("latin1").indexOf("guest") < 0);
  ck("it is stamped so a foreign file is not mistaken for one of ours",
     raw.slice(0, 4).toString("latin1") === "RCR1");

  const back = await handlers["rooms-read"]();
  ck("it round trips exactly", JSON.stringify(back) === JSON.stringify(ROOMS));
  ck("the Greek name survives byte for byte",
     back["112"].guest === "ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ/ΕΛΕΝΗ");
  ck("and the nickname with it",              back["112"].nick === "η γωνία");
  ck("the live stamp survives",               back["426"].liveKey === 20260904);

  /* every way it can go wrong must be null, never a throw */
  fs.writeFileSync(F, Buffer.from("not ours at all", "utf8"));
  ck("a foreign file reads as null",          (await handlers["rooms-read"]()) === null);
  fs.writeFileSync(F, Buffer.concat([Buffer.from("RCR1","latin1"), Buffer.from("garbage")]));
  ck("our stamp over rubbish reads as null",  (await handlers["rooms-read"]()) === null);
  fs.writeFileSync(F, Buffer.from("RCR", "latin1"));
  ck("a truncated file reads as null",        (await handlers["rooms-read"]()) === null);

  ck("an array is refused",                   (await handlers["rooms-write"](null, [1,2])) === false);
  ck("null is refused",                       (await handlers["rooms-write"](null, null)) === false);

  /* the write must be atomic — no .tmp left behind to be read as the real thing */
  await handlers["rooms-write"](null, ROOMS);
  ck("no half-written file is left beside it", !fs.existsSync(F + ".tmp"));

  /* an empty database is legitimate: he may clear every room */
  ck("an empty object is accepted",           (await handlers["rooms-write"](null, {})) === true);
  ck("and reads back empty, not null",
     JSON.stringify(await handlers["rooms-read"]()) === "{}");

  try{ fs.rmSync(DIR, {recursive: true, force: true}); }catch(e){}
  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
