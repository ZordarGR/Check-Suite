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

  /* 6. AUTOMATIC when legacy is off. His words: legacy is the manual way, the new way is
        the tool getting the data by itself — and then, on why it must not wait to be
        asked: "we want to obtain data from real usage, not when we need them to be shown
        on the tool because it becomes the same hassle if not more than feeding a xps
        file". So it runs from the moment the app is up, on whatever screen. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(IH("Guests inhouse: 04/09/26", ROWS), false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(900);
  let after = await p.evaluate(() => ({
    led: localStorage.getItem("reccheck_moves_v2") || "",
    rooms: localStorage.getItem("reccheck_rooms") || ""
  }));
  ck("it reads without the Tax Check ever being opened", after.led.indexOf('"426"') >= 0);
  ck("and the names land with it",                       after.rooms.indexOf("NAHLA") >= 0);
  /* the reading continues, but an UNCHANGED list must not rewrite and redraw twenty times
     a minute under his hands */
  await p.evaluate(() => { window.__writes = 0;
    const real = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k, v) => { if(k === "reccheck_moves_v2") window.__writes++; real(k, v); }; });
  await p.waitForTimeout(12000);
  ck("an unchanged list is not written again",
     (await p.evaluate(() => window.__writes)) === 0);
  await p.close();

  /* 7. in legacy it must stay manual — nothing is read at all */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(IH("Guests inhouse: 04/09/26", ROWS), true));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(250);
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(6000);
  ck("legacy stays manual — nothing is read, on any screen",
     await p.evaluate(() => !localStorage.getItem("reccheck_moves_v2")));
  await p.close();

  /* 8. an automatic read that finds nothing says so quietly */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(IH("Arrival list 04/09/26", ROWS), false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(250);
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(900);
  after = await p.evaluate(() => ({say: document.getElementById("liveSay").textContent,
                                   led: localStorage.getItem("reccheck_moves_v2") || ""}));
  ck("an automatic miss is quiet, not an accusation",
     /not open|δεν είναι ανοιχτή/i.test(after.say) && !/That is not the in-house/.test(after.say));
  ck("and still records nothing",                    after.led === "");
  await p.close();

  /* 9. THE RETRY, and it never stops. He can open protel's in-house list at any point in
        his own work and it lands by itself — that is the whole point of it. */
  p = await b.newPage();
  await p.addInitScript(`window.reccheckShortcuts={
    get:()=>Promise.resolve({profiles:[],active:null,available:true}),
    helper:()=>Promise.resolve({state:"started"}),
    inhouse:()=>{ window.__tries=(window.__tries||0)+1;
                  return Promise.resolve(window.__open ? ${JSON.stringify(IH("Guests inhouse: 04/09/26", ROWS))}
                                                       : ${JSON.stringify(IH("Arrival list 04/09/26", ROWS))}); }};
    try{ localStorage.setItem("reccheck_legacy","0"); }catch(e){}`);
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(12000);
  let tries = await p.evaluate(() => window.__tries || 0);
  ck("it keeps attempting while protel has nothing open (" + tries + ")", tries >= 3);
  ck("and has recorded nothing yet",
     await p.evaluate(() => !localStorage.getItem("reccheck_moves_v2")));

  /* he opens the in-house list in the middle of his own work — no press, no navigation */
  await p.evaluate(() => { window.__open = true; });
  await p.waitForTimeout(6000);
  ck("opening the list later lands it with no press",
     (await p.evaluate(() => localStorage.getItem("reccheck_moves_v2") || "")).indexOf('"426"') >= 0);

  /* and it goes on reading afterwards — his call, made knowing the cost */
  const settled = await p.evaluate(() => window.__tries);
  await p.waitForTimeout(12000);
  const later = await p.evaluate(() => window.__tries);
  ck("and it does NOT stop after succeeding (" + settled + " -> " + later + ")", later > settled);
  await p.close();

  /* 10. and it is not tied to a screen: leaving the Tax Check must not stop it */
  p = await b.newPage();
  await p.addInitScript(`window.reccheckShortcuts={
    get:()=>Promise.resolve({profiles:[],active:null,available:true}),
    helper:()=>Promise.resolve({state:"started"}),
    inhouse:()=>{ window.__tries=(window.__tries||0)+1;
                  return Promise.resolve(${JSON.stringify(IH("Arrival list 04/09/26", ROWS))}); }};
    try{ localStorage.setItem("reccheck_legacy","0"); }catch(e){}`);
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(250);
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(6000);
  const before = await p.evaluate(() => window.__tries || 0);
  await p.evaluate(() => window.__t.showScreen("audit"));
  await p.waitForTimeout(12000);
  const off = await p.evaluate(() => window.__tries);
  ck("it keeps reading away from the Tax Check (" + before + " -> " + off + ")", off > before);
  await p.close();

  /* 11. A READ THE HELPER CALLED INCOMPLETE MUST NOT REACH THE LEDGER.
         saveMoves and detectMoves both reason from ABSENCE — a room missing from tonight's
         list is a room the guest has left. A list cut off at the time budget is a list
         missing its tail, so writing it unattended reads as a hundred people checking out
         at once. That is the phantom-departure failure, arriving every five seconds. */
  const CUT = ["TITLE\tGuests inhouse: 04/09/26",
    ...ROWS.map(r => "IH\t" + r.join("\t")),
    "DONE\t2\t250\t83\t5000\tunicode\tcut-short"].join("\n");
  p = await open(CUT, 1280, false);
  await p.waitForTimeout(900);
  ck("a cut-short automatic read writes NOTHING",
     await p.evaluate(() => !localStorage.getItem("reccheck_moves_v2")));
  ck("and says so quietly rather than accusing protel",
     /not open|δεν είναι ανοιχτή/i.test(await p.evaluate(() => document.getElementById("liveSay").textContent)));
  /* but he can still force one by hand, where the line tells him what he is looking at */
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.click("#liveRead");
  await p.waitForTimeout(500);
  ck("a read he PRESSED still goes through",
     (await p.evaluate(() => localStorage.getItem("reccheck_moves_v2") || "")).indexOf('"426"') >= 0);
  ck("and warns him it stopped early",
     /stopped early|σταμάτησε νωρίς/i.test(await p.evaluate(() => document.getElementById("liveSay").textContent)));
  await p.close();

  /* 12. THE AUTOMATIC READ MUST NOT THROW AWAY A DECISION HE MADE BY CLICKING.
         PAIR_OVERRIDE holds his answer about which adjoining rooms are one stay. Clearing
         it was written for a button press; on a five-second timer it would undo his answer
         and put the prompt back on top of the audit he is in the middle of. */
  p = await open(IH("Guests inhouse: 04/09/26", ROWS), 1280, false);
  await p.waitForTimeout(900);
  await p.evaluate(() => { window.__tx.setPair({mine: true}); });
  /* force a NEW signature so the read does real work rather than returning early */
  await p.evaluate(() => { window.reccheckShortcuts.inhouse = () => Promise.resolve(
    ["TITLE\tGuests inhouse: 04/09/26",
     "IH\tSOMEONE ELSE\t201\t2/0/0/0/0\t01/09/26\t09/09/26\tCI",
     "DONE\t1\t1\t83\t47\tunicode\tcomplete"].join("\n")); });
  await p.waitForTimeout(7000);
  ck("an automatic read really did run",
     (await p.evaluate(() => localStorage.getItem("reccheck_moves_v2") || "")).indexOf('"201"') >= 0);
  ck("and his pairing decision survived it",
     await p.evaluate(() => !!(window.__tx.getPair() && window.__tx.getPair().mine)));
  /* a read he PRESSES is a question, and still clears it */
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.click("#liveRead");
  await p.waitForTimeout(600);
  ck("but pressing the button still clears it",
     await p.evaluate(() => window.__tx.getPair() === null));
  await p.close();

  await b.close();
  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
