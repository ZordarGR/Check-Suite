/* THE MOVEMENTS PANEL'S PILLS FIT THE CELLS THEY ARE DRAWN IN.

   The panel is 250px wide and its grid was five to a line — a 38px cell, cut for a
   three-digit room number. 1.17.46 made a move pill read "old → new"; at 12.5px monospace
   that is ~68px, so it WRAPPED inside the 38px cell into a two-line pill 40px tall beside
   26px departures. Every harness passed: the DOM shim in test/status.js has no layout, and
   the screen sweep only asks whether the page scrolls sideways. He saw it on his screen.

   So this measures. Real Chromium, the shipped page, the store fed through the real
   ingest: every pill on one line, inside its cell, the same height as the rest of its
   group. The pill's own colour and the group headings are checked here too, because a
   move pill that is not cyan is the other half of what he asked for. */
require("./fresh.js")();
const {chromium} = require("playwright-core");
const path = require("path");

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };

(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
                                   args:["--no-sandbox"]});
  for(const W of [1280, 1600]){
    const p = await b.newPage();
    await p.setViewportSize({width: W, height: 900});
    await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      /* the store as statusIngest leaves it: two moves protel marked with its X, a
         departure and an arrival, all on the report's night */
      const at = 1757000000000;
      const st = {
        MV: {"20260904": {title: "Perform Move for Date 04/09/26", date: "04/09/26", at: at, cut: false, rows: {
          "525|505|VASSILIEV|03/09/26": {name: "VASSILIEV", from: "525", to: "505", x: "X", arr: "03/09/26", dep: "17/09/26", first: at, last: at},
          "85|153|HEINE|03/09/26":      {name: "HEINE",     from: "85",  to: "153", x: "X", arr: "03/09/26", dep: "12/09/26", first: at, last: at}}}},
        DP: {"20260904": {title: "Departure Report for 04/09/26", date: "04/09/26", at: at, cut: false, rows: {
          "MUELLER|110": {name: "MUELLER", room: "110", arr: "26/08/26", status: "CI", first: at, last: at}}}},
        AR: {"20260904": {title: "Arrival Report for the 04/09/26", date: "04/09/26", at: at, cut: false, rows: {
          "AMANN|337": {name: "AMANN", room: "337", dep: "14/09/26", status: "CI", first: at, last: at}}}}
      };
      localStorage.setItem("reccheck_status_v1", JSON.stringify(st));
      localStorage.setItem("reccheck_legacy", "0");
      window.__t.setModel({reportDate: "4/9/2026", receipts: [], depts: {}});
      window.__t.setState({receipts: {}, extras: []});
      window.__t.showScreen("app");
      window.__rcMovesChanged();

      const box = document.getElementById("moves");
      const out = {shown: getComputedStyle(box).display !== "none", groups: [], pills: []};
      /* name and count are separate flex items with a gap — textContent runs them
         together ("MOVES2"), so read them apart rather than asserting on the join */
      for(const g of box.querySelectorAll(".mvGroup"))
        out.groups.push((g.querySelector(".mvGroupName").textContent + " " + g.querySelector(".mvGroupN").textContent).trim());
      for(const el of box.querySelectorAll(".mvPill")){
        const cs = getComputedStyle(el);
        out.pills.push({txt: el.textContent, cls: el.className, colour: cs.color, wrap: cs.whiteSpace,
                        over: el.scrollWidth - el.clientWidth, h: Math.round(el.getBoundingClientRect().height),
                        right: Math.round(el.getBoundingClientRect().right),
                        boxRight: Math.round(box.getBoundingClientRect().right)});
      }
      return out;
    });

    const tag = "window " + W + ": ";
    ck(tag + "the panel is shown", r.shown);
    ck(tag + "three groups, his order and his words", r.groups.join(" | ") === "ARRIVALS 1 | DEPARTURES 1 | MOVES 2");
    const moves = r.pills.filter(x => /mv-move/.test(x.cls));
    const others = r.pills.filter(x => !/mv-move/.test(x.cls));
    ck(tag + "a move pill per move, reading old → new", moves.length === 2
       && moves.some(x => x.txt === "525 → 505") && moves.some(x => x.txt === "85 → 153"));
    /* THE CHECK THAT WAS MISSING */
    ck(tag + "no pill overflows its cell", r.pills.every(x => x.over <= 0));
    ck(tag + "no pill wraps onto a second line", r.pills.every(x => x.wrap === "nowrap"));
    ck(tag + "a move pill is no taller than a departure pill", moves.every(m => others.every(o => m.h <= o.h)));
    ck(tag + "and none of them spills out of the panel", r.pills.every(x => x.right <= x.boxRight));
    ck(tag + "the move pills are cyan, the others are not", moves.every(x => x.colour === "rgb(103, 232, 249)")
       && others.every(x => x.colour !== "rgb(103, 232, 249)"));
    await p.close();
  }
  await b.close();
  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log("HARNESS THREW: " + (e && e.stack || e)); process.exit(1); });
