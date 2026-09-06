/* THE STATUS STORE, driven through the SHIPPED code lifted from both halves of the page.

   His specification, 05/09: each list is captured every time protel shows it; an arrival
   leaving the arrival list means nothing until the in-house list shows the same name and
   room checked in; a departure leaving the departure list means nothing either — "there
   are rare cases where we have the departure date wrong" — and is checked out only when
   a COMPLETE in-house list captured afterwards does not show it; the pills of the
   department check come from this store and nothing else, with a dot on a departed or
   moved pill when a receipt in the loaded report carries that reservation's name.

   The tax half writes the store (statusIngest) and marks it (statusMark); the app half
   reads it for the pills (roomMoves, renderMovesFor) and for the red mark in the search
   results (leavingIndex). Both are lifted here from app/index.html, not copied. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = name => {
  const at = src.indexOf("\nfunction " + name + "(");
  if(at < 0) throw new Error("missing " + name);
  let d = 0, i = src.indexOf("{", at);
  for(let j = i; j < src.length; j++){ if(src[j] === "{") d++; else if(src[j] === "}"){ d--; if(!d) return src.slice(at + 1, j + 1); } }
};
const line = re => { const m = src.match(re); if(!m) throw new Error("missing " + re); return m[0]; };

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };

/* ---- a store, shared by both halves the way localStorage is ---- */
const store = {};
const localStorage = {getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }};
store["reccheck_legacy"] = "0";                 // the automatic read is on; legacy is the case in section 6

