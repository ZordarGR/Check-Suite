/* The alerts menu end to end, in a real browser, driven by a stubbed moves window.

   His three requirements, each pinned: the button sits on the home screen below AUDIT and
   PULSES RED while something is unread; the list groups by date with a Resolve button on
   each; and resolving REMOVES — it is not a flag and not an archive. Plus the one that is
   not in the wording but is in the design: the read never stops, so the same missing X
   arriving every five seconds must never become a second alert. */
const {chromium} = require("playwright-core");
const path = require("path");

/* his own moves rows, verbatim, with the X taken off two of them */
const MV = (rows) => ["TITLE\tPerform Move for Date 04/09/26",
  ...rows.map(r => "MV\t" + r.join("\t")),
  "DONE\t" + rows.length + "\t" + rows.length + "\t43\t32\tunicode\tcomplete"].join("\n");
const MARKED = [
  ["525","BSF","505","BSF","VASSILIEV","X","03/09/26","17/09/26"],
  ["85","BGV","153","SPMV","HEINE","X","03/09/26","12/09/26"]
];
const TWO_MISSING = [
  ["525","BSF","505","BSF","VASSILIEV","","03/09/26","17/09/26"],
  ["85","BGV","153","SPMV","HEINE","X","03/09/26","12/09/26"],
  ["134","SV","306","BGV","HARMS/HABERMEYER","  ","02/09/26","09/09/26"]
];
const bridge = (moves) => `window.reccheckShortcuts={
  get:()=>Promise.resolve({profiles:[],active:null,available:true}),
  helper:()=>Promise.resolve({state:"started"}),
  inhouse:()=>Promise.resolve(null),
  moves:()=>{ window.__mv=(window.__mv||0)+1; return Promise.resolve(${JSON.stringify(moves)}); }};
  try{ localStorage.setItem("reccheck_legacy","0"); }catch(e){}`;

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };

