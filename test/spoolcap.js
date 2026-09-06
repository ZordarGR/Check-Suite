/* Stage 1 of the redacted print — the spool watcher in main.js, driven through the REAL
   main.js with electron stubbed and a fake spool folder under a temp SystemRoot.

   What it holds the line on: nothing is listed or copied unless armed; a job that grows
   is copied at each size seen and the final copy is the whole file; a job the spooler
   takes away is said to be gone, with how long it lived; a read the spooler refuses is
   counted with its code and asked for again, never thrown; the text is pulled out of NT
   EMF (EXTTEXTOUTW, SMALLTEXTOUT, GDI+ comments counted) and out of XPS (stored and
   deflated pages, numeric page order, entities unescaped); the job-info strings are found
   at both alignments; the window ends and the polling with it; the bound is on disk, by
   job, oldest first; a copy from an earlier run is listed; delete deletes. */
const Module = require("module"), path = require("path"), fs = require("fs"), os = require("os");
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rcspool-"));
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
process.env.SystemRoot = DIR;
process.env.LOCALAPPDATA = DIR;
const realLoad = Module._load;
Module._load = function(req){ if(req === "electron") return electron; return realLoad.apply(this, arguments); };
require(path.resolve("app/main.js"));
Module._load = realLoad;

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SPOOL = path.join(DIR, "System32", "spool", "PRINTERS");
const CAP = path.join(DIR, "spool-cap");
fs.mkdirSync(SPOOL, {recursive: true});
const sp = n => path.join(SPOOL, n), cp = n => path.join(CAP, n);
const capList = () => { try{ return fs.readdirSync(CAP).filter(n => /\.(spl|shd)$/i.test(n)).sort(); }catch(e){ return []; } };

/* ---- synthetic jobs, built from the record layouts main.js reads ---- */
const pad4 = b => { const r = b.length % 4; return r ? Buffer.concat([b, Buffer.alloc(4 - r)]) : b; };
function emrHeader(){ const b = Buffer.alloc(88); b.writeUInt32LE(1, 0); b.writeUInt32LE(88, 4); b.write(" EMF", 40, "latin1"); b.writeUInt32LE(0x00010000, 44); return b; }
function emrExtTextOutW(x, y, s){
  const body = pad4(Buffer.from(s, "utf16le")), b = Buffer.alloc(76);
  b.writeUInt32LE(84, 0); b.writeUInt32LE(76 + body.length, 4);
  b.writeInt32LE(x, 36); b.writeInt32LE(y, 40); b.writeUInt32LE(s.length, 44); b.writeUInt32LE(76, 48);
  return Buffer.concat([b, body]);
}
function emrSmallTextOut(x, y, s, noRect){
  const body = pad4(Buffer.from(s, "utf16le")), head = noRect ? 36 : 52, b = Buffer.alloc(head);
  b.writeUInt32LE(108, 0); b.writeUInt32LE(head + body.length, 4);
  b.writeInt32LE(x, 8); b.writeInt32LE(y, 12); b.writeUInt32LE(s.length, 16); b.writeUInt32LE(noRect ? 0x100 : 0, 20);
  return Buffer.concat([b, body]);
}
function emrComment(sig){
  const data = Buffer.from(sig + "junkjunk", "latin1"), body = pad4(data), b = Buffer.alloc(12);
  b.writeUInt32LE(70, 0); b.writeUInt32LE(12 + body.length, 4); b.writeUInt32LE(data.length, 8);
  return Buffer.concat([b, body]);
}
function emrEof(){ const b = Buffer.alloc(20); b.writeUInt32LE(14, 0); b.writeUInt32LE(20, 4); return b; }
function emfSpool(pages){
  const hdr = Buffer.alloc(32); hdr.writeUInt32LE(0x00010008, 0); hdr.writeUInt32LE(32, 4);
  return Buffer.concat([hdr, ...pages.map(p => { const r = Buffer.alloc(8); r.writeUInt32LE(0x0C, 0); r.writeUInt32LE(p.length, 4); return Buffer.concat([r, p]); })]);
}
function zipBuild(entries){
  const zlib = require("zlib"), locals = [], cds = []; let off = 0;
  for(const e of entries){
    const name = Buffer.from(e.name, "utf8"), raw = Buffer.from(e.data, "utf8");
    const data = e.deflate ? zlib.deflateRawSync(raw) : raw;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(e.deflate ? 8 : 0, 10);
    cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(off, 42);
    locals.push(lh, name, data); cds.push(cd, name); off += 30 + name.length + data.length;
  }
  const cdBuf = Buffer.concat(cds), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}
