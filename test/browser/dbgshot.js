const {chromium} = require("playwright-core");
const path = require("path");
const bridge = `window.reccheckShortcuts={get:()=>Promise.resolve({profiles:[],active:null,available:true}),
 helper:()=>Promise.resolve({state:"started",probe:"ok",exe:"C:\\\\Users\\\\User\\\\AppData\\\\Local\\\\RecCheck\\\\resources\\\\rc-tbind.exe",specs:[]})};`;
const REPORT = `report night  : 1/9/2026  ->  20260901
last rate list: {"biz":"1/9/2026","key":20260901,"sure":true,"moves":["325->148","117->263"],"listRooms":227,"wrote":227,"ledgerRooms":266,"ledgerRes":387}
ledger        : 266 rooms, 387 reservations, 20260814 .. 20260925
tonight       : 43 pills - 53 67 72 79 83 84 87 106 108 111 112 132 147 148 151 154 157 165 166 175 178 201 205 226 228 230 263 272 330 331 336 409 419 427 502 507 517 527 535 538 543 545 546

stays whose arrival or departure lands near this night:
  52\t20260827 -> 20260903\tRIED
  53\t20260825 -> 20260901\tBERKMANN
  67\t20260827 -> 20260901\tMILAS`;
(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
  for (const W of [909, 1280]) {
    const p = await b.newPage();
    await p.addInitScript(bridge);
    await p.setViewportSize({width: W, height: 620});
    await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
    await p.waitForTimeout(300);
    await p.evaluate(rep => {
      window.__t.openDebug();
      const pre = document.querySelector("#scDiag");
      pre.style.display = "block"; pre.textContent = rep;
      document.querySelector("#scCopy").style.display = "";
    }, REPORT);
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => {
      const m = document.querySelector("#modal"), d = document.querySelector("#scDiag");
      const btns = [...m.querySelectorAll(".dbgGrid .btn")].map(b => {
        const s = b.getBoundingClientRect(), mr = m.getBoundingClientRect();
        return b.id + " " + Math.round(s.width) + "px" + (s.right > mr.right + 1 ? "  CLIPPED" : "");
      });
      return {modal: m.clientWidth + "/" + m.scrollWidth, report: d.clientWidth + "/" + d.scrollWidth, btns};
    });
    console.log("window " + W + "  modal w/scrollW " + r.modal + "   report pane " + r.report);
    r.btns.forEach(x => console.log("   " + x));
    await p.screenshot({path: "dbg-" + W + ".png"});
    await p.close();
  }
  await b.close();
  console.log("screenshots written");
})();
