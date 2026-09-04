/* The helper's output reaches RecCheck as raw bytes over a pipe. Greek guest names are
   the first thing that has ever gone through it that is not ASCII, so this checks the
   two ways that breaks: decoding each chunk on its own (which destroys a character split
   across the boundary), and reading a handler's text through a binding that no longer
   exists. Drives the REAL main.js with electron and child_process stubbed. */
const Module = require("module"), path = require("path"), { EventEmitter } = require("events");
const handlers = {};
let nextChunks = [];
function FakeWin(){ this.webContents = {send(){}, once(){}, on(){}, openDevTools(){}}; }
["setIgnoreMouseEvents","setAlwaysOnTop","loadURL","on","setBounds","showInactive","hide","show",
 "focus","destroy","setFocusable"].forEach(m => FakeWin.prototype[m] = function(){});
FakeWin.prototype.isVisible = () => true; FakeWin.prototype.isDestroyed = () => false;
const electron = {
  app:{requestSingleInstanceLock:()=>true,on(){},whenReady:()=>new Promise(()=>{}),exit(){},
       getPath:()=>"/tmp",setLoginItemSettings(){},getLoginItemSettings:()=>({}),isPackaged:false,quit(){}},
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
  spawn(){
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kill = () => {};
    setImmediate(() => {
      nextChunks.forEach(b => c.stdout.emit("data", b));
      c.emit("exit", 0);
    });
    return c;
  }
});
const realLoad = Module._load;
Module._load = function(req){ if(req === "electron") return electron;
                              if(req === "child_process") return fakeCP;
                              return realLoad.apply(this, arguments); };
process.platform = process.platform;             // leave as-is; handlers gate on win32
Object.defineProperty(process, "platform", {value: "win32", configurable: true});
require(path.resolve("app/main.js"));
Module._load = realLoad;

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };
/* split a Greek string mid-character: the byte boundary lands inside a two-byte letter */
function splitMid(s){
  const b = Buffer.from(s, "utf8");
  const at = Math.floor(b.length / 2);
  const cut = (b[at] & 0xC0) === 0x80 ? at : at + 1;   // land inside a continuation byte
  return [b.slice(0, cut), b.slice(cut)];
}
(async () => {
  const GREEK = "  row 0:  [112] [ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ] [03/09/26] [ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ]";
  const parts = splitMid(GREEK);
  ck("the test really does split a character in two",
     parts[0].toString("utf8") + parts[1].toString("utf8") !== GREEK);

  nextChunks = parts;
  const read = await handlers["sc-readlist"]({}, 1000, 5);
  ck("the list read comes back with the Greek intact", read && read.indexOf("ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ") >= 0);
  ck("and nothing was mangled at the split",           read && read.indexOf("�") < 0);

  nextChunks = splitMid("front: PROT32 | FO | Ξενοδοχείο Κέρνος\n" + GREEK);
  const read2 = await handlers["sc-readlist"]({}, 1000, 5);
  ck("a Greek window title survives too",              read2 && read2.indexOf("Ξενοδοχείο Κέρνος") >= 0);

  nextChunks = [Buffer.from("RCTBIND OK v15\n", "utf8")];
  const ping = await handlers["sc-helper"]();
  /* tauPath() finds no rc-tbind.exe in a container, so this cannot reach the spawn — what
     it proves is that the rewritten handler still answers instead of throwing on a
     binding that no longer exists. */
  ck("the helper ping answers rather than throwing  (probe=" + (ping && ping.probe) + ")",
     !!ping && typeof ping.probe === "string");

  nextChunks = [Buffer.from("FG\tPROT32\tFO\tΚέρνος\n", "utf8")];
  const fg = await handlers["sc-focus-pick"]({}, 1000);
  ck("focus-pick still parses, and in Greek",          fg && fg.title === "Κέρνος" && fg.exe === "PROT32");

  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