const PAGE1 = Buffer.concat([emrHeader(), emrExtTextOutW(100, 200, "ΑΒΓΔΕ ROOM 101"), emrSmallTextOut(300, 400, "BB", true),
                             emrComment("EMF+"), emrComment("GDIC"), emrEof()]);
const PAGE2 = Buffer.concat([emrHeader(), emrSmallTextOut(10, 20, "05/09/26 HB", false), emrExtTextOutW(7, 8, "x"), emrEof()]);
const JOB = emfSpool([PAGE1, PAGE2]);
const SHD = Buffer.concat([Buffer.alloc(16, 0xaa), Buffer.from("Departure Report for 05/09/26", "utf16le"), Buffer.alloc(6),
                           Buffer.from("HP LaserJet 400", "utf16le"), Buffer.alloc(3), Buffer.from("NT EMF 1.008", "utf16le"), Buffer.alloc(2)]);
const XPS = zipBuild([
  {name: "Documents/1/Pages/10.fpage", data: '<FixedPage><Glyphs OriginX="5" OriginY="6" UnicodeString="page ten" /></FixedPage>', deflate: true},
  {name: "Documents/1/Pages/2.fpage",  data: '<FixedPage><Glyphs UnicodeString="Room 101 &amp; 102" OriginX="12.5" OriginY="30"/><Glyphs OriginX="1" OriginY="2" UnicodeString="&#x3B1;&#946;"/></FixedPage>', deflate: false},
  {name: "[Content_Types].xml", data: "<Types/>", deflate: true},
]);