/* ---- the tax half: writer and marks ---- */
const I18N = {en: {}};
const tT = function(k){ let s = k; for(let i = 1; i < arguments.length; i++) s += "(" + arguments[i] + ")"; return s; };
const taxBody = [
  line(/^const IH = \{NAME: 0.*$/m), line(/^const AR = \{NAME: 0.*$/m), line(/^const DP = \{NAME: 0.*$/m), line(/^const MV = \{FROM: 0.*$/m),
  "const STATUS_KEY = \"reccheck_status_v1\"; const STATUS_KEEP_DAYS = 7; let STATUS_TICK = 0; let LIVE_HELD = {};",
  lift("dkey"), lift("dfmt"), lift("leadRoom"), lift("bnk"), lift("hhmm"), lift("isInhouseTitle"), lift("inhouseDate"),
  lift("parseInhouse"), lift("parseTagged"),
  lift("statusLoad"), lift("statusSave"), lift("stName"), lift("stRoom"), lift("stKey"), lift("stSameRoom"), lift("stDayKey"),
  lift("statusPrune"), lift("statusIngest"), lift("ihFind"), lift("statusMark"), lift("statusDay"),
  "return {ingest: statusIngest, mark: statusMark, load: statusLoad, parseInhouse: parseInhouse, parseTagged: parseTagged, tick: () => STATUS_TICK, day: statusDay};"
].join("\n");
const TAX = new Function("localStorage", "t", "I18N", taxBody)(localStorage, tT, I18N);

/* ---- the app half: the pills ---- */
function Node(tag){ this.tag = tag; this.className = ""; this.textContent = ""; this.title = ""; this.children = []; this.style = {}; }
Node.prototype.append = function(...k){ for(const c of k) this.children.push(c); };
Object.defineProperty(Node.prototype, "innerHTML", {set(v){ if(v === "") this.children = []; }});
function pillsFor(reportDate, receipts, rooms){
  const moves = new Node("aside"); const classes = new Set();
  const document = {createElement: t => new Node(t), body: {classList: {toggle: (c, on) => { on ? classes.add(c) : classes.delete(c); }}}, querySelectorAll: () => []};
  const $ = sel => (sel === "#moves" ? moves : null);
  const MODEL = {reportDate, receipts: receipts || []};
  const STATE = {receipts: {}};
  const t = k => k;
  const body = [line(/^const el = \(tag, cls, txt\) =>.*$/m), lift("dateNum"), lift("dShort"), lift("rKey"), lift("rState"),
    "const effRoom = (r) => { " + line(/^function effRoom\(r\)\{.*$/m).replace(/^function effRoom\(r\)\{/, "").replace(/\}$/, "") + " };",
    lift("checkableList"), lift("sameName"), lift("isCutOf"), lift("receiptName"),
    "const STATUS_KEY = \"reccheck_status_v1\";", lift("loadStatus"), lift("statusRows"), lift("pillRoom"),
    "const LEGACY_KEY = \"reccheck_legacy\";", lift("legacyOn"), line(/^const MOVES_KEY = .*$/m), lift("loadMoves"), lift("ledgerMoves"), 
    lift("dateNum2"), lift("prevNightKey"), "const RECEIPTS_KEY = \"reccheck_receipts_v1\"; const RECEIPTS_KEEP = 60;", lift("loadNightReceipts"), lift("saveNightReceipts"),
    "let ARRIVING = {};", lift("leavingIndex"), "let LEAVING = {};", lift("nameHit"), lift("censusNameOf"), lift("roomNames"), lift("isLeaving"),
    lift("roomMoves"), lift("renderMovesFor"), lift("renderMoves"),
    "renderMoves(); return {classes: [...classes], root: moves, leaving: leavingIndex(), isLeaving: isLeaving, LEAVING: LEAVING, receiptName: receiptName};"].join("\n");
  const fn = new Function("document", "$", "localStorage", "MODEL", "STATE", "ROOMS", "t", "classes", "moves", body);
  const out = fn(document, $, localStorage, MODEL, STATE, rooms || {}, t, classes, moves);
  const pills = []; let head = null;
  for(const c of out.root.children){
    if(c.className && c.className.startsWith("mvGroup")) head = c.children[0].textContent.replace("mv.h.", "");
    else if(c.className === "mvGrid") for(const p of c.children)
      pills.push({room: p.textContent.split("→").pop().trim(), text: p.textContent, kind: head, dot: /\brec\b/.test(p.className), title: p.title});
  }
  return {pills, has: r => pills.some(p => p.room === r), kind: r => (pills.find(p => p.room === r) || {}).kind,
          kinds: r => pills.filter(p => p.room === r).map(p => p.kind).sort().join("+"),
          text: r => (pills.find(p => p.room === r) || {}).text,
          dot: r => pills.some(p => p.room === r && p.dot), hasMoves: out.classes.indexOf("hasMoves") >= 0, leaving: out.leaving,
          name: r => out.receiptName(r), isLeaving: (room, name) => out.isLeaving(room, name)};
}

/* ---- fixtures: the helper's own line shapes ---- */
const IHTXT = (title, rows, cut) => ["TITLE\t" + title, ...rows.map(r => "IH\t" + r.join("\t")),
  "DONE\t" + rows.length + "\t" + (cut ? 250 : rows.length) + "\t83\t47\tunicode\t" + (cut ? "cut-short" : "complete")].join("\n");
const RPT = (tag, title, rows) => ["TITLE\t" + title, ...rows.map(r => tag + "\t" + r.join("\t")),
  "DONE\t" + rows.length + "\t" + rows.length + "\t9\t5\tunicode\tcomplete"].join("\n");
const ih = (txt, at) => TAX.ingest("IH", TAX.parseInhouse(txt), at);
const rpt = (tag, txt, at) => TAX.ingest(tag, TAX.parseTagged(txt, tag), at);
const T = h => Date.UTC(2026, 8, 4, h, 0, 0);           // real clocks, so hhmm prints
const NIGHT = "4/9/2026";

console.log("--- 1. arrivals: the union, and checked in only from the in-house list");
rpt("AR", RPT("AR", "Arrival Report for the 04/09/26", [["AMANN ANJA/BERND ", "337", "2/0/0/0/0", "14/09/26", "CI"],
                                                        ["KOCH PETER ", "212", "1/0/0/0/0", "06/09/26", ""]]), T(8));
let st = TAX.load();
let rows = Object.values(st.AR["20260904"].rows);
ck("two arrivals captured at 08:00", rows.length === 2);
ck("with no in-house list yet, both are expected", rows.every(r => /st_markExpected/.test(TAX.mark(st, "AR", r).text)));
/* AMANN checks in and leaves the arrival list; KOCH is still on it */
rpt("AR", RPT("AR", "Arrival Report for the 04/09/26", [["KOCH PETER ", "212", "1/0/0/0/0", "06/09/26", ""]]), T(12));
st = TAX.load(); rows = Object.values(st.AR["20260904"].rows);
const amann = rows.find(r => /AMANN/.test(r.name)), koch = rows.find(r => /KOCH/.test(r.name));
ck("the arrival that left the list is still the night's arrival", !!amann && rows.length === 2);
ck("and is known to have left it, with the time it was last seen", amann.last === T(8) && st.AR["20260904"].at === T(12));
ck("but being gone is not being checked in", /st_markExpected/.test(TAX.mark(st, "AR", amann).text));
ih(IHTXT("Guests inhouse: 04/09/26", [["AMANN ANJA/BERND", "337", "2/0/0/0/0", "04/09/26", "14/09/26", "CI"],
                                       ["ARKINSTALL PHILIP/CAROL ", "414-15", "2/0/0/0/0", "02/09/26", "05/09/26", "CI"]]), T(13));
st = TAX.load();
ck("the in-house list showing the same name and room with CI marks it checked in",
   /st_markIn\(13:00\)/.test(TAX.mark(st, "AR", amann).text) && TAX.mark(st, "AR", amann).cls === "mIn");
ck("the one still on the arrival list stays expected", /st_markExpected/.test(TAX.mark(st, "AR", koch).text));
/* same name, another room: not a match — an exact match of reservation name AND room */
ih(IHTXT("Guests inhouse: 04/09/26", [["AMANN ANJA/BERND", "338", "2/0/0/0/0", "04/09/26", "14/09/26", "CI"]]), T(14));
st = TAX.load();
ck("the same name in another room is not that arrival checked in", /st_markExpected/.test(TAX.mark(st, "AR", amann).text));

console.log("--- 2. departures: gone from the list proves nothing; absent from a complete in-house list does");
for(const k of Object.keys(store)) delete store[k]; store["reccheck_legacy"] = "0";
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["BURWIECK/GRUBE TAREK/KATHARINA ", "125", "2/0/0/0/0", "28/08/26", "CI"],
                                                      ["MUELLER HANS ", "414", "1/0/0/0/0", "30/08/26", "CI"]]), T(7));
st = TAX.load(); rows = Object.values(st.DP["20260904"].rows);
const bur = rows.find(r => /BURWIECK/.test(r.name)), mue = rows.find(r => /MUELLER/.test(r.name));
ck("two departures captured, no in-house list: no claim either way", rows.length === 2 && /st_markNoIH/.test(TAX.mark(st, "DP", bur).text));
/* BURWIECK leaves the departure list — nothing is concluded from that */
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["MUELLER HANS ", "414", "1/0/0/0/0", "30/08/26", "CI"]]), T(9));
st = TAX.load();
ck("a departure gone from the departure list is kept, and still says nothing", Object.values(st.DP["20260904"].rows).length === 2 && /st_markNoIH/.test(TAX.mark(st, "DP", bur).text));
/* a CUT-SHORT in-house list shows neither: absence from it proves nothing */
ih(IHTXT("Guests inhouse: 04/09/26", [["ARKINSTALL PHILIP/CAROL ", "426", "2/0/0/0/0", "02/09/26", "05/09/26", "CI"]], true), T(10));
st = TAX.load();
ck("a cut-short in-house list is held, but not as the complete one", st.IH && st.IH.cut && !st.IHC);
ck("and absence from it proves nothing — it says the read was cut short", /st_markCut\(10:00\)/.test(TAX.mark(st, "DP", bur).text) && TAX.mark(st, "DP", bur).cls === "mNone");
/* a COMPLETE in-house list, later: MUELLER is on it (as 414-15), BURWIECK is not */
ih(IHTXT("Guests inhouse: 04/09/26", [["ARKINSTALL PHILIP/CAROL ", "426", "2/0/0/0/0", "02/09/26", "05/09/26", "CI"],
                                       ["MUELLER HANS", "414-15", "1/0/0/0/0", "30/08/26", "04/09/26", "CI"]]), T(11));