(async () => {
  const b = await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
                                   args:["--no-sandbox"]});
  const open = async (moves) => {
    const p = await b.newPage();
    await p.addInitScript(bridge(moves));
    await p.setViewportSize({width: 1280, height: 900});
    await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
    await p.waitForTimeout(900);
    return p;
  };

  /* every move marked — nothing to say */
  let p = await open(MV(MARKED));
  ck("a fully marked moves list raises nothing",
     await p.evaluate(() => !JSON.parse(localStorage.getItem("reccheck_alerts") || "[]").length));
  ck("and the button does not pulse",
     await p.evaluate(() => !document.getElementById("alertsBtn").classList.contains("unread")));
  await p.close();

  /* two rows with no X */
  p = await open(MV(TWO_MISSING));
  let alerts = await p.evaluate(() => JSON.parse(localStorage.getItem("reccheck_alerts") || "[]"));
  ck("a missing X raises an alert (" + alerts.length + ")",   alerts.length === 2);
  ck("whitespace counts as missing too",
     alerts.some(a => a.key.indexOf("HARMS") > 0));
  ck("the marked row raises nothing",         !alerts.some(a => a.key.indexOf("HEINE") > 0));
  ck("the alert names both rooms and the guest",
     /525/.test(alerts[0].text) && /505/.test(alerts[0].text) && /VASSILIEV/.test(alerts[0].text));
  ck("filed under the night in the caption",  alerts[0].night === 20260904);

  /* IT PULSES RED, on the home screen */
  ck("the button is below AUDIT on the home screen",
     await p.evaluate(() => {
       const a = document.getElementById("auditBtn"), x = document.getElementById("alertsBtn");
       return !!a && !!x && a.parentElement === x.parentElement &&
              (a.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
     }));
  ck("and it pulses while unread",
     await p.evaluate(() => document.getElementById("alertsBtn").classList.contains("unread")));
  const anim = await p.evaluate(() => getComputedStyle(document.getElementById("alertsBtn")).animationName);
  ck("with a real animation, not just a class (" + anim + ")", anim === "alPulse");

  /* sized like the button above it, measured ON THE HOME SCREEN where both are visible —
     a hidden element is 0 wide and would agree with anything */
  await p.evaluate(() => window.__t.showScreen("menu"));
  await p.waitForTimeout(200);
  const box = await p.evaluate(() => {
    const a = document.getElementById("auditBtn").getBoundingClientRect();
    const x = document.getElementById("alertsBtn").getBoundingClientRect();
    return {aw: Math.round(a.width), xw: Math.round(x.width),
            al: Math.round(a.left),  xl: Math.round(x.left), top: Math.round(x.top - a.bottom)};
  });
  ck("both buttons are actually on screen (" + box.aw + "px)", box.aw > 100);
  ck("it is the same width as AUDIT (" + box.aw + " vs " + box.xw + ")", box.aw === box.xw);
  ck("and lines up with it",                    box.al === box.xl);
  ck("and sits BELOW it (" + box.top + "px gap)", box.top >= 0 && box.top < 40);

  /* The read never stops, but the moves window takes one tick in three: four lists on
     every tick would be four process launches every five seconds, some thirty thousand
     across a shift. So it is read about every fifteen seconds, and the same missing X
     must still never pile up. */
  await p.waitForTimeout(26000);
  const tries = await p.evaluate(() => window.__mv);
  alerts = await p.evaluate(() => JSON.parse(localStorage.getItem("reccheck_alerts") || "[]"));
  ck("it keeps reading the moves window (" + tries + " reads)", tries >= 2);
  ck("and the same missing X does not pile up",  alerts.length === 2);

  /* opening the list stops the pulse but removes nothing */
  await p.evaluate(() => window.__t.showScreen("alerts"));
  await p.waitForTimeout(200);
  ck("opening the list stops the pulse",
     await p.evaluate(() => !document.getElementById("alertsBtn").classList.contains("unread")));
  ck("and removes nothing",
     (await p.evaluate(() => JSON.parse(localStorage.getItem("reccheck_alerts") || "[]"))).length === 2);
  ck("the list groups by date",
     (await p.evaluate(() => document.querySelectorAll("#alList .alDay").length)) === 1);
  ck("with a date he reads, not a key",
     /4\/9\/2026/.test(await p.evaluate(() => document.querySelector("#alList .alDay").textContent)));
  ck("and a Resolve button on each",
     (await p.evaluate(() => document.querySelectorAll("#alList .alRow button").length)) === 2);

  /* resolve removes entirely — AND STAYS REMOVED, with the read still running */
  await p.evaluate(() => document.querySelectorAll("#alList .alRow button")[0].click());
  await p.waitForTimeout(200);
  alerts = await p.evaluate(() => JSON.parse(localStorage.getItem("reccheck_alerts") || "[]"));
  ck("resolving removes it entirely",           alerts.length === 1);
  ck("the row goes with it",
     (await p.evaluate(() => document.querySelectorAll("#alList .alRow").length)) === 1);
  await p.waitForTimeout(12000);
  alerts = await p.evaluate(() => JSON.parse(localStorage.getItem("reccheck_alerts") || "[]"));
  ck("and it does NOT come back on the next reads", alerts.length === 1);
  ck("nor does the button start pulsing again",
     await p.evaluate(() => !document.getElementById("alertsBtn").classList.contains("unread")));
  await p.close();

  /* a half-read row is not a move without an X */
  p = await open(MV([["525","BSF","","","","","",""]]));
  ck("a row that came back half-empty raises nothing",
     await p.evaluate(() => !JSON.parse(localStorage.getItem("reccheck_alerts") || "[]").length));
  await p.close();

  /* nor is a read the helper itself called incomplete */
  p = await open(["TITLE\tPerform Move for Date 04/09/26",
    "MV\t525\tBSF\t505\tBSF\tVASSILIEV\t\t03/09/26\t17/09/26",
    "DONE\t1\t9\t43\t32\tunicode\tcut-short"].join("\n"));
  ck("a cut-short moves read raises nothing",
     await p.evaluate(() => !JSON.parse(localStorage.getItem("reccheck_alerts") || "[]").length));
  await p.close();

  /* in legacy the moves window is not read at all */
  p = await b.newPage();
  await p.addInitScript(bridge(MV(TWO_MISSING)).replace('"reccheck_legacy","0"', '"reccheck_legacy","1"'));
  await p.setViewportSize({width: 1280, height: 900});
  await p.goto("file://" + path.resolve(__dirname, "h-sweep.html"));
  await p.waitForTimeout(1200);
  ck("legacy reads no moves window either",
     await p.evaluate(() => !window.__mv && !JSON.parse(localStorage.getItem("reccheck_alerts") || "[]").length));
  await p.close();

  await b.close();
  console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
  process.exit(bad ? 1 : 0);
})();
