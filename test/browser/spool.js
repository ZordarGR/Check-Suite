/* Stage 1 of the redacted print — the three DEBUG buttons, pressed in Chromium against
   the shipped page with the bridge stubbed. The dump is drawn from what the stub answers,
   the text of a settled file is asked for once and not per tick, the interval stops when
   the dialog is gone, and the buttons fit the dialog at both widths. */
require("./fresh.js")();
const {chromium} = require("playwright-core");
const path = require("path");
const bridge = `
window.__spoolCalls = {arm:0, state:0, text:0, clear:0};
const NOW = Date.now();
const ST = {dir:"C:\\\\Windows\\\\System32\\\\spool\\\\PRINTERS", capDir:"C:\\\\Users\\\\User\\\\AppData\\\\Roaming\\\\RecCheck\\\\spool-cap",
  now: NOW, until: NOW + 600000, armed: true, ticks: 40, lastTick: NOW, listErr: null,
  files: [{name:"00042.SHD", first: NOW - 4000, last: NOW - 3000, sizes:[1234], gone: NOW - 2500, readErr:null, readFails:0, copied:1234, copyErr:null, tooBig:false},
          {name:"00042.SPL", first: NOW - 4000, last: NOW - 3000, sizes:[4096, 65536, 188214], gone: NOW - 2500, readErr:"EBUSY", readFails:2, copied:188214, copyErr:null, tooBig:false},
          {name:"00043.SPL", first: NOW - 100, last: NOW, sizes:[100], gone: 0, readErr:null, readFails:0, copied:100, copyErr:null, tooBig:false}]};
const TX = {"00042.SHD": {name:"00042.SHD", size:1234, format:"shd", strings:["Departure Report for 05/09/26", "HP LaserJet 400"]},
            "00042.SPL": {name:"00042.SPL", size:188214, format:"emfspool", head:"0800010020000000", emfPlus:0, types:{84:12, 14:2, 1:2},
                          pages:[{n:1, records:40, texts:[{x:120, y:88, s:"Departure Report for 05/09/26"}, {x:120, y:140, s:"ΠΑΠΑΔΟΠΟΥΛΟΣ  414  BB"}]}]}};
window.reccheckShortcuts = {
  get: () => Promise.resolve({profiles:[], active:null, available:true}),
  helper: () => Promise.resolve({state:"started", probe:"ok", exe:"x", specs:[]}),
  spoolArm: () => { window.__spoolCalls.arm++; return Promise.resolve(ST); },
  spoolState: () => { window.__spoolCalls.state++; return Promise.resolve(ST); },
  spoolText: (n) => { window.__spoolCalls.text++; return Promise.resolve(TX[n] || null); },
  spoolClear: () => { window.__spoolCalls.clear++; return Promise.resolve({removed: 3, err: null}); }
};`;
let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };
(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"]});
  for(const W of [909, 1280]){
    const p = await b.newPage();
    await p.addInitScript(bridge);
    await p.setViewportSize({width: W, height: 700});
    await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
    await p.waitForTimeout(300);
    await p.evaluate(() => window.__t.openDebug());
    await p.waitForTimeout(200);
    const fit = await p.evaluate(() => {
      const m = document.querySelector("#modal");
      return ["scSpool", "scSpoolShow", "scSpoolClear"].map(id => {
        const el = document.getElementById(id); if(!el) return id + " MISSING";
        const s = el.getBoundingClientRect(), mr = m.getBoundingClientRect();
        return s.right > mr.right + 1 ? id + " CLIPPED" : "";
      }).filter(Boolean).join(" ");
    });
    ck("window " + W + ": the three buttons are there and fit", fit === "");
    await p.click("#scSpool");
    await p.waitForTimeout(400);
    let txt = await p.evaluate(() => document.querySelector("#scDiag").textContent);
    ck("window " + W + ": the press arms and says so", /Armed until \d\d:\d\d:\d\d/.test(txt) && /ARMED until/.test(txt));
    ck("window " + W + ": the dump lists what was caught", /caught 3 file\(s\)/.test(txt) && /00042\.SPL  188214 bytes  sizes 4096 → 65536 → 188214/.test(txt));
    ck("window " + W + ": a refused read is on the line", /2 read\(s\) refused \(EBUSY\), then ok/.test(txt));
    ck("window " + W + ": gone, with how long it lived", /gone .* \(lived 1500 ms\)/.test(txt));
    ck("window " + W + ": the text of a settled file is in the dump, Greek whole", /\(120, 140\)  ΠΑΠΑΔΟΠΟΥΛΟΣ  414  BB/.test(txt) && /strings: "Departure Report for 05\/09\/26"/.test(txt));
    ck("window " + W + ": a file still changing is listed without text", /00043\.SPL  100 bytes .* still there/.test(txt));
    const calls1 = await p.evaluate(() => Object.assign({}, window.__spoolCalls));
    await p.waitForTimeout(2200);
    const calls2 = await p.evaluate(() => Object.assign({}, window.__spoolCalls));
    ck("window " + W + ": the state is re-read each second while armed", calls2.state - calls1.state >= 2);
    ck("window " + W + ": the text is asked for once, not per tick", calls2.text === calls1.text && calls1.text === 2);
    const copyShown = await p.evaluate(() => getComputedStyle(document.querySelector("#scCopy")).display !== "none");
    ck("window " + W + ": the copy button is offered", copyShown);
    await p.evaluate(() => window.__t.closeModal());
    await p.waitForTimeout(1300);
    const calls3 = await p.evaluate(() => Object.assign({}, window.__spoolCalls));
    await p.waitForTimeout(1300);
    const calls4 = await p.evaluate(() => Object.assign({}, window.__spoolCalls));
    ck("window " + W + ": the interval stops when the dialog is gone", calls4.state === calls3.state);
    await p.evaluate(() => window.__t.openDebug());
    await p.waitForTimeout(200);
    await p.click("#scSpoolShow");
    await p.waitForTimeout(300);
    txt = await p.evaluate(() => document.querySelector("#scDiag").textContent);
    ck("window " + W + ": 'what was caught' draws the same dump without arming", /caught 3 file\(s\)/.test(txt));
    const armsBefore = await p.evaluate(() => window.__spoolCalls.arm);
    await p.click("#scSpoolClear");
    await p.waitForTimeout(300);
    txt = await p.evaluate(() => document.querySelector("#scDiag").textContent);
    ck("window " + W + ": delete says what it deleted", /deleted \(3 file\(s\)\)/.test(txt));
    ck("window " + W + ": showing and deleting never arm", (await p.evaluate(() => window.__spoolCalls.arm)) === armsBefore && armsBefore === 1);
    await p.evaluate(() => window.__t.closeModal());
    await p.close();
  }
  await b.close();
  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log("HARNESS THREW: " + (e && e.stack || e)); process.exit(1); });
