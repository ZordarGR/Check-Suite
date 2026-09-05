/* The DEBUG helper line, end to end: the helper's own status answer -> main.js ->
   the sc-helper snapshot -> the page's helperVerdict / helperDetail.

   1.17.38 claimed the line now says which helper answered ("helper=v24"). It could not:
   TAUINFO.ver was set from the status verb and the sc-helper snapshot never copied it, so
   h.ver was undefined on every press. The same shape as the specs= field the same release
   fixed — a diagnostic field that is always empty, read as a measurement. This drives the
   REAL main.js with electron and child_process stubbed, and lifts the two page functions
   by text, so the whole path is what is tested and not a retyped copy of it. */
const Module = require("module"), path = require("path"), fs = require("fs"), os = require("os");
const { EventEmitter } = require("events");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rchelper-"));
const handlers = {};
function FakeWin(){ this.webContents = {send(){}, once(){}, on(){}, openDevTools(){}}; }
["setIgnoreMouseEvents","setAlwaysOnTop","loadURL","on","setBounds","showInactive","hide","show",
 "focus","destroy","setFocusable"].forEach(m => FakeWin.prototype[m] = function(){});
FakeWin.prototype.isVisible = () => true; FakeWin.prototype.isDestroyed = () => false;
const electron = {
  /* whenReady RESOLVES here, unlike the other rigs: the config hub that focusSpec reads is
     built inside the boot, and the specs= field cannot be exercised without it */
  app:{requestSingleInstanceLock:()=>true,on(){},whenReady:()=>Promise.resolve(),exit(){},
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
/* The helper as a fake process: `status` and `ping` answer the way rc-tbind.exe does,
   with the VERSION OF THE EXE ON DISK, because that is what those verbs report. */
const HELPER_VER = "v24";
const spawned = [];
const realCP = require("child_process");
const fakeCP = Object.assign({}, realCP, {
  spawn(exe, args){
    spawned.push(String(args && args[0]));
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.kill = () => {}; c.unref = () => {}; c.pid = 4242;
    const verb = args && args[0];
    setImmediate(() => {
      if(verb === "status") c.stdout.emit("data", Buffer.from("RCTBIND on running " + HELPER_VER + "\n"));
      if(verb === "ping")   c.stdout.emit("data", Buffer.from("RCTBIND OK " + HELPER_VER + "\n"));
      c.emit("exit", 0);
    });
    return c;
  }
});
const realLoad = Module._load;
Module._load = function(req){ if(req === "electron") return electron;
                              if(req === "child_process") return fakeCP;
                              return realLoad.apply(this, arguments); };
Object.defineProperty(process, "platform", {value: "win32", configurable: true});
process.env.LOCALAPPDATA = DIR;
process.env.RECCHECK_UPDATE_URL = "http://127.0.0.1:9/latest.json";   // refused at once; no network
process.on("unhandledRejection", e => { console.log("  boot threw: " + (e && e.stack || e)); process.exit(1); });
require(path.resolve("app/main.js"));
Module._load = realLoad;

/* the two page functions, lifted by text out of the shipped page */
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); if(at < 0) throw new Error("no " + n);
  let d = 0, i = src.indexOf("{", at);
  for(let j = i; j < src.length; j++){ if(src[j] === "{") d++; else if(src[j] === "}"){ d--; if(!d) return src.slice(at + 1, j + 1); } } };
const page = new Function(lift("helperVerdict") + "\n" + lift("helperDetail") + "\nreturn {helperVerdict, helperDetail};")();

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };
const tick = () => new Promise(r => setTimeout(r, 30));

(async () => {
  ck("the handlers are registered", !!handlers["sc-helper"] && !!handlers["sc-focus-set"]);
  await tick(); await tick();                        // let the boot run: hub, window, tauStart

  /* pointing the gate at protel publishes the bindings and (re)starts the helper — the
     same path a click in PROTEL SHORTCUTS takes */
  await handlers["sc-focus-set"](null, true, "PROT");
  await tick(); await tick();
  ck("the status verb was asked", spawned.indexOf("status") >= 0);

  const h = await handlers["sc-helper"]();
  ck("the probe answered ok", h.probe === "ok");
  ck("the snapshot carries the version the helper answered with", h.ver === HELPER_VER);
  ck("and what was written to the binds file", Array.isArray(h.specs) && h.specs.indexOf("focus=PROT") >= 0);
  ck("state is what tauStart wrote", h.state === "running" || h.state === "started");

  const d = page.helperDetail(h);
  ck("the detail line names the exe's version", d.indexOf("exe=" + HELPER_VER) >= 0);
  ck("and does not call it the helper in memory, which nothing here has asked",
     d.indexOf("helper=") < 0);
  ck("and lists the binds", d.indexOf("binds=focus=PROT") >= 0);

  /* "started" is what tauStart writes the moment it has spawned the helper */
  ck("a helper RecCheck just started reads as running when the probe answers",
     page.helperVerdict({state: "started", probe: "ok"}).key === "sc.hOk");
  ck("and as blocked, not running, when the probe gets no reply — the probe outranks the state",
     page.helperVerdict({state: "started", probe: "no-reply:exit=1"}).key === "sc.hBlocked");
  ck("a helper that answered status but was never spawned is still running",
     page.helperVerdict({state: "running", probe: "ok"}).key === "sc.hOk");

  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
