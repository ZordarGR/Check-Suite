/* The DEBUG helper line, end to end: the helper's own status answer -> main.js ->
   the sc-helper snapshot -> the page's helperVerdict / helperDetail.

   1.17.38 claimed the line now says which helper answered ("helper=v24"). It could not:
   TAUINFO.ver was set from the status verb and the sc-helper snapshot never copied it, so
   h.ver was undefined on every press. The same shape as the specs= field the same release
   fixed — a diagnostic field that is always empty, read as a measurement.

   The pre-merge check of 1.17.38 found three more in the same line, all of the kind his
   rules forbid — a diagnostic asserting what it has not established:
     * "started" read as "Running — your bindings are live". That state is written the
       instant the helper is SPAWNED and never revisited, and the press's probe ran a
       fresh `ping` process, which answers whether the EXE runs and says nothing about the
       resident. A helper that died 53 ms after spawn (the Split landmine) showed green.
     * binds= printed the specs before the file was written, and "COULD NOT WRITE" never
       left main.js.
     * a spawn Windows refuses arrives as an async 'error' event, not a throw, so the
       catch that writes "spawn-failed" never ran.
   So the press now asks `status`, which LOOKS FOR the resident's window — the one fact
   about the running helper that can be established from outside it — and the verdict is
   built on that answer. The version it prints is labelled for what it is: the exe on
   disk that answered. Neither verb asks the resident its version.

   This drives the REAL main.js with electron and child_process stubbed, booting far
   enough for the config hub to exist, and lifts the two page functions by text, so the
   whole path is what is tested and not a retyped copy of it. */
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
/* The helper as a fake process. `status` answers the way rc-tbind.exe does: the login
   entry, whether the RESIDENT's window was found, and the VERSION OF THE EXE ON DISK —
   because that is all the verb knows. `run` is the resident being started. */
