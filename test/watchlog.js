/* Which nothing it is — the two main.js handlers that read the helper's files off disk,
   driven through the REAL main.js with electron stubbed.

   sc-watchlog (1.17.37) used to return null for four different situations and the screen
   printed "Nothing recorded this shift" for all of them — a claim about protel made from
   the tool's own failure. sc-listfile (1.17.39) had the same shape: null for a missing
   file, a file too old, a file that could not be read and no app-data folder at all, and
   the page turned every one into "nothing captured from protel yet". Both say which now,
   and this pins each answer to the situation that produces it. The 1.17.37 fix shipped
   with no test at all; the only bridge stubs still returned the old null. */
const Module = require("module"), path = require("path"), fs = require("fs"), os = require("os");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rcwatch-"));
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
const realLoad = Module._load;
Module._load = function(req){ if(req === "electron") return electron; return realLoad.apply(this, arguments); };
require(path.resolve("app/main.js"));
Module._load = realLoad;

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };
const RC = path.join(DIR, "RecCheck");
const WATCH = path.join(RC, "rc-tbind-watch.log");
const LIST = tag => path.join(RC, "rc-list-" + tag + ".tsv");

(async () => {
  const watch = handlers["sc-watchlog"], list = handlers["sc-listfile"];
  ck("both handlers are registered", !!watch && !!list);

  /* ---- the watch log ---- */
  delete process.env.LOCALAPPDATA;
  ck("no app-data folder is its own answer",           (await watch()).why === "nobase");
  process.env.LOCALAPPDATA = DIR;
  ck("no file is its own answer",                      (await watch()).why === "nofile");
  fs.mkdirSync(RC, {recursive: true});
  fs.writeFileSync(WATCH, "  \r\n");
  ck("a blank file is its own answer",                 (await watch()).why === "blank");
  fs.writeFileSync(WATCH, "rc-tbind watch v25  shift of 20260905\r\n04:12:01  HOOKS  1 protel process(es): 1234\r\n");
  const r = await watch();
  ck("a real log comes back as the log",               typeof r.log === "string" && /HOOKS/.test(r.log));
  fs.unlinkSync(WATCH); fs.mkdirSync(WATCH);            // a directory where the file should be
  const u = await watch();
  ck("a file that cannot be read says so, with why",   u.why === "unread" && /EISDIR/.test(u.detail || ""));
  fs.rmdirSync(WATCH);

  /* ---- the capture files ---- */
  ck("a tag that is not one of the four is refused",   (await list(null, "XX")) === null);
  delete process.env.LOCALAPPDATA;
  ck("no app-data folder is said, not null",           (await list(null, "IH")).why === "nobase");
  process.env.LOCALAPPDATA = DIR;
  ck("no such file is null — and only that is",        (await list(null, "IH")) === null);
  fs.writeFileSync(LIST("IH"), "TITLE\tGuests inhouse: 05/09/26\nIH\tA\t101\t2/0/0/0/0\t01/09/26\t07/09/26\tCI\nDONE\t1\t1\t9\t5\tunicode\tcomplete\n");
  const f = await list(null, "ih");
  ck("a fresh file comes back with its text and mtime", f && f.tag === "IH" && /Guests inhouse/.test(f.text) && f.at > 1e12);
  const old = (Date.now() - 21 * 3600e3) / 1000;
  fs.utimesSync(LIST("IH"), old, old);
  const o = await list(null, "IH");
  ck("a file older than twenty hours is said to be old, not absent", o && o.why === "old" && !o.text);
  fs.unlinkSync(LIST("IH")); fs.mkdirSync(LIST("IH"));
  const e = await list(null, "IH");
  ck("a file that cannot be read says so, with why",   e && e.why === "unread" && /EISDIR/.test(e.detail || ""));
  fs.rmdirSync(LIST("IH"));

  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