st = TAX.load();
ck("absent from a complete in-house list captured afterwards: checked out, with that capture's time",
   /st_markOut\(11:00\)/.test(TAX.mark(st, "DP", bur).text) && TAX.mark(st, "DP", bur).cls === "mOut");
ck("still on it with CI — as 414-15 for a departure listed as 414 — still in house", /st_markStay\(11:00\)/.test(TAX.mark(st, "DP", mue).text) && TAX.mark(st, "DP", mue).cls === "mStay");
/* a later cut-short read does not undo what the complete one showed */
ih(IHTXT("Guests inhouse: 04/09/26", [["ARKINSTALL PHILIP/CAROL ", "426", "2/0/0/0/0", "02/09/26", "05/09/26", "CI"]], true), T(12));
st = TAX.load();
ck("a later cut-short read keeps the last complete one for absence", st.IHC.at === T(11) && st.IH.at === T(12));
ck("so the checked-out departure stays checked out", /st_markOut\(11:00\)/.test(TAX.mark(st, "DP", bur).text));
ck("and the one the cut read does not show is NOT called out by it", /st_markCut\(12:00\)/.test(TAX.mark(st, "DP", mue).text));
/* CO on the in-house list itself is the other way to be checked out */
ih(IHTXT("Guests inhouse: 04/09/26", [["MUELLER HANS", "414-15", "1/0/0/0/0", "30/08/26", "04/09/26", "CO"]]), T(15));
st = TAX.load();
ck("CO on the in-house list is checked out too", /st_markOutCO\(15:00\)/.test(TAX.mark(st, "DP", mue).text) && TAX.mark(st, "DP", mue).cls === "mOut");