const HELPER = {ver: "v24", on: true, running: true, statusReply: null, runFails: false};
const spawned = [];
const realCP = require("child_process");
const fakeCP = Object.assign({}, realCP, {
  spawn(exe, args){
    const verb = args && args[0];
    spawned.push(String(verb));
    const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.kill = () => {}; c.unref = () => {}; c.pid = 4242;
    setImmediate(() => {
      if(verb === "run" && HELPER.runFails){
        const e = new Error("spawn EACCES"); e.code = "EACCES"; c.emit("error", e); return;
      }
      if(verb === "status"){
        const line = HELPER.statusReply !== null ? HELPER.statusReply
          : "RCTBIND " + (HELPER.on ? "on" : "off") + " " + (HELPER.running ? "running" : "stopped") + " " + HELPER.ver + "\n";
        if(line) c.stdout.emit("data", Buffer.from(line));
      }
      if(verb === "ping") c.stdout.emit("data", Buffer.from("RCTBIND OK " + HELPER.ver + "\n"));
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
let uncaught = null;
process.on("uncaughtException", e => { uncaught = e; });
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
const CRASH = path.join(DIR, "RecCheck", "rc-tbind-crash.txt");
const BINDS = path.join(DIR, "RecCheck", "rc-tbind-binds.txt");
/* pointing the gate at protel publishes the bindings and (re)starts the helper — the
   same path a click in PROTEL SHORTCUTS takes */
async function rebind(){ spawned.length = 0; await handlers["sc-focus-set"](null, true, "PROT"); await tick(); await tick(); }
async function press(){ spawned.length = 0; const h = await handlers["sc-helper"](); await tick(); return h; }

(async () => {
  ck("the handlers are registered", !!handlers["sc-helper"] && !!handlers["sc-focus-set"]);
  await tick(); await tick();                        // let the boot run: hub, window, tauStart

  /* 1. the ordinary night: the resident is up and answers */
  await rebind();
  ck("the status verb was asked at start", spawned.indexOf("status") >= 0);
  let h = await press();
  ck("the press asks status — the verb that looks for the resident — not merely ping",
     spawned.indexOf("status") >= 0);
  ck("the probe answered ok", h.probe === "ok");
  ck("the snapshot says the resident was found", h.running === true);
  ck("the snapshot carries the version the helper answered with", h.ver === HELPER.ver);
  ck("and what was written to the binds file", Array.isArray(h.specs) && h.specs.indexOf("focus=PROT") >= 0);
  ck("the verdict is running", page.helperVerdict(h).key === "sc.hOk");
  let d = page.helperDetail(h);
  ck("the detail line names the exe's version, as the exe's", d.indexOf("exe=" + HELPER.ver) >= 0);
  ck("and does not call it the helper in memory, which nothing here has asked",
     d.indexOf("helper=") < 0);
  ck("and lists the binds", d.indexOf("binds=focus=PROT") >= 0);
  ck("and says the resident was found", d.indexOf("resident=up") >= 0);

  /* 2. RecCheck started the helper and it is gone by the time DEBUG is opened — the
        53 ms Split crash, or Windows shutting it down. `state` still says "started". */
  HELPER.running = false;
  await rebind();                                    // status: stopped -> RecCheck spawns run
  ck("RecCheck tried to start it", spawned.indexOf("run") >= 0);
  fs.mkdirSync(path.dirname(CRASH), {recursive: true});
  fs.writeFileSync(CRASH, "run: MissingMethodException at ParseBind\n");
  h = await press();
  ck("the snapshot says the resident was NOT found", h.running === false);
  ck("state still says started — the spawn is all main.js ever saw", h.state === "started");
  ck("a helper that is gone and left a crash file reads as CRASHED, not running",
     page.helperVerdict(h).key === "sc.hCrash");
  ck("and the detail says the resident is down", page.helperDetail(h).indexOf("resident=down") >= 0);
  fs.unlinkSync(CRASH);
  h = await press();
  ck("gone with no crash file reads as started-and-stopped, not running",
     page.helperVerdict(h).key === "sc.hDead");

  /* 3. Windows refuses the spawn — delivered as an async 'error' event, not a throw */
  HELPER.runFails = true;
  await rebind();
  ck("the refusal did not become an uncaught exception in the main process", uncaught === null);
  h = await press();
  ck("the state says the spawn failed", h.state === "spawn-failed");
  ck("with the reason", /EACCES/.test(h.err || ""));
  ck("and the verdict is blocked, which is the antivirus text", page.helperVerdict(h).key === "sc.hBlocked");
  HELPER.runFails = false; HELPER.running = true;

  /* 4. the binds file cannot be written: the specs must not be shown as published */
  const realWrite = fs.writeFileSync;
  fs.writeFileSync = function(p){ if(String(p) === BINDS){ const e = new Error("EACCES"); e.code = "EACCES"; throw e; }
                                  return realWrite.apply(this, arguments); };
  await rebind();
  fs.writeFileSync = realWrite;
  h = await press();
  ck("no specs are claimed for a file that was not written", !(h.specs && h.specs.length));
  d = page.helperDetail(h);
  ck("the detail line says the binds could not be written", d.indexOf("binds=COULD NOT WRITE") >= 0);
  ck("and does not list bindings as if they were", d.indexOf("binds=focus=PROT") < 0);
  await rebind();                                    // writable again
  h = await press();
  ck("and once written they are listed again", page.helperDetail(h).indexOf("binds=focus=PROT") >= 0);

  /* 5. the exe on disk does not answer at all */
  HELPER.statusReply = "";
  h = await press();
  ck("no answer from the exe is blocked, whatever the state says", page.helperVerdict(h).key === "sc.hBlocked");
  HELPER.statusReply = null;

  /* 6. the verdict on its own: the probe outranks the state, the resident outranks both */
  ck("probe ok + resident found = running",
     page.helperVerdict({state: "started", probe: "ok", running: true}).key === "sc.hOk");
  ck("probe ok + resident not found + started = started and stopped",
     page.helperVerdict({state: "started", probe: "ok", running: false}).key === "sc.hDead");
  ck("probe ok + resident not found + crash = crashed",
     page.helperVerdict({state: "started", probe: "ok", running: false, crash: "x"}).key === "sc.hCrash");
  ck("no reply = blocked even if the resident was seen earlier",
     page.helperVerdict({state: "running", probe: "no-reply:exit=1", running: true}).key === "sc.hBlocked");
  ck("missing exe = missing", page.helperVerdict({state: "no-exe", probe: "missing"}).key === "sc.hMissing");

  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
