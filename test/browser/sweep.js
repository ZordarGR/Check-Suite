require("./fresh.js")();          // refuse to run against a stale copy
const {chromium} = require("playwright-core");
const path = require("path");
const bridge = `
window.reccheckShortcuts = {
  get: () => Promise.resolve({profiles:[{id:"p1",name:"Dimitris",binds:{tau:"m4",altf4:"m3",seq:"m5"}}], active:"p1",
    seq:{keys:[13,13,39,13,13],gap:25}, focus:{on:true,needle:"protel"}, tauEnter:{on:true,delay:50}, available:true}),
  detect:()=>Promise.resolve(null), cancel:()=>Promise.resolve(true), clear:()=>Promise.resolve(true),
  helper:()=>Promise.resolve({state:"started", probe:"ok", exe:"C:\\\\Users\\\\User\\\\AppData\\\\Local\\\\RecCheck\\\\resources\\\\rc-tbind.exe", specs:[]}),
  tauLog:()=>Promise.resolve(null), diag:()=>Promise.resolve(null), scan:()=>Promise.resolve(null),
  focusPick:()=>Promise.resolve(null), focusSet:(o,n)=>Promise.resolve({on:!!o,needle:n||"protel"}),
  tauEnterSet:(o,d)=>Promise.resolve({on:!!o,delay:d||50}),
  bootGet:()=>Promise.resolve(true), bootSet:()=>Promise.resolve(true)
};
window.reccheckOverlay = { state:()=>Promise.resolve(true), toggle:()=>Promise.resolve(true),
  setData:()=>Promise.resolve(true), getCfg:()=>Promise.resolve({}), setCfg:()=>Promise.resolve({}),
  onState:()=>{}, onTick:()=>{} };
`;
const mkR = (sn, room, guest, dept, tot) => ({sn, roomMain: room, guest, dept, total: tot,
  cancelled:false, voided:false, rates:{"24%":tot,"13%":0,"6%":0,"base":tot}, time:"21:14", serial:sn});
const MODEL = {reportDate:"1/9/2026", receipts:[
  mkR("12345","112","JAROLIMEK/WIEPURGER","RESTAURANT",24.5), mkR("12346","53","BERKMANN","BAR",9.0)]};

const CASES = [
  ["openDebug",            p => p.evaluate(() => window.__t.openDebug())],
  ["openShortcuts",        p => p.evaluate(() => window.__t.openShortcuts())],
  ["openProfiles",         p => p.evaluate(() => window.__t.openProfiles())],
  ["openOverlaySettings",  p => p.evaluate(() => window.__t.openOverlaySettings())],
  ["showLivePrompt",       p => p.evaluate(() => window.__t.showLivePrompt({mtimeMs: Date.now()}))],
  ["openCorrectionModal",  p => p.evaluate(m => window.__t.openCorrectionModal(m.receipts[0]), MODEL)],
  ["openRoomModal",        p => p.evaluate(m => window.__t.openRoomModal(m.receipts[0]), MODEL)],
  ["openExtraModal",       p => p.evaluate(() => window.__t.openExtraModal())],
  ["openWatchChangePrompt",p => p.evaluate(() => window.__t.openWatchChangePrompt(
      [{room:"112", oldGuest:"JAROLIMEK/WIEPURGER", newGuest:"PFUENDL ANNEMARIE"}]))],
  ["printCorrections",     p => p.evaluate(() => { window.__t.setState({receipts:{"12345|112":{status:"missing",corr:null}}}); window.__t.printCorrections(); })],
];

(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
  for (const W of [420, 640, 760, 909, 1280, 1600]) {
    console.log("\n=== window " + W + " x 620 ===");
    console.log("dialog".padEnd(22) + "modal w   content w   overflow   classes");
    for (const [name, run] of CASES) {
      const p = await b.newPage();
      await p.addInitScript(bridge);
      await p.setViewportSize({width: W, height: 620});
      await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
      await p.waitForTimeout(250);
      await p.evaluate(m => {
        window.__t.setModel(m);
        window.__t.setState({receipts:{}});
        window.__t.setStateKey("20260901");
        window.__t.setWatch([{sn:"12345", room:"112", name:"JAROLIMEK/WIEPURGER"}]);
        const FB = window.__t.FB();
        FB.p.dept.open = {name:"Departments Check 01-09-2026.oxps", path:"C:/x.oxps"};
      }, MODEL);
      let err = null;
      try { await run(p); } catch (e) { err = String(e.message).split("\n")[0].slice(0, 60); }
      await p.waitForTimeout(250);
      const r = await p.evaluate(() => {
        const m = document.querySelector("#modal");
        const open = document.querySelector("#modalBg").classList.contains("open");
        if (!m || !open) return null;
        return {w: m.clientWidth, sw: m.scrollWidth, cls: m.className || "(none)"};
      });
      if (!r) console.log(name.padEnd(22) + "did not open" + (err ? "  — " + err : ""));
      else {
        const over = r.sw - r.w;
        console.log(name.padEnd(22) + String(r.w).padEnd(10) + String(r.sw).padEnd(12)
          + (over > 0 ? ("+" + over + " SIDE-SCROLLS").padEnd(11) : "-".padEnd(11)) + r.cls);
      }
      await p.close();
    }
  }
  await b.close();
})();