/* a census dated BEFORE the departure's day says nothing about it */
for(const k of Object.keys(store)) delete store[k]; store["reccheck_legacy"] = "0";
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["LATE ARRIVAL ", "222", "1/0/0/0/0", "03/09/26", "CI"]]), T(7));
ih(IHTXT("Guests inhouse: 03/09/26", [["SOMEONE ELSE", "300", "1/0/0/0/0", "01/09/26", "05/09/26", "CI"]]), Date.UTC(2026, 8, 3, 20, 0, 0));
st = TAX.load(); rows = Object.values(st.DP["20260904"].rows);
ck("a complete census from the day before, taken before the guest arrived, does not call them checked out",
   /st_markNoIH/.test(TAX.mark(st, "DP", rows[0], 20260904).text) && TAX.mark(st, "DP", rows[0], 20260904).cls === "mNone");
ih(IHTXT("Guests inhouse: 04/09/26", [["SOMEONE ELSE", "300", "1/0/0/0/0", "01/09/26", "05/09/26", "CI"]]), T(6));
st = TAX.load();
ck("a complete census dated the departure's day does — even one captured before the departure list was",
   /st_markOut\(06:00\)/.test(TAX.mark(st, "DP", rows[0], 20260904).text));
ck("and without the day, the marks read as before", /st_markOut\(06:00\)/.test(TAX.mark(st, "DP", rows[0]).text));

console.log("--- 3. what is not a row, and what the store does not keep");
for(const k of Object.keys(store)) delete store[k]; store["reccheck_legacy"] = "0";
rpt("AR", RPT("AR", "Arrival Report for the 04/09/26", [["HALF READ ", "", "", "", ""], ["", "300", "", "", ""], ["WHOLE ", "301", "1/0/0/0/0", "05/09/26", ""]]), T(8));
st = TAX.load();
ck("a row without both a name and a room is not a reservation and is not kept", Object.keys(st.AR["20260904"].rows).length === 1);
ck("a capture with no date in its caption writes nothing", TAX.ingest("AR", TAX.parseTagged(RPT("AR", "Arrival Report", [["X ", "302", "", "", ""]]), "AR"), T(9)) === false);
ck("a caption that is not the in-house list's writes no census", TAX.ingest("IH", TAX.parseInhouse(IHTXT("Arrival Report for the 04/09/26", [["X", "302", "", "", "", "CI"]])), T(9)) === false);
ck("the same capture seen again on the next tick changes nothing", rpt("AR", RPT("AR", "Arrival Report for the 04/09/26", [["WHOLE ", "301", "1/0/0/0/0", "05/09/26", ""]]), T(8)) === false);
rpt("AR", RPT("AR", "Arrival Report for the 20/08/26", [["OLD ", "303", "1/0/0/0/0", "21/08/26", ""]]), T(10));
st = TAX.load();
ck("a day older than the week is pruned; today's is kept", !st.AR["20260820"] && !!st.AR["20260904"]);

