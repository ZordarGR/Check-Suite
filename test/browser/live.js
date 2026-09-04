/* The live in-house read, driven through the SHIPPED button in a real browser.
   The point of it is the refusal: on 04/09 an arrival list that was open but not
   maximised handed back the in-house list's rows under a caption naming neither, and
   nothing would have stopped those rows entering the ledger. Here the wrong list is
   pressed against the real click handler and the ledger has to come back untouched. */
const {chromium} = require("playwright-core");
const path = require("path");

const IH = (title, rows) => [
  "TITLE\t" + title,
  ...rows.map(r => "IH\t" + r.join("\t")),
  "DONE\t" + rows.length + "\t" + rows.length + "\t83\t47\tunicode\tcomplete"
].join("\n");

/* his own rows, cut to the six cells the helper sends: name, room, occ, arr, dep, status */
const ROWS = [
  ["ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA ", "426", "2/0/0/2/0", "29/08/26", "05/09/26", "CI"],
  ["ARKINSTALL PHILIP/CAROL ", "414-15", "2/0/0/0/0", "02/09/26", "05/09/26", "CI"]
];
/* legacy: ON is the shipped default and means "fed from xps files", so the live read is
   not on offer in it. Every press case below has to switch it off first — which is the
   point of the two cases that do not. */
const bridgeFor = (payload, legacy) => `window.reccheckShortcuts={
  get:()=>Promise.resolve({profiles:[],active:null,available:true}),
  helper:()=>Promise.resolve({state:"started"})
  ${payload === null ? "" : ",inhouse:()=>Promise.resolve(" + JSON.stringify(payload) + ")"}};
try{ localStorage.setItem("reccheck_legacy", ${legacy ? '"1"' : '"0"'}); }catch(e){}`;

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };

(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
                                   args:["--no-sandbox"]});
  const open = async (payload, W, legacy) => {
    const p = await b.newPage();
    await p.addInitScript(bridgeFor(payload, !!legacy));
    await p.setViewportSize({width: W || 1280, height: 620});
    await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
    await p.waitForTimeout(250);
    await p.evaluate(() => window.__t.showScreen("tax"));
    await p.waitForTimeout(150);
    return p;
  };
  const press = async (p) => {
    await p.click("#liveRead");
    await p.waitForTimeout(300);
    return p.evaluate(() => ({
      say: document.getElementById("liveSay").textContent,
      led: localStorage.getItem("reccheck_moves_v2") || ""
    }));
  };

  /* 1. no helper at all -- the row is not there, rather than there and dead */
  let p = await open(null);
  ck("with no bridge the live row is hidden",
     await p.evaluate(() => getComputedStyle(document.getElementById("liveRow")).display === "none"));
  await p.close();

  /* 1b. LEGACY IS THE SHIPPED DEFAULT and means files. A helper present is not enough. */
  p = await open(IH("Guests inhouse: 04/09/26", ROWS), 1280, true);
  ck("in legacy the live row is hidden even with a bridge",
     await p.evaluate(() => getComputedStyle(document.getElementById("liveRow")).display === "none"));
  ck("and legacy still shows the Rate Check slot",
     await p.evaluate(() => getComputedStyle(document.getElementById("slot-rate")).display !== "none"));
  await p.close();

  /* 2. the in-house list -- this is the one that is allowed to write */
  p = await open(IH("Guests inhouse: 04/09/26", ROWS));
  ck("with legacy off and a bridge the live row is shown",
     await p.evaluate(() => getComputedStyle(document.getElementById("liveRow")).display !== "none"));
  ck("and the Rate Check slot is hidden",
     await p.evaluate(() => getComputedStyle(document.getElementById("slot-rate")).display === "none"));
  let r = await press(p);
  ck("the in-house list is recorded", /2 rooms|2 δωμ/.test(r.say) || r.led.indexOf("426") >= 0);
  ck("and both rooms reach the ledger",
     r.led.indexOf('"426"') >= 0 && r.led.indexOf('"414"') >= 0);
  /* THE NAMES. The whole point of the live read, and the half that was going into the
     ledger and stopping there while the cards kept showing the .oxps truncation. */
  const rooms = await p.evaluate(() => JSON.parse(localStorage.getItem("reccheck_rooms") || "{}"));
  ck("the room database takes the protel name, UNCUT",
     rooms["426"] && rooms["426"].guest === "ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA");
  ck("stamped with the night it was read for",  rooms["426"] && rooms["426"].liveKey === 20260904);
  ck("the adjoining pair keys on the lead room", !!rooms["414"] && !rooms["414-15"]);
  /* it must NOT drag the .oxps ingest's turnover machinery in with it */
  ck("no room is marked as having turned over",
     Object.keys(rooms).every(k => !rooms[k].movedOn));
  await p.close();

  /* 3. the arrival list, restored -- the caption he actually got that night */
  p = await open(IH("Kernos Hotel, GR-70007 Malia       protel Hotel Management Suite 2024", ROWS));
  r = await press(p);
  ck("the bare frame caption is refused", /not the in-house|δεν είναι η λίστα/i.test(r.say));
  ck("and the ledger is untouched", r.led === "");
  ck("and no name was written either",
     await p.evaluate(() => !localStorage.getItem("reccheck_rooms")));
  await p.close();

  p = await open(IH("Arrival list 04/09/26", ROWS));
  r = await press(p);
  ck("a named arrival list is refused too", /not the in-house|δεν είναι η λίστα/i.test(r.say));
  ck("with the ledger untouched", r.led === "");
  await p.close();

  /* 4. the right list with no date in its caption -- no night to file it under */
  p = await open(IH("Guests inhouse", ROWS));
  r = await press(p);
  ck("no date means nothing is recorded", /no date|ημερομηνία/i.test(r.say) && r.led === "");
  await p.close();

  /* 5. and it must not push the tax page sideways at any width */
  for(const W of [420, 760, 909, 1600]){
    p = await open(IH("Guests inhouse: 04/09/26", ROWS), W, false);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ck("the tax page does not side-scroll at " + W, over <= 0);
    await p.close();
  }

  await b.close();
  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