(async () => {
  const arm = handlers["sc-spoolarm"], state = handlers["sc-spoolstate"], text = handlers["sc-spooltext"], clear = handlers["sc-spoolclear"];
  ck("the four handlers are registered", !!arm && !!state && !!text && !!clear);

  /* ---- 1. not armed: nothing is looked at ---- */
  fs.writeFileSync(sp("00001.SPL"), JOB);
  await sleep(200);
  let st = await state();
  ck("not armed: the folder is not listed",                 st.armed === false && st.ticks === 0);
  ck("not armed: nothing is copied",                        st.files.length === 0 && capList().length === 0);
  ck("the state names the folder it would watch",           st.dir === SPOOL && st.capDir === CAP);
  fs.unlinkSync(sp("00001.SPL"));

  /* ---- 2. a job that grows, then goes ---- */
  st = await arm(null, 1500);
  ck("armed: the window is open",                           st.armed === true && st.until > Date.now());
  fs.writeFileSync(sp("00002.SHD"), SHD);
  fs.writeFileSync(sp("00002.SPL"), JOB.slice(0, 200));
  await sleep(150);
  fs.appendFileSync(sp("00002.SPL"), JOB.slice(200));
  await sleep(150);
  st = await state();
  let f = st.files.find(x => x.name === "00002.SPL");
  ck("the job was seen while it grew",                      !!f && f.sizes.length >= 2 && f.sizes[0] === 200 && f.sizes[f.sizes.length - 1] === JOB.length);
  ck("the copy is the whole job",                           f && f.copied === JOB.length && fs.readFileSync(cp("00002.SPL")).equals(JOB));
  ck("the job-info file is copied too",                     fs.existsSync(cp("00002.SHD")) && fs.readFileSync(cp("00002.SHD")).equals(SHD));
  ck("still there is said as still there",                  f && !f.gone);
  fs.unlinkSync(sp("00002.SPL")); fs.unlinkSync(sp("00002.SHD"));
  await sleep(150);
  st = await state();
  f = st.files.find(x => x.name === "00002.SPL");
  ck("gone is said as gone, with how long it lived",        f && f.gone > f.first && f.gone - f.first > 200);
  ck("the copy stays after the spooler took the original", fs.existsSync(cp("00002.SPL")));
  ck("reads were never refused for a plain file",           f && f.readFails === 0 && f.readErr === null);

  /* ---- 3. the text out of NT EMF ---- */
  let tx = await text(null, "00002.SPL");
  ck("the format is read off the header",                   tx.format === "emfspool" && tx.head === JOB.slice(0, 16).toString("hex"));
  ck("every embedded metafile is a page",                   tx.pages && tx.pages.length === 2);
  const p1 = tx.pages && tx.pages[0], p2 = tx.pages && tx.pages[1];
  ck("EXTTEXTOUTW comes out whole, Greek included",         p1 && p1.texts.some(t => t.x === 100 && t.y === 200 && t.s === "ΑΒΓΔΕ ROOM 101"));
  ck("SMALLTEXTOUT without a rectangle",                    p1 && p1.texts.some(t => t.x === 300 && t.y === 400 && t.s === "BB"));
  ck("SMALLTEXTOUT with a rectangle",                       p2 && p2.texts.some(t => t.x === 10 && t.y === 20 && t.s === "05/09/26 HB"));
  ck("a one-character string survives",                     p2 && p2.texts.some(t => t.s === "x"));
  ck("GDI+ comments are counted, other comments are not",   tx.emfPlus === 1);
  ck("the record histogram names what was there",           tx.types && tx.types[84] === 2 && tx.types[108] === 2 && tx.types[70] === 2 && tx.types[14] === 2);
  ck("page 1 walked to its EOF and no further",             p1 && p1.records === 6);
  tx = await text(null, "00002.SHD");
  ck("the job-info strings are found",                      tx.format === "shd" && tx.strings.indexOf("Departure Report for 05/09/26") >= 0 && tx.strings.indexOf("HP LaserJet 400") >= 0);
  ck("… at the odd alignment too",                          tx.strings.indexOf("NT EMF 1.008") >= 0);

  /* ---- 4. a read the spooler refuses ---- */
  fs.mkdirSync(sp("00003.SPL"));
  await sleep(150);
  st = await state();
  f = st.files.find(x => x.name === "00003.SPL");
  ck("a refused read is counted with its code, not thrown", f && f.readFails >= 2 && /EISDIR/.test(f.readErr) && f.copied === 0);
  ck("and the watcher is still running",                    st.armed === true);
  fs.rmdirSync(sp("00003.SPL"));

  /* ---- 5. an XPS job, and the other shapes ---- */
  fs.writeFileSync(sp("00004.SPL"), XPS);
  fs.writeFileSync(sp("00005.SPL"), Buffer.from("%!PS-Adobe-3.0\n", "latin1"));
  fs.writeFileSync(sp("00006.SPL"), Buffer.from("\x1bE\x1b&l0O", "latin1"));
  fs.writeFileSync(sp("00007.SPL"), Buffer.from("plain " + " h e l l o ", "latin1"));
  await sleep(150);
  tx = await text(null, "00004.SPL");
  ck("an XPS job is a zip and says so",                     tx.format === "xps" && tx.entries === 3);
  ck("its pages come in numeric order, deflated or stored", tx.pages && tx.pages.length === 2 && /2\.fpage$/.test(tx.pages[0].name) && /10\.fpage$/.test(tx.pages[1].name));
  ck("the glyphs come out with their origins, unescaped",   tx.pages && tx.pages[0].texts.some(t => t.x === 12.5 && t.y === 30 && t.s === "Room 101 & 102"));
  ck("numeric entities decode",                             tx.pages && tx.pages[0].texts.some(t => t.s === "αβ"));
  ck("the deflated page was inflated",                      tx.pages && tx.pages[1].texts.some(t => t.s === "page ten"));
  ck("PostScript is named",                                 (await text(null, "00005.SPL")).format === "postscript");
  ck("PCL is named",                                        (await text(null, "00006.SPL")).format === "pcl");
  tx = await text(null, "00007.SPL");
  ck("an unknown shape is said to be unknown, with its strings", tx.format === "unknown" && tx.strings.indexOf("hello") >= 0);
  ["00004", "00005", "00006", "00007"].forEach(n => fs.unlinkSync(sp(n + ".SPL")));

  /* ---- 6. a job too big to copy ---- */
  fs.writeFileSync(sp("00008.SPL"), Buffer.alloc(30 * 1024 * 1024 + 1));
  await sleep(300);
  st = await state();
  f = st.files.find(x => x.name === "00008.SPL");
  ck("a job over the cap is noted and not copied",          f && f.tooBig === true && f.copied === 0 && !fs.existsSync(cp("00008.SPL")));
  fs.unlinkSync(sp("00008.SPL"));

  /* ---- 7. the window ends, and the polling with it ---- */
  while(Date.now() < st.until + 100) await sleep(50);
  await sleep(100);
  st = await state();
  ck("after the window the watcher is off",                 st.armed === false && st.until === 0);
  const ticks = st.ticks;
  fs.writeFileSync(sp("00009.SPL"), JOB);
  await sleep(200);
  st = await state();
  ck("… and nothing is listed or copied any more",          st.ticks === ticks && !st.files.some(x => x.name === "00009.SPL"));
  fs.unlinkSync(sp("00009.SPL"));

  /* ---- 8. the bound: eight jobs on disk, oldest first ---- */
  await arm(null, 3000);
  for(let i = 10; i < 20; i++){ fs.writeFileSync(sp("000" + i + ".SPL"), JOB.slice(0, 300)); await sleep(5); }
  await sleep(200);
  const kept = capList().filter(n => /^0001\d\.SPL$/.test(n));
  ck("only eight jobs are kept",                            capList().length <= 8 + 1 && kept.length === 8);
  ck("… the newest eight",                                  kept.indexOf("00012.SPL") === 0 && kept.indexOf("00019.SPL") === 7);
  ck("… and 00002 went with the oldest",                    !fs.existsSync(cp("00002.SPL")) && !fs.existsSync(cp("00002.SHD")));
  for(let i = 10; i < 20; i++) fs.unlinkSync(sp("000" + i + ".SPL"));

  /* ---- 9. a copy from an earlier run is still listed ---- */
  fs.writeFileSync(cp("00099.SPL"), XPS);
  st = await state();
  f = st.files.find(x => x.name === "00099.SPL");
  ck("a copy left by an earlier run is listed as such",     f && f.earlier === true && f.copied === XPS.length);
  ck("and its text can be pulled",                          (await text(null, "00099.SPL")).format === "xps");

  /* ---- 10. names that are not a copy ---- */
  ck("a path is refused",                                   (await text(null, "../00099.SPL")).why === "badname");
  ck("a missing copy says unread, with the code",           /ENOENT/.test((await text(null, "00098.SPL")).detail || ""));

  /* ---- 11. delete deletes ---- */
  const r = await clear();
  ck("every copy is removed and counted",                   r.removed === 9 && r.err === null && capList().length === 0);
  st = await state();
  ck("and the watcher is off, the list empty",              st.armed === false && st.files.length === 0);
  ck("clearing an absent folder is not an error",           (await clear()).err === null);

  /* ---- 12. a folder that cannot be listed ---- */
  process.env.SystemRoot = path.join(DIR, "nope");
  await arm(null, 1500);
  await sleep(150);
  st = await state();
  ck("a folder that cannot be listed ends the window and says why", st.armed === false && /ENOENT/.test(st.listErr || ""));
  process.env.SystemRoot = DIR;
  ck("the failure is kept until the next arm",              (await state()).listErr && /ENOENT/.test((await state()).listErr));
  await arm(null, 1000);
  ck("… and cleared by it",                                 (await state()).listErr === null);
  await clear();

  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log("HARNESS THREW: " + (e && e.stack || e)); process.exit(1); });