console.log("--- 4. the pills: from the store, and from nothing else");
for(const k of Object.keys(store)) delete store[k]; store["reccheck_legacy"] = "0";
/* the ledger alone — the old source — draws nothing now */
store["reccheck_moves_v2"] = JSON.stringify({"110": {20260826: {d: 20260904, n: "LEDGER ONLY"}}, "65": {20260820: {d: 20260910, n: "STAYS ON"}}});
let P = pillsFor(NIGHT, []);
ck("the ledger's dates alone draw no pill", P.pills.length === 0 && !P.hasMoves);
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["MUELLER HANS ", "110", "1/0/0/0/0", "26/08/26", "CI"],
                                                      ["SCHAFERL ", "116", "1/0/0/0/0", "26/08/26", "CI"],
                                                      ["TURNING ", "120", "1/0/0/0/0", "26/08/26", "CI"],
                                                      ["HOLDING ", "9000", "0/0/0/0/0", "26/08/26", ""]]), T(7));
rpt("AR", RPT("AR", "Arrival Report for the 04/09/26", [["AMANN ANJA/BERND ", "337", "2/0/0/0/0", "14/09/26", "CI"],
                                                        ["NEW IN 120 ", "120", "1/0/0/0/0", "06/09/26", ""]]), T(8));
rpt("MV", "TITLE\tPerform Move for Date 04/09/26\nMV\t525\tBSF\t505\tBSF\tVASSILIEV\tX\t03/09/26\t17/09/26\nMV\t210\tBSF\t211\tBSF\tNOMARK\t\t03/09/26\t17/09/26\nMV\t300\tBSF\t300\tBSF\tSAMEROOM\tX\t03/09/26\t17/09/26\nDONE\t3\t3\t9\t5\tunicode\tcomplete\n", T(9));
P = pillsFor(NIGHT, []);
ck("a departure-list row is a departure pill",                 P.kind("110") === "dep" && P.kind("116") === "dep");
ck("an arrival-list row is an arrival pill",                   P.kind("337") === "arr");
ck("departed and arrived into again is a departure pill AND an arrival pill — no turnover", P.kinds("120") === "arr+dep");
ck("a moves row with the X is a move pill on the room taken, reading old → new", P.kind("505") === "move" && !P.has("525") && P.text("505") === "525 → 505");
ck("a moves row without the X is not a move protel shows",     !P.has("210") && !P.has("211"));
ck("a move to the same room is not a move",                    !P.has("300"));
ck("a holding room is not a pill",                             !P.has("9000"));
ck("the ledger's rooms are still not pills",                   !P.has("65"));
ck("and the body knows the panel is populated",                P.hasMoves);
ck("the red mark's index is the departure list, by lead room", P.leaving["110"] && P.leaving["110"][0] === "MUELLER HANS" && !P.leaving["65"]);
/* the departure leaves the departure list later: still tonight's departure */
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["SCHAFERL ", "116", "1/0/0/0/0", "26/08/26", "CI"]]), T(10));
P = pillsFor(NIGHT, []);
ck("a departure gone from a later capture of the list is still a pill", P.kind("110") === "dep");
/* another night's report draws that night, not this one */
ck("a report for another night draws none of this", pillsFor("3/9/2026", []).pills.length === 0);
ck("no report date, no pills", pillsFor("", []).pills.length === 0);

console.log("--- 5. the dot: the reservation's name, on a departed or moved pill");
const rc = (room, guest, x) => Object.assign({roomMain: room, guest: guest, cancelled: false, voided: false}, x || {});
P = pillsFor(NIGHT, [rc("110", "MUELLER HANS"), rc("116", "NEW ARRIVAL X"), rc("525", "VASSILIEV"), rc("337", "AMANN ANJA/BERND"),
                     rc("120", "TURNING"), rc("110", "MUELLER HANS", {cancelled: true})]);
ck("a receipt under the departing name dots the departure",        P.dot("110"));
ck("a receipt under another name on a departed room does not",     !P.dot("116"));
ck("a receipt under the moved name on the room LEFT dots the move", P.dot("505"));
ck("an arrival is never dotted",                                    !P.dot("337"));
ck("a turnover with the departing guest's receipt is dotted",      P.dot("120"));
P = pillsFor(NIGHT, [rc("505", "VASSILIEV"), rc("110", "MUELLER HANS", {voided: true}), rc("120", "NEW IN 120")]);
ck("a receipt under the moved name on the room TAKEN dots the move too", P.dot("505"));
ck("a voided receipt does not dot",                                       !P.dot("110"));
ck("a turnover with only the NEW guest's receipt is not dotted",          !P.dot("120"));
P = pillsFor(NIGHT, [rc("111", "MUELLER HANS")]);
ck("the departing name on another room does not dot the departure",      !P.dot("110"));

