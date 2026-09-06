/* REPORTS, in Chromium against the shipped page. Two things it holds the line on, both
   of them faults he found:

   1. THE PRINT. #printSheet is shared by the corrections and by REPORTS' redacted
      departures list, and the `beforeprint` listener rebuilt the CORRECTIONS into it on
      every print while a department report was loaded — so pressing Print in the REPORTS
      preview printed the corrections. His words, 06/09: "i click to print the xps for
      departures and i print the corrections from dep check". Both directions are checked
      here, because the risk of the fix is breaking the ordinary corrections print, and
      the Tax Check's exemption is checked too.
   2. SUB-FOLDERS. His ask, 06/09: "i want to be able to see subfolders also, like dep and
      tax check". Descend, come back up, and remember where he was — plus the run counter,
      driven by making one list() call slower than the next, which is the only way two
      renders can be made to interleave on purpose. */
require("./fresh.js")();
const {chromium} = require("playwright-core");
const path = require("path");

/* the reports folder: two dated sub-folders at the root, nothing inside the newer one.
   list() is deliberately SLOW on its first call and fast afterwards, so the duplicate
   test below can force two renders to overlap. */
const bridge = `
window.__repCalls = [];
window.__printed = 0;
const TREE = {
  "": {dirs: [{name: "2026-08", rel: "2026-08"}, {name: "2026-09", rel: "2026-09"}], files: []},
  "2026-09": {dirs: [], files: []},
  "2026-08": {dirs: [], files: []}
};
window.__slowFirst = false;
window.reccheckFiles = {
  list: (profile, rel) => {
    window.__repCalls.push(profile + "|" + String(rel == null ? "" : rel));
    const key = String(rel == null ? "" : rel);
    const t = TREE[key];
    const out = t ? {dir: "D:\\\\reports", rel: key, dirs: t.dirs, files: t.files}
                  : {dir: "D:\\\\reports", rel: key, dirs: [], files: [], error: "no such folder"};
    const wait = (window.__slowFirst && window.__repCalls.length === 1) ? 250 : 0;
    return new Promise(r => setTimeout(() => r(out), wait));
  },
  read: () => Promise.reject(new Error("no file in this fixture")),
  stat: () => Promise.resolve(null),
  getDir: () => Promise.resolve("D:\\\\reports"),
  pickDir: () => Promise.resolve(null),
  trash: () => Promise.resolve(true),
  onDirEvent: () => {}
};
/* the print itself never happens — the stub fires the event the shipped listener hangs
   on, which is the whole mechanism at fault */
window.print = function(){ window.__printed++; window.dispatchEvent(new Event("beforeprint")); window.dispatchEvent(new Event("afterprint")); };
/* a print whose preview is re-rendered — Chromium fires beforeprint again for the same job */
window.__printTwice = function(){ window.__printed++; window.dispatchEvent(new Event("beforeprint")); window.dispatchEvent(new Event("beforeprint")); window.dispatchEvent(new Event("afterprint")); };
`;

/* a parsed departure list, in the shape parseDepList returns — enough for buildDepSheet */
const DEP = {
  title: "Departure List by Time", listDate: "06/09/26", printed: "Κυριακή, 6 Σεπτέμβριος 2026 07:06",
  station: "219691", id: "departroom1time", guests: 2,
  columns: [{key: "room", head: "Δωμάτιο"}, {key: "guest", head: "Πελάτης"}, {key: "arr", head: "Άφιξη"}, {key: "board", head: "Όροι"}],
  groups: [{time: "16:35", rows: [{room: "201", type: "SPMV", guest: "ALPHA/BETA", arr: "01/09/26", board: "HB", notes: []}]}],
  totals: [{label: "Σύνολο Δωματίων", value: "9"}]
};

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };

