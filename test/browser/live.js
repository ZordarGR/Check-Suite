/* The live in-house read, driven through the SHIPPED button in a real browser.
   The point of it is the refusal: on 04/09 an arrival list that was open but not
   maximised handed back the in-house list's rows under a caption naming neither, and
   nothing would have stopped those rows entering the ledger. Here the wrong list is
   pressed against the real click handler and the ledger has to come back untouched. */
require("./fresh.js")();          // refuse to run against a stale copy
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
/* Two ways rows reach the page now, and the bridge serves both:

   inhouse()  -- a read spawned on demand, which is what the button does.
   listFile() -- what the RESIDENT helper captured when protel opened the window, handed
                 over as a file. No process, no contact with protel, and it survives the
                 window being closed two seconds later. This is what the loop uses.

   window.__files is the captured set and window.__at its timestamps, both writable from a
   test so a capture can appear or change mid-run the way protel makes them. */
const bridgeFor = (payload, legacy, capture) => `
window.__files = {IH: ${capture === undefined ? (payload === null ? "null" : JSON.stringify(payload)) : (capture === null ? "null" : JSON.stringify(capture))}, MV: null, AR: null, DP: null};
window.__at = {IH: 1, MV: 1, AR: 1, DP: 1};
window.reccheckShortcuts={
  get:()=>Promise.resolve({profiles:[],active:null,available:true}),
  helper:()=>Promise.resolve({state:"started"}),
  listFile:(tag)=>{ window.__lf=(window.__lf||0)+1;
    const t = window.__files[tag];
    /* a string is a capture; an object is main.js's own answer shape ({why: ...}), or
       {reject: ...} to make the IPC itself fail — both are things the loop has to read */
    if(t && typeof t === "object") return t.reject ? Promise.reject(new Error(t.reject)) : Promise.resolve(Object.assign({tag: tag}, t));
    return Promise.resolve(t ? {tag: tag, at: window.__at[tag], text: t} : null); }
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
  /* There is no button any more — his word: it "was an expirimental way of seeing if this
     would work". A capture arriving is what used to be a press, so that is what these
     drive: the file appears, the page collects it, and the line says what happened. */
  const settle = async (p) => {
    await p.waitForTimeout(1200);
    return p.evaluate(() => ({
      say: document.getElementById("liveSay").textContent,
      led: localStorage.getItem("reccheck_moves_v2") || ""
    }));
  };

  /* 1. no helper at all -- the row is not there, rather than there and dead */
  let p = await b.newPage();
  await p.addInitScript(`window.reccheckShortcuts={
    get:()=>Promise.resolve({profiles:[],active:null,available:true}),
    helper:()=>Promise.resolve({state:"started"})};
    try{ localStorage.setItem("reccheck_legacy","0"); }catch(e){}`);
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__t.showScreen("tax"));
  ck("with nothing to collect from, the live row is hidden",
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
  let r = await settle(p);
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
  r = await settle(p);
  ck("the bare frame caption is refused", /not the in-house|δεν είναι η λίστα/i.test(r.say));
  ck("and the ledger is untouched", r.led === "");
  ck("and no name was written either",
     await p.evaluate(() => !localStorage.getItem("reccheck_rooms")));
  await p.close();

  p = await open(IH("Arrival list 04/09/26", ROWS));
  r = await settle(p);
  ck("a named arrival list is refused too", /not the in-house|δεν είναι η λίστα/i.test(r.say));
  ck("with the ledger untouched", r.led === "");
  await p.close();

  /* 4. the right list with no date in its caption -- no night to file it under */
  p = await open(IH("Guests inhouse", ROWS));
  r = await settle(p);
  ck("no date means nothing is recorded", /no date|ημερομηνία/i.test(r.say) && r.led === "");
  await p.close();

  /* 5. and it must not push the tax page sideways at any width */
  for(const W of [420, 760, 909, 1600]){
    p = await open(IH("Guests inhouse: 04/09/26", ROWS), W, false);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ck("the tax page does not side-scroll at " + W, over <= 0);
    await p.close();
  }

  /* 6. THE PAGE NO LONGER DRIVES PROTEL. His words: "when a user opens protel the tool
        knows and scans the list opened". The resident helper captures the rows on the
        window event and leaves them in a file; the page collects the file. So a capture
        that is already there is taken without the Tax Check ever being opened. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(IH("Guests inhouse: 04/09/26", ROWS), false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(1200);
  let after = await p.evaluate(() => ({
    led: localStorage.getItem("reccheck_moves_v2") || "",
    rooms: localStorage.getItem("reccheck_rooms") || ""
  }));
  ck("a capture is collected with no screen opened", after.led.indexOf('"426"') >= 0);
  ck("and the names land with it",                   after.rooms.indexOf("NAHLA") >= 0);

  /* the same capture must not be re-applied on every pass */
  await p.evaluate(() => { window.__writes = 0;
    const real = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (k, v) => { if(k === "reccheck_moves_v2") window.__writes++; real(k, v); }; });
  await p.waitForTimeout(12000);
  ck("an unchanged capture is not written again",
     (await p.evaluate(() => window.__writes)) === 0);
  const lf = await p.evaluate(() => window.__lf || 0);
  ck("but the page did keep collecting (" + lf + " asks)", lf > 4);
  await p.close();

  /* 7. in legacy nothing is collected at all */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(IH("Guests inhouse: 04/09/26", ROWS), true));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(250);
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(6000);
  ck("legacy collects nothing, on any screen",
     await p.evaluate(() => !localStorage.getItem("reccheck_moves_v2") && !window.__lf));
  await p.close();

  /* 8. A LIST HE OPENED FOR TWO SECONDS. The window is long gone by the time the page
        looks — the point of capturing on the event is that the rows are not. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(IH("Guests inhouse: 04/09/26", ROWS), false, null));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(1000);
  ck("nothing captured yet, nothing recorded",
     await p.evaluate(() => !localStorage.getItem("reccheck_moves_v2")));
  /* protel shows the list; the helper takes it; the window closes again */
  await p.evaluate((txt) => { window.__files.IH = txt; window.__at.IH = 2; },
                   IH("Guests inhouse: 04/09/26", ROWS));
  await p.waitForTimeout(7000);
  ck("a capture that appears later is collected",
     (await p.evaluate(() => localStorage.getItem("reccheck_moves_v2") || "")).indexOf('"426"') >= 0);
  await p.close();

  /* 9. a capture the helper itself called incomplete must not reach the ledger */
  const CUT = ["TITLE\tGuests inhouse: 04/09/26",
    ...ROWS.map(r => "IH\t" + r.join("\t")),
    "DONE\t2\t250\t83\t5000\tunicode\tcut-short"].join("\n");
  p = await b.newPage();
  await p.addInitScript(bridgeFor(CUT, false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(1500);
  ck("a cut-short capture writes NOTHING",
     await p.evaluate(() => !localStorage.getItem("reccheck_moves_v2")));
  /* and a complete one arriving after it is taken normally */
  await p.evaluate((txt) => { window.__files.IH = txt; window.__at.IH = 9; },
                   IH("Guests inhouse: 04/09/26", ROWS));
  await p.waitForTimeout(7000);
  ck("a complete capture after it still lands",
     (await p.evaluate(() => localStorage.getItem("reccheck_moves_v2") || "")).indexOf('"426"') >= 0);
  await p.close();

  /* 10. collecting must not throw away a decision he made by clicking */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(IH("Guests inhouse: 04/09/26", ROWS), false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(1200);
  await p.evaluate(() => { window.__tx.setPair({mine: true}); });
  await p.evaluate(() => { window.__files.IH = ["TITLE\tGuests inhouse: 04/09/26",
     "IH\tSOMEONE ELSE\t201\t2/0/0/0/0\t01/09/26\t09/09/26\tCI",
     "DONE\t1\t1\t83\t47\tunicode\tcomplete"].join("\n"); window.__at.IH = 3; });
  await p.waitForTimeout(7000);
  ck("a later capture really was applied",
     (await p.evaluate(() => localStorage.getItem("reccheck_moves_v2") || "")).indexOf('"201"') >= 0);
  ck("and his pairing decision survived it",
     await p.evaluate(() => !!(window.__tx.getPair() && window.__tx.getPair().mine)));
  await p.close();

  /* 11. THE ARRIVAL AND DEPARTURE REPORTS, captured the same way.
         The one that matters: a report names thirty rooms out of two hundred, and the rest
         of the ledger reads a missing room as a guest who has left. */
  const RPT = (tag, title, rows) => [
    "TITLE\t" + title,
    ...rows.map(r => tag + "\t" + r.join("\t")),
    "DONE\t" + rows.length + "\t" + rows.length + "\t83\t47\tunicode\tcomplete"].join("\n");
  p = await b.newPage();
  await p.addInitScript(bridgeFor(IH("Guests inhouse: 04/09/26", ROWS), false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(1200);
  ck("the in-house capture landed first",
     (await p.evaluate(() => localStorage.getItem("reccheck_moves_v2") || "")).indexOf('"426"') >= 0);
  await p.evaluate((o) => { window.__files.AR = o.a; window.__at.AR = 2;
                            window.__files.DP = o.d; window.__at.DP = 2; }, {
    a: RPT("AR", "Arrival Report for the 04/09/26", [
      ["AMANN ANJA/BERND ", "337", "2/0/0/0/0", "14/09/26", "CI"]]),
    d: RPT("DP", "Departure Report for 04/09/26", [
      ["BURWIECK/GRUBE TAREK/KATHARINA ", "125", "2/0/0/0/0", "28/08/26", "CO"],
      ["BRUEMMER FRED/GUDRUN ", "9000", "0/0/0/0/0", "04/09/26", "CO"]])});
  await p.waitForTimeout(8000);
  const led = await p.evaluate(() => JSON.parse(localStorage.getItem("reccheck_moves_v2") || "{}"));
  ck("the arrival report reached the ledger",   !!(led["337"] && led["337"][20260904]));
  ck("its own date is the ARRIVAL, the row's the departure",
     !!(led["337"] && led["337"][20260904] && led["337"][20260904].d === 20260914));
  ck("the departure report reached it too",     !!(led["125"] && led["125"][20260828]));
  ck("with its own date as the DEPARTURE",
     !!(led["125"] && led["125"][20260828] && led["125"][20260828].d === 20260904));
  ck("the holding room 9000 was ignored",       !led["9000"]);
  ck("the in-house rooms survived both reports", !!led["426"] && !!led["414"]);
  ck("none of them was marked as having left",
     !led["426"][Object.keys(led["426"])[0]].mv && !led["414"][Object.keys(led["414"])[0]].mv);
  ck("nor had its departure rewritten",
     led["426"][20260829] && led["426"][20260829].d === 20260905);

  /* 12. AND A MOVE THAT HAS ALREADY HAPPENED, recorded onto the stays the census made. */
  await p.evaluate((mv) => { window.__files.MV = mv; window.__at.MV = 2; },
    ["TITLE\tPerform Move for Date 04/09/26",
     "MV\t426\tSSV\t333\tSSV\tABBUSHI MIRIAM/OLIVER/NAHLA/HELENA\tX\t29/08/26\t05/09/26",
     "DONE\t1\t1\t43\t32\tunicode\tcomplete"].join("\n"));
  await p.waitForTimeout(8000);
  const led2 = await p.evaluate(() => JSON.parse(localStorage.getItem("reccheck_moves_v2") || "{}"));
  ck("the room they left is marked vacated",    led2["426"][20260829].mv === 20260904);
  ck("and it is NOT given a departure protel never called one",
     led2["426"][20260829].d === 20260905);
  await p.close();

  /* 13. WHICH CAPTURE THE LINE IS TALKING ABOUT.

         His, 05/09: "when opening tax check there is nothing shown when i open the inhouse
         list". Nothing was broken about the in-house read — the line was being overwritten.
         All four files are collected on the same tick and each ingest writes the same
         #liveSay, so in tag order the departure report always had the last word, and the
         files live for twenty hours, so the first tick after the app starts replays a
         report he opened yesterday over the list he opened a second ago.

         The mtime says which one is the news. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(null, false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.evaluate((o) => {
    window.__files.DP = o.d; window.__at.DP = 5;      // yesterday's, still on disk
    window.__files.AR = o.a; window.__at.AR = 4;
    window.__files.IH = o.h; window.__at.IH = 9;      // opened just now
  }, {
    d: RPT("DP", "Departure Report for 04/09/26", [
      ["BURWIECK/GRUBE TAREK/KATHARINA ", "125", "2/0/0/0/0", "28/08/26", "CO"]]),
    a: RPT("AR", "Arrival Report for the 04/09/26", [
      ["AMANN ANJA/BERND ", "337", "2/0/0/0/0", "14/09/26", "CI"]]),
    h: IH("Guests inhouse: 04/09/26", ROWS)
  });
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(7000);
  const line13 = await p.evaluate(() => document.getElementById("liveSay").textContent);
  ck("the newest capture has the last word on the line", /rooms/.test(line13));
  ck("and yesterday's report does not overwrite it",     !/Departure report/i.test(line13));
  const led13 = await p.evaluate(() => JSON.parse(localStorage.getItem("reccheck_moves_v2") || "{}"));
  ck("every one of them still reached the ledger",
     !!(led13["426"] && led13["337"] && led13["125"]));
  await p.close();

  /* 14. AND WHAT THE LINE SAYS WHEN ROWS ARE DROPPED.
         "0 stays recorded. 2 holding-room row(s) ignored" was printed for rows that were
         not holding rooms at all — one counter serving three different reasons. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(null, false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.evaluate((d) => { window.__files.DP = d; window.__at.DP = 2; },
    RPT("DP", "Departure Report for 04/09/26", [
      ["HOLDING ROOM ", "9000", "0/0/0/0/0", "28/08/26", "CO"],   // a real holding room
      ["NO DATE AT ALL ", "301", "2/0/0/0/0", "", "CO"],          // arrival unreadable
      ["", "302", "2/0/0/0/0", "01/09/26", "CO"],                 // never fully read
      ["NO ROOM CELL ", "", "2/0/0/0/0", "01/09/26", "CO"],       // the ROOM cell never arrived
      ["GOOD GUEST ", "303", "2/0/0/0/0", "01/09/26", "CO"]]));
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(7000);
  const line14 = await p.evaluate(() => document.getElementById("liveSay").textContent);
  /* the two assertions this used to make, "1 rows|1 new" and one mention of holding-room,
     were satisfied by the PRE-fix sentence as well; these are not */
  ck("every row read is counted, and the one real stay is new",
     /5 rows read, 1 usable/.test(line14) && /1 new, 0 corrected, 0 already known/.test(line14));
  ck("the holding room is named as a holding room", /1 holding-room/.test(line14));
  ck("the unreadable date is its own sentence",  /1 row\(s\) had no readable arrival date/.test(line14));
  ck("and the half-read rows are their own, whichever cell failed to arrive",
     /2 row\(s\) came back incomplete/.test(line14));
  ck("nothing is called a holding room but the holding room", !/[02-9]\d* holding-room/.test(line14));
  await p.close();

  /* 15. WHAT THE TOOL IS HOLDING, said even when nothing new arrives.
         His, 05/09: "i see the in house list opened but no refresh in reccheck". The
         helper does not re-read a caption it has already read, so no new file appears and
         nothing is ingested — and the screen had no way to say the list was already in. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(null, false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(1500);
  const none15 = await p.evaluate(() => document.getElementById("liveHeld").textContent);
  ck("with nothing captured it says so, and promises nothing",
     /no protel list captured/i.test(none15) && !/open a list/.test(none15));
  await p.evaluate((o) => { window.__files.IH = o.h; window.__at.IH = 9;
                            window.__files.DP = o.d; window.__at.DP = 5; }, {
    h: IH("Guests inhouse: 04/09/26", ROWS),
    d: RPT("DP", "Departure Report for 04/09/26", [
      ["BURWIECK/GRUBE TAREK/KATHARINA ", "125", "2/0/0/0/0", "28/08/26", "CO"]])});
  await p.waitForTimeout(7000);
  const held1 = await p.evaluate(() => document.getElementById("liveHeld").textContent);
  ck("it names the in-house list it holds",   /in-house 04\/09\/26/.test(held1));
  ck("with the rows it holds for it",         /in-house 04\/09\/26 · \d+ rows/.test(held1));
  ck("and the departure report beside it",    /departures 04\/09\/26/.test(held1));
  ck("a list never captured is not claimed",  !/arrivals|moves/.test(held1));
  /* the same captures again, unchanged: the tool still says it holds them */
  await p.waitForTimeout(6000);
  const held2 = await p.evaluate(() => document.getElementById("liveHeld").textContent);
  ck("and it still says so when nothing new arrives", held2 === held1);
  /* any clock at all: the old "1970|00:00" only bit in UTC, where the epoch is midnight */
  ck("a fixture's fake timestamp is not printed as a real clock", !/\d\d:\d\d/.test(held2));
  await p.close();

  /* 16. A CAPTURE THE INGEST REFUSED IS ON DISK AND NOT IN — and the line says so.
         The 1.17.38 summary was drawn from the file's presence alone: a cut-short in-house
         read, refused by applyInhouse (correctly — a partial census reads as departures),
         was announced as "holding: in-house … N rows" under a #liveSay saying nothing came
         back. And a file the tool could not READ, or one older than twenty hours, printed
         "nothing captured from protel yet — open a list", a claim about protel made from
         the tool's own failure, promising a re-capture the helper does not make for a
         caption it already took. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(null, false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(400);
  const CUT16 = ["TITLE\tGuests inhouse: 04/09/26", ...ROWS.map(r => "IH\t" + r.join("\t")),
                 "DONE\t2\t250\t83\t47\tunicode\tcut-short"].join("\n");
  await p.evaluate((o) => { window.__files.IH = o.c; window.__at.IH = 4;
                            window.__files.DP = o.d; window.__at.DP = 6; },
    {c: CUT16, d: "TITLE\tDeparture Report for 04/09/26\nERR\tprotel would not let this process read it\nDP\tX\t125\t2/0/0/0/0\t28/08/26\tCO\n"});
  await p.waitForTimeout(6500);
  const held16 = await p.evaluate(() => document.getElementById("liveHeld").textContent);
  const say16 = await p.evaluate(() => document.getElementById("liveSay").textContent);
  ck("a cut-short in-house capture is named as NOT taken, with the reason and the list's real size",
     /in-house 04\/09\/26 · 2 of 250 rows.*not taken: the read was cut short/.test(held16));
  ck("a departure capture protel refused is NOT taken either",
     /departures 04\/09\/26.*not taken: protel error/.test(held16));
  ck("and the newest capture — the refused report — has the last word on the line",
     /protel said: protel would not let/.test(say16));
  ck("the ledger holds nothing from either",
     !(await p.evaluate(() => localStorage.getItem("reccheck_moves_v2"))));
  /* the file is there and cannot be read: what was known stays, the failure is said */
  await p.evaluate(() => { window.__files.IH = {reject: "EACCES"}; });
  await p.waitForTimeout(5500);
  const held16b = await p.evaluate(() => document.getElementById("liveHeld").textContent);
  ck("a capture file that cannot be read is said as a failure, not as protel opening nothing",
     /in-house: the capture file could not be read \(EACCES\)/.test(held16b) && !/no protel list/.test(held16b));
  ck("and what was known of it is still there", /in-house 04\/09\/26 · 2 of 250/.test(held16b));
  /* older than twenty hours: main.js says so, and the entry goes with it */
  await p.evaluate(() => { window.__files.IH = {why: "old", at: 3}; window.__files.DP = null; });
  await p.waitForTimeout(5500);
  const held16c = await p.evaluate(() => document.getElementById("liveHeld").textContent);
  ck("with every capture gone or old it says exactly that, and promises nothing",
     /no protel list captured in the last 20 hours/.test(held16c) && !/open a list/.test(held16c));
  await p.close();

  /* 17. THE PANEL REDRAWS WHEN A CAPTURE WRITES THE LEDGER — the first thing he reported
         on 05/09 ("departures do not show"), fixed in 1.17.37 by the __rcMovesChanged
         door, and until now covered by nothing: deleting the door left every harness
         green. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(null, false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.evaluate(() => { window.__t.setModel({reportDate: "4/9/2026", receipts: []}); });
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(400);
  const before17 = await p.evaluate(() => document.getElementById("moves").textContent);
  ck("with an empty ledger the panel names no room", !/125/.test(before17));
  await p.evaluate((d) => { window.__files.DP = d; window.__at.DP = 7; },
    RPT("DP", "Departure Report for 04/09/26", [["BURWIECK/GRUBE TAREK/KATHARINA ", "125", "2/0/0/0/0", "28/08/26", "CO"]]));
  await p.waitForTimeout(6500);
  const after17 = await p.evaluate(() => ({txt: document.getElementById("moves").textContent,
                                           cls: document.body.classList.contains("hasMoves"),
                                           tax: getComputedStyle(document.getElementById("taxScreen")).display}));
  ck("a departure report captured while he is on another screen puts the room on the panel", /125/.test(after17.txt));
  ck("and the body knows the panel is populated", after17.cls === true);
  ck("and he was not moved off the screen he was on", after17.tax !== "none");
  await p.close();

  /* 18. STATUS: four submenus — Arrivals, Departures, In-house, Moves — his specification
         of 05/09. Each list is kept for the day as the union of its captures; an arrival is
         checked in only when the in-house list shows the same name and room with CI; a
         departure is checked out only when a complete in-house list captured afterwards
         does not show it. Read-only, and it asks protel nothing. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(null, false));
  await p.setViewportSize({width: 1280, height: 720});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.evaluate(() => window.__t.showScreen("status"));
  await p.waitForTimeout(400);
  const menu0 = await p.evaluate(() => ({
    shown: document.getElementById("statusScreen").style.display !== "none" && document.getElementById("statusListScreen").style.display === "none",
    labels: ["stArr", "stDep", "stInh", "stMov"].map(id => document.getElementById(id).querySelector(".mLabel").textContent),
    subs: ["stArr", "stDep", "stInh", "stMov"].map(id => document.getElementById(id).querySelector(".mSub").textContent)}));
  ck("STATUS opens on the four submenus, not on a list", menu0.shown);
  ck("named Arrivals, Departures, In-house, Moves", /arrivals/i.test(menu0.labels[0]) && /departures/i.test(menu0.labels[1]) && /in-house/i.test(menu0.labels[2]) && /moves/i.test(menu0.labels[3]));
  ck("with nothing captured every one says so", menu0.subs.every(x => /no capture in the last 20 hours/.test(x)));
  await p.evaluate((o) => { window.__files.IH = o.h; window.__at.IH = 1756944000000;      /* real clocks, so the marks print a time */
                            window.__files.DP = o.d; window.__at.DP = 1756944060000;
                            window.__files.MV = o.m; window.__at.MV = 1756944120000;
                            window.__files.AR = o.a; window.__at.AR = 1756944180000; }, {
    h: IH("Guests inhouse: 04/09/26", ROWS),
    d: RPT("DP", "Departure Report for 04/09/26", [["BURWIECK/GRUBE TAREK/KATHARINA ", "125", "2/0/0/0/0", "28/08/26", "CO"],
                                                    ["ARKINSTALL PHILIP/CAROL ", "414", "2/0/0/0/0", "02/09/26", "CI"]]),
    a: RPT("AR", "Arrival Report for the 04/09/26", [["AMANN ANJA/BERND ", "337", "2/0/0/0/0", "14/09/26", "CI"],
                                                      ["ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA ", "426", "2/0/0/2/0", "05/09/26", "CI"]]),
    m: "TITLE\tPerform Move for Date 04/09/26\nMV\t525\tBSF\t505\tBSF\tVASSILIEV\tX\t03/09/26\t17/09/26\nDONE\t1\t1\t9\t5\tunicode\tcomplete\n"});
  await p.waitForTimeout(6500);
  const menu1 = await p.evaluate(() => ["stArr", "stDep", "stInh", "stMov"].map(id => document.getElementById(id).querySelector(".mSub").textContent));
  ck("each submenu carries its list's date, its rows and when it was taken",
     menu1.every(x => /04\/09\/26 · \d+ rows · taken at \d\d:\d\d/.test(x)) && /2 rows/.test(menu1[0]) && /2 rows/.test(menu1[1]) && /2 rows/.test(menu1[2]) && /1 rows/.test(menu1[3]));
  ck("and the screen was not moved from under him", await p.evaluate(() => document.getElementById("statusScreen").style.display !== "none"));
  /* Arrivals */
  await p.click("#stArr");
  await p.waitForTimeout(300);
  const ar = await p.evaluate(() => ({shown: document.getElementById("statusListScreen").style.display !== "none", txt: document.getElementById("stList").textContent}));
  ck("Arrivals opens the list screen", ar.shown && /Arrival report/.test(ar.txt) && /04\/09\/26/.test(ar.txt) && /complete/.test(ar.txt));
  ck("it says it asks protel nothing", /asks protel for anything/.test(ar.txt));
  ck("and carries the note about rows leaving it as guests check in", /Rows leave this list as guests check in/.test(ar.txt));
  ck("an arrival the in-house list shows with CI is checked in", /ABBUSHI[^]*?checked in — on the in-house list at \d\d:\d\d/.test(ar.txt));
  ck("one it does not show yet is expected", /AMANN[^]*?expected — not checked in/.test(ar.txt));
  /* Departures */
  await p.click("#stListBack");
  await p.waitForTimeout(200);
  ck("back goes to the four submenus", await p.evaluate(() => document.getElementById("statusScreen").style.display !== "none" && document.getElementById("statusListScreen").style.display === "none"));
  await p.click("#stDep");
  await p.waitForTimeout(300);
  const dp = await p.evaluate(() => document.getElementById("stList").textContent);
  ck("Departures: the report, with its note that a row leaving proves nothing", /Departure report/.test(dp) && /departure date can be wrong/.test(dp));
  ck("a departure absent from the complete in-house list is checked out", /BURWIECK[^]*?checked out — absent from the in-house list at \d\d:\d\d/.test(dp));
  ck("one still on it with CI — as 414-15 for 414 — is still in house", /ARKINSTALL[^]*?still in house at \d\d:\d\d/.test(dp));
  /* In-house and Moves */
  await p.click("#stListBack"); await p.waitForTimeout(200); await p.click("#stInh"); await p.waitForTimeout(300);
  const ihl = await p.evaluate(() => document.getElementById("stList").textContent);
  ck("In-house: the list with its date, its rows and that it was complete", /In-house list.*04\/09\/26/.test(ihl) && /ABBUSHI MIRIAM\/OLIVER\/NAHLA\/HELENA/.test(ihl) && /414-15/.test(ihl) && /complete/.test(ihl));
  await p.click("#stListBack"); await p.waitForTimeout(200); await p.click("#stMov"); await p.waitForTimeout(300);
  const mvl = await p.evaluate(() => document.getElementById("stList").textContent);
  ck("Moves: both rooms, the name and the mark", /Moves window/.test(mvl) && /525/.test(mvl) && /505/.test(mvl) && /VASSILIEV/.test(mvl) && /X/.test(mvl));
  /* the departure leaves the departure list; a cut-short in-house read follows */
  await p.click("#stListBack"); await p.waitForTimeout(200); await p.click("#stDep"); await p.waitForTimeout(300);
  await p.evaluate((o) => { window.__files.DP = o.d; window.__at.DP = 1756947600000; window.__files.IH = o.c; window.__at.IH = 1756947660000; }, {
    d: RPT("DP", "Departure Report for 04/09/26", [["ARKINSTALL PHILIP/CAROL ", "414", "2/0/0/0/0", "02/09/26", "CI"]]),
    c: ["TITLE\tGuests inhouse: 04/09/26", "IH\t" + ROWS[0].join("\t"), "DONE\t1\t250\t83\t47\tunicode\tcut-short"].join("\n")});
  await p.waitForTimeout(6500);
  const dp2 = await p.evaluate(() => ({txt: document.getElementById("stList").textContent, shown: document.getElementById("statusListScreen").style.display !== "none"}));
  ck("a departure gone from the list is still on it, said to be gone, and still checked out by the earlier complete census",
     dp2.shown && /BURWIECK[^]*?checked out — absent from the in-house list at \d\d:\d\d · gone from the list since \d\d:\d\d/.test(dp2.txt));
  ck("the one the cut-short read does not show is not called out by it", /ARKINSTALL[^]*?was cut short — absence proves nothing/.test(dp2.txt));
  await p.click("#stListBack"); await p.waitForTimeout(300);
  const inhSub = await p.evaluate(() => document.getElementById("stInh").querySelector(".mSub").textContent);
  ck("the In-house submenu says the latest read was cut short", /read cut short/.test(inhSub));
  /* the home screen has the third button, and back from the submenus goes home */
  await p.click("#stBack"); await p.waitForTimeout(200);
  const btn = await p.evaluate(() => { const b = document.getElementById("statusBtn"); return document.getElementById("menuScreen").style.display !== "none" && b && getComputedStyle(b).display !== "none" ? b.textContent : ""; });
  ck("back goes home, and the home screen offers STATUS", /STATUS/.test(btn));
  await p.close();

  /* 19. WHICH CLOCK STAMPS A REPORT (7a, decided 1.17.41): the census's date when a census
         is held, the tool's night before one is. The fixtures are dated 04/09/26, which is
         not tonight in this container, so the two are told apart. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(null, false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(400);
  await p.evaluate((o) => { window.__files.IH = o.h; window.__at.IH = 21; window.__files.DP = o.d; window.__at.DP = 22; }, {
    h: IH("Guests inhouse: 04/09/26", ROWS),
    d: RPT("DP", "Departure Report for 04/09/26", [["BURWIECK/GRUBE TAREK/KATHARINA ", "125", "2/0/0/0/0", "28/08/26", "CO"]])});
  await p.waitForTimeout(6500);
  const seen19 = await p.evaluate(() => { const l = JSON.parse(localStorage.getItem("reccheck_moves_v2") || "{}"); return l["125"] && l["125"]["20260828"] && l["125"]["20260828"].seen; });
  const clocks = await p.evaluate(() => ({c: window.__tx.censusNight(), b: window.__tx.bnk()}));
  ck("with a census held, a report is stamped with the census's date", seen19 === 20260904 && clocks.c === 20260904);
  ck("which is not the tool's night here", clocks.b !== 20260904);
  await p.close();
  p = await b.newPage();
  await p.addInitScript(bridgeFor(null, false));
  await p.setViewportSize({width: 1280, height: 620});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.evaluate(() => window.__t.showScreen("tax"));
  await p.waitForTimeout(400);
  await p.evaluate((d) => { window.__files.DP = d; window.__at.DP = 23; },
    RPT("DP", "Departure Report for 04/09/26", [["BURWIECK/GRUBE TAREK/KATHARINA ", "125", "2/0/0/0/0", "28/08/26", "CO"]]));
  await p.waitForTimeout(6500);
  const seen19b = await p.evaluate(() => { const l = JSON.parse(localStorage.getItem("reccheck_moves_v2") || "{}"); return l["125"] && l["125"]["20260828"] && l["125"]["20260828"].seen; });
  const bnk19 = await p.evaluate(() => window.__tx.bnk());
  ck("with no census held, a report is stamped with the tool's night", seen19b === bnk19);
  await p.close();

  /* 20. THE CARDS ON SCREEN AFTER A CAPTURE (queued 05/09, built 1.17.43 under his go):
         a departure list captured while a search is on screen marks the departing guest's
         card red without him retyping — and a capture that changes nothing for the cards
         leaves the very same DOM nodes in place, so nothing moves under his hands. */
  p = await b.newPage();
  await p.addInitScript(bridgeFor(null, false));
  await p.setViewportSize({width: 1280, height: 720});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    const mk = (sn, room, guest) => ({sn, serial: sn, roomMain: room, room: room, guest, dept: "REST", total: 10, cancelled: false, voided: false,
                                      rates: {"24%": 10, "13%": 0, "6%": 0, "base": 10}, time: "21:14"});
    window.__t.setModel({reportDate: "4/9/2026", receipts: [mk("12345", "125", "BURWIECK/GRUBE TAREK/KATHARINA"), mk("12346", "125", "NEW GUEST")]});
    window.__t.setState({receipts: {}, extras: []});
    window.__t.setStateKey("20260904");
    window.__t.showScreen("app");
    const f = document.getElementById("snInput"); f.value = "12345"; f.dispatchEvent(new Event("input"));
  });
  await p.waitForTimeout(300);
  const c20a = await p.evaluate(() => { const c = document.querySelectorAll("#matches .match"); if(c[0]) c[0].dataset.probe = "first-draw"; return {n: c.length, left: c[0] ? c[0].classList.contains("left") : null}; });
  ck("the search draws the departing guest's card, unmarked — no departure list yet", c20a.n === 1 && c20a.left === false);
  await p.evaluate((d) => { window.__files.DP = d; window.__at.DP = 1756944060000; },
    RPT("DP", "Departure Report for 04/09/26", [["BURWIECK/GRUBE TAREK/KATHARINA ", "125", "2/0/0/0/0", "28/08/26", "CI"]]));
  await p.waitForTimeout(6500);
  const c20b = await p.evaluate(() => { const c = document.querySelectorAll("#matches .match"); return {n: c.length, left: c[0] ? c[0].classList.contains("left") : null,
                                          redrawn: c[0] ? c[0].dataset.probe !== "first-draw" : null, tag: c[0] ? c[0].textContent : "", q: document.getElementById("snInput").value,
                                          app: document.querySelector("main").style.display !== "none"}; });
  ck("the departure list arriving marks that card red without retyping", c20b.n === 1 && c20b.left === true && c20b.redrawn === true && /LEAVING/i.test(c20b.tag));
  ck("the query stays and he stays on the screen", c20b.q === "12345" && c20b.app);
  await p.evaluate(() => { const c = document.querySelector("#matches .match"); c.dataset.probe = "second-draw"; });
  /* the same list captured again: the store changes (a new capture time), the marks do not */
  await p.evaluate((d) => { window.__files.DP = d; window.__at.DP = 1756944120000; },
    RPT("DP", "Departure Report for 04/09/26", [["BURWIECK/GRUBE TAREK/KATHARINA ", "125", "2/0/0/0/0", "28/08/26", "CI"]]));
  await p.waitForTimeout(6500);
  const c20c = await p.evaluate(() => { const c = document.querySelector("#matches .match"); return {same: c && c.dataset.probe === "second-draw", left: c && c.classList.contains("left")}; });
  ck("a capture that changes nothing for the cards leaves the same nodes in place", c20c.same === true && c20c.left === true);
  /* the new guest's receipt on the same room: never marked, capture or not */
  await p.evaluate(() => { const f = document.getElementById("snInput"); f.value = "12346"; f.dispatchEvent(new Event("input")); });
  await p.waitForTimeout(300);
  const c20d = await p.evaluate(() => { const c = document.querySelectorAll("#matches .match"); return {n: c.length, left: c[0] ? c[0].classList.contains("left") : null}; });
  ck("the NEW guest's receipt on the departing room is not marked", c20d.n === 1 && c20d.left === false);
  await p.close();

  await b.close();
  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