console.log("--- 5b. the dot over the whole stay — his word: \"any of the days of their stay\"");
/* MUELLER arrived 26/08 (the departure list says so). A report loaded on an earlier night
   of the stay carried a receipt on 110 under his name; tonight's report carries none. */
const nights = JSON.parse(store["reccheck_receipts_v1"] || "{}");
ck("each night's report leaves its room+name pairs behind, keyed by the night", Array.isArray(nights["20260904"]) && nights["20260904"].some(p => p[0] === "111" && p[1] === "MUELLER HANS"));
ck("and no amounts or serials", nights["20260904"].every(p => p.length === 2));
nights["20260901"] = [["110", "MUELLER HANS"]];                         // an earlier night of the stay
nights["20260825"] = [["116", "SCHAFERL"]];                              // the night BEFORE SCHAFERL arrived (26/08)
nights["20260902"] = [["116", "SOMEONE ELSE"]];                          // another name on 116
nights["20260903"] = [["505", "VASSILIEV"]];                             // the moved guest, the night he arrived (03/09), on the room he took
store["reccheck_receipts_v1"] = JSON.stringify(nights);
P = pillsFor(NIGHT, []);
ck("a receipt on an earlier night of the stay, under the departing name, dots the departure", P.dot("110"));
ck("a receipt the night before the stay began does not",                                   !P.dot("116"));
ck("a receipt under another name during the stay does not",                                !P.dot("116"));
ck("the moved reservation's receipt on an earlier night dots the move",                   P.dot("505"));
ck("an arrival is still never dotted",                                                     !P.dot("337"));
ck("tonight's pairs were rewritten from tonight's report — the old 111 pair is gone",      !(JSON.parse(store["reccheck_receipts_v1"])["20260904"] || []).length);
/* a night whose report was never loaded is unknown, not empty: only loaded nights are keys */
ck("nights never loaded here are simply absent",                                           !("20260830" in JSON.parse(store["reccheck_receipts_v1"])));
/* the memory is bounded */
const old = JSON.parse(store["reccheck_receipts_v1"]); old["20260601"] = [["1", "X"]]; old["junk"] = 1; store["reccheck_receipts_v1"] = JSON.stringify(old);
P = pillsFor(NIGHT, []);
const kept = JSON.parse(store["reccheck_receipts_v1"]);
ck("a night older than sixty is pruned, and a key that is not a night", !("20260601" in kept) && !("junk" in kept) && ("20260901" in kept));

console.log("--- 5c. a cut receipt name — the .oxps truncates at the column, protel's list does not");
/* Room 110's departing guest is MUELLER HANS-JOACHIM/ANNELIESE on the departure list; the
   checkcharge receipt prints MUELLER HANS-JOACHIM/ANN. With the census holding the whole
   name, the receipt's own truncation is completed and the dot lands; without it an exact
   test could never dot a long name. The arriving guest's receipt on the same room is never
   completed to the departing name — his safety condition — and the census naming the NEW
   guest completes nothing for the old guest's receipt. */
store["reccheck_receipts_v1"] = "{}";
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["MUELLER HANS-JOACHIM/ANNELIESE ", "110", "2/0/0/0/0", "26/08/26", "CI"]]), T(11));
const CUTN = "MUELLER HANS-JOACHIM/ANN", WHOLEN = "MUELLER HANS-JOACHIM/ANNELIESE";
P = pillsFor(NIGHT, [rc("110", CUTN)]);
ck("a cut name that opens the departing name dots — his word: the departing name has a receipt", P.dot("110"));
ck("and the receipt keeps its own name, uncompleted, with no census",                    P.name(rc("110", CUTN)) === CUTN);
ck("a receipt that opens no departing name does not dot",                                !pillsFor(NIGHT, [rc("110", "MUELLER HANS-JOACHIN")]).dot("110"));
/* the one case the opening cannot settle: an arrival on the same room whose name the
   receipt opens too — then nothing is marked, the arriving guest's paper above all */