(async () => {
  const b = await chromium.launch({executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"]});
  const p = await b.newPage();
  await p.addInitScript(bridge);
  await p.setViewportSize({width: 1280, height: 800});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(300);

  /* ---------- 1. sub-folders ---------- */
  await p.evaluate(() => { window.__t.FB().p.rep.dir = "D:\\reports"; window.__t.repGo(""); });
  await p.evaluate(() => window.__t.showScreen("reports"));
  await p.waitForTimeout(250);

  const root = await p.evaluate(() => {
    const box = document.querySelector("#repList");
    return {
      path: (box.querySelector(".stNote") || {}).textContent || "",
      items: [...box.querySelectorAll("button.mItem")].map(b => b.querySelector(".mLabel").textContent),
      subs: [...box.querySelectorAll("button.mItem")].map(b => (b.querySelector(".mSub") || {}).textContent || "")
    };
  });
  ck("the root says which folder it is showing",            root.path === "D:\\reports");
  ck("both sub-folders are listed, in name order",          root.items.length === 2 && /2026-08$/.test(root.items[0]) && /2026-09$/.test(root.items[1]));
  ck("each is marked a folder",                             root.subs[0] === "folder" && root.subs[1] === "folder");
  ck("there is no up row at the root",                      !root.items.some(x => /up one level/.test(x)));

  await p.evaluate(() => [...document.querySelectorAll("#repList button.mItem")].find(b => /2026-09/.test(b.textContent)).click());
  await p.waitForTimeout(250);
  const into = await p.evaluate(() => {
    const box = document.querySelector("#repList");
    return {
      path: (box.querySelector(".stNote") || {}).textContent || "",
      items: [...box.querySelectorAll("button.mItem")].map(b => b.querySelector(".mLabel").textContent),
      notes: [...box.querySelectorAll(".stNote")].map(n => n.textContent),
      saved: localStorage.getItem("reccheck_fbrel_rep"),
      rel: window.__t.FB().p.rep.rel
    };
  });
  ck("pressing a folder descends into it",                  into.rel === "2026-09" && /2026-09$/.test(into.path));
  ck("the path shows the folder and the sub-folder",        into.path === "D:\\reports / 2026-09");
  ck("an up row appears once inside",                       into.items.some(x => /up one level/.test(x)));
  ck("an empty sub-folder says so, naming the sub-folder",  into.notes.some(n => /2026-09/.test(n) && /No departure list/i.test(n)));
  ck("where he was is remembered, like dept and tax",       into.saved === "2026-09");

  await p.evaluate(() => [...document.querySelectorAll("#repList button.mItem")].find(b => /up one level/.test(b.textContent)).click());
  await p.waitForTimeout(250);
  const back = await p.evaluate(() => ({rel: window.__t.FB().p.rep.rel, saved: localStorage.getItem("reccheck_fbrel_rep"),
                                        items: [...document.querySelectorAll("#repList button.mItem")].length}));
  ck("up one level returns to the root",                    back.rel === "" && back.saved === "" && back.items === 2);

  /* a folder that has gone since it was remembered drops back to the root rather than
     leaving him on a screen that cannot list anything */
  await p.evaluate(() => window.__t.repGo("2026-07"));
  await p.waitForTimeout(300);
  const gone = await p.evaluate(() => ({rel: window.__t.FB().p.rep.rel,
                                        items: [...document.querySelectorAll("#repList button.mItem")].length}));
  ck("a sub-folder that has vanished drops back to the root", gone.rel === "" && gone.items === 2);

  /* two renders overlapping: the first list() takes 250 ms, the second none. Without the
     run counter the slow one resumes after the fast one has painted and appends a second
     copy of everything into the same #repList. */
  await p.evaluate(() => { window.__repCalls.length = 0; window.__slowFirst = true; });
  await p.evaluate(() => { window.__t.repGo(""); window.__t.repGo(""); });
  await p.waitForTimeout(500);
  const dup = await p.evaluate(() => ({paths: document.querySelectorAll("#repList .stNote").length,
                                       items: document.querySelectorAll("#repList button.mItem").length,
                                       calls: window.__repCalls.length}));
  ck("two overlapping renders paint once, not twice",       dup.calls === 2 && dup.paths === 1 && dup.items === 2);

  /* ---------- 2. the print ---------- */
  await p.evaluate(() => {
    window.__t.setModel({reportDate: "6/9/2026", receipts: [
      {sn: "12345", room: "201", dept: "BAR", amount: 10, guest: "ALPHA", missing: true}]});
    window.__t.setState({receipts: {}, extras: []});
    window.__t.setStateKey("20260906");
  });
  /* with nothing armed, an ordinary print still builds the corrections — the direction
     this fix must not break */
  await p.evaluate(() => { document.querySelector("#printSheet").innerHTML = "<i>untouched</i>"; window.print(); });
  await p.waitForTimeout(120);
  const corr = await p.evaluate(() => document.querySelector("#printSheet").innerHTML);
  ck("an ordinary print still builds the corrections sheet", corr !== "<i>untouched</i>" && !/Departure List by Time/.test(corr));

  /* and the tax half's print is still left alone */
  await p.evaluate(() => {
    document.body.classList.add("taxPrint");
    document.querySelector("#printSheet").innerHTML = "<i>untouched</i>";
    window.print();
  });
  await p.waitForTimeout(120);
  const tax = await p.evaluate(() => { const h = document.querySelector("#printSheet").innerHTML;
                                       document.body.classList.remove("taxPrint"); return h; });
  ck("the tax print still prints its own mount, untouched",  tax === "<i>untouched</i>");

  /* THE BUG: preview a departure list and press Print, with a department report loaded */
  await p.evaluate(dep => window.__t.openDepPreview({name: "dep.oxps", path: "D:\\reports\\dep.oxps", mtimeMs: Date.now()}, dep), DEP);
  await p.waitForTimeout(120);
  const pv = await p.evaluate(() => (document.querySelector("#pvPaper") || {}).innerHTML || "");
  ck("the preview shows the departures sheet, no guest name", /Departure List by Time/.test(pv) && !/ALPHA/.test(pv) && !/Πελάτης/.test(pv));

  await p.click("#pvGo");
  await p.waitForTimeout(300);
  const sheet = await p.evaluate(() => ({html: document.querySelector("#printSheet").innerHTML, printed: window.__printed}));
  ck("Print actually printed",                               sheet.printed === 3);
  ck("what prints is the DEPARTURES sheet",                  /Departure List by Time/.test(sheet.html) && /06\/09\/26/.test(sheet.html));
  ck("... and not the corrections",                          !/ΔΙΟΡΘΩΣ/i.test(sheet.html) && !/12345/.test(sheet.html));
  ck("... still with no guest name on it",                   !/ALPHA/.test(sheet.html) && !/Πελάτης/.test(sheet.html));

  /* afterprint disarms it, so the NEXT print is the corrections again */
  await p.evaluate(() => { document.querySelector("#printSheet").innerHTML = "<i>untouched</i>"; window.print(); });
  await p.waitForTimeout(150);
  const again = await p.evaluate(() => document.querySelector("#printSheet").innerHTML);
  ck("the next print is the corrections again, not a stale departures sheet", again !== "<i>untouched</i>" && !/Departure List by Time/.test(again));

  /* and a preview re-rendered mid-print — paper size or margins changed — fires
     beforeprint a SECOND time for the same job. Both firings must give the departures. */
  await p.evaluate(dep => window.__t.openDepPreview({name: "dep.oxps", path: "D:\\reports\\dep.oxps", mtimeMs: Date.now()}, dep), DEP);
  await p.waitForTimeout(80);
  await p.evaluate(() => { window.__realP = window.print; window.print = window.__printTwice; });
  await p.click("#pvGo");
  await p.waitForTimeout(300);
  const twice = await p.evaluate(() => { const h = document.querySelector("#printSheet").innerHTML; window.print = window.__realP; return h; });
  ck("a preview re-rendered mid-print still prints the departures", /Departure List by Time/.test(twice) && !/12345/.test(twice));

  /* An armed job must not survive leaving the screen: he arms one, the OS print dialog is
     cancelled so `beforeprint` never fires, he walks off to the department check, and a
     later Ctrl+P must give him the corrections. The print is stubbed to nothing for the
     arming press so the assertion is not racing the 80 ms timer. */
  await p.evaluate(dep => window.__t.openDepPreview({name: "dep.oxps", path: "D:\\reports\\dep.oxps", mtimeMs: Date.now()}, dep), DEP);
  await p.waitForTimeout(80);
  await p.evaluate(() => { window.__realPrint = window.print; window.print = () => {}; });
  await p.evaluate(() => { document.querySelector("#pvGo").click(); });
  await p.waitForTimeout(200);
  ck("the press did arm it",                                 await p.evaluate(() => !!window.__t.armedPrint()));
  await p.evaluate(() => window.__t.showScreen("app"));
  ck("leaving the screen disarms it",                        await p.evaluate(() => !window.__t.armedPrint()));
  await p.evaluate(() => { window.print = window.__realPrint; document.querySelector("#printSheet").innerHTML = "<i>untouched</i>"; window.print(); });
  await p.waitForTimeout(150);
  const left = await p.evaluate(() => document.querySelector("#printSheet").innerHTML);
  ck("... so a later print is the corrections",              left !== "<i>untouched</i>" && !/Departure List by Time/.test(left));

  await b.close();
  console.log(bad ? "\n" + bad + " FAILED" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