rpt("AR", RPT("AR", "Arrival Report for the 04/09/26", [["MUELLER HANS-JOACHIM/ANNA ", "110", "2/0/0/0/0", "10/09/26", "CI"]]), T(12));
P = pillsFor(NIGHT, [rc("110", CUTN)]);
ck("a cut name that opens BOTH the departing and the arriving name marks nothing",      !P.dot("110") && P.kinds("110") === "arr+dep");
ck("a receipt that IS the arriving name marks nothing either, though it opens the departing one", !pillsFor(NIGHT, [rc("110", "MUELLER HANS-JOACHIM/ANNA")]).dot("110"));
ck("a longer cut that opens only the departing name still dots",                         pillsFor(NIGHT, [rc("110", "MUELLER HANS-JOACHIM/ANNEL")]).dot("110"));
ck("the red mark follows the same rule",                                                 !pillsFor(NIGHT, [rc("110", CUTN)]).isLeaving("110", CUTN) && pillsFor(NIGHT, []).isLeaving("110", "MUELLER HANS-JOACHIM/ANNEL"));
P = pillsFor(NIGHT, [rc("110", CUTN)], {"110": {guest: WHOLEN, liveKey: 20260905}});
ck("with the census holding the whole name, the receipt's truncation is completed",     P.name(rc("110", CUTN)) === WHOLEN);
ck("and the dot lands on the departure",                                                 P.dot("110"));
ck("an arriving guest's receipt on the same room keeps its own name",                    P.name(rc("110", "NEUMANN PETRA")) === "NEUMANN PETRA");
ck("three letters never complete",                                                       P.name(rc("110", "MUE")) === "MUE");
P = pillsFor(NIGHT, [rc("110", "NEUMANN PETRA")], {"110": {guest: WHOLEN, liveKey: 20260905}});
ck("... and it does not dot the departure",                                              !P.dot("110"));
P = pillsFor(NIGHT, [rc("110", CUTN)], {"110": {guest: "NEUMANN PETRA/KLAUS", liveKey: 20260905}});
ck("a census naming the NEW guest completes nothing for the old guest's receipt",        P.name(rc("110", CUTN)) === CUTN && !P.dot("110"));
ck("a stored name with no liveKey — the .oxps's own — completes nothing either",         pillsFor(NIGHT, [rc("110", CUTN)], {"110": {guest: WHOLEN}}).name(rc("110", CUTN)) === CUTN);
ck("the completed name is what the night's index remembers",                             (JSON.parse(store["reccheck_receipts_v1"])["20260904"] || []).some(p => p[0] === "110" && p[1] === CUTN));
P = pillsFor(NIGHT, [rc("110", CUTN)], {"110": {guest: WHOLEN, liveKey: 20260905}});
ck("... whole when the census had it",                                                   (JSON.parse(store["reccheck_receipts_v1"])["20260904"] || []).some(p => p[0] === "110" && p[1] === WHOLEN));

console.log("--- 6. legacy mode: nothing is captured, so the XPS-fed ledger draws, as before 1.17.42");
for(const k of Object.keys(store)) delete store[k];
store["reccheck_legacy"] = "1";
store["reccheck_moves_v2"] = JSON.stringify({"110": {20260826: {d: 20260904, n: "MUELLER HANS"}}, "65": {20260820: {d: 20260910, n: "STAYS ON"}},
                                              "72": {20260904: {d: 20260906, n: "NEMMEIER"}}});
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["FROM THE STORE ", "130", "1/0/0/0/0", "26/08/26", "CI"]]), T(7));
P = pillsFor(NIGHT, [rc("110", "MUELLER HANS")]);
ck("legacy on: the ledger's departure tonight is a pill, dotted on the departing name", P.kind("110") === "dep" && P.dot("110"));
ck("legacy on: the ledger's arrival tonight is a pill",                                P.kind("72") === "arr");
ck("legacy on: a stay that is not tonight is not",                                     !P.has("65"));
ck("legacy on: the store — which legacy never fills — is not read",                    !P.has("130"));
ck("legacy on: the red mark's index is the ledger's",                                  P.leaving["110"] && P.leaving["110"][0] === "MUELLER HANS" && !P.leaving["130"]);
store["reccheck_legacy"] = "0";
P = pillsFor(NIGHT, []);
ck("legacy off again: the store draws and the ledger does not",                        P.kind("130") === "dep" && !P.has("110") && !P.has("72"));

console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
