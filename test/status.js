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

/* THE CLOCK IS PINNED — see test/movespanel.js. The STATUS store keeps STATUS_KEEP_DAYS nights
   back from TONIGHT and this night is dated; without the pin the fixture ages out of its own
   store on the calendar and the harness goes red with nothing in the tool wrong. */
const RealDate = Date, PIN = new RealDate(2026, 8, 5, 1, 0, 0).getTime();   // 05/09 01:00 -> night 04/09
global.Date = class extends RealDate { constructor(...a){ if(a.length) super(...a); else super(PIN); } static now(){ return PIN; } };
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
  "const STATUS_KEY = \"reccheck_status_v1\"; const STATUS_KEEP_DAYS = 15; let STATUS_TICK = 0; let LIVE_HELD = {};",
  lift("dkey"), lift("dfmt"), lift("leadRoom"), lift("bnk"), lift("hhmm"), lift("isInhouseTitle"), lift("inhouseDate"),
  lift("parseInhouse"), lift("parseTagged"),
  lift("statusLoad"), lift("statusSave"), lift("stName"), lift("stRoom"), lift("stKey"), lift("stSameRoom"), lift("stDayKey"),
  lift("statusPrune"), lift("statusIngest"), lift("ihFind"), lift("inhouseCheckedOut"), lift("consolidatedInhouseRows"), lift("statusMark"), lift("statusDay"),
  "return {ingest: statusIngest, mark: statusMark, load: statusLoad, parseInhouse: parseInhouse, parseTagged: parseTagged, tick: () => STATUS_TICK, day: statusDay, active: () => consolidatedInhouseRows(statusLoad())};"
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
    lift("checkableList"), lift("sameName"), lift("isCutOf"), lift("expandReceiptName"), lift("receiptFullName"), lift("receiptName"),
    "const STATUS_KEY = \"reccheck_status_v1\";", lift("loadStatus"), lift("statusRows"), lift("pillRoom"),
    "const LEGACY_KEY = \"reccheck_legacy\";", lift("legacyOn"), line(/^const MOVES_KEY = .*$/m), lift("loadMoves"), lift("ledgerMoves"), 
    lift("dateNum2"), lift("prevNightKey"), "const RECEIPTS_KEY = \"reccheck_receipts_v1\"; const RECEIPTS_KEEP = 15;", lift("loadNightReceipts"), lift("saveNightReceipts"),
    "let ARRIVING = {};", lift("leavingIndex"), "let LEAVING = {};", lift("nameHit"), lift("censusNameOf"), lift("nameWordSet"), lift("nameLike"), lift("otherNames"), lift("isLeaving"),
    lift("departureRows"), lift("capturedGuestName"), lift("sameGuestLabel"), lift("nameTextIn"), lift("roomMoves"), lift("renderMovesFor"), lift("renderMoves"),
    "renderMoves(); return {classes: [...classes], root: moves, leaving: leavingIndex(), isLeaving: isLeaving, LEAVING: LEAVING, receiptName: receiptName};"].join("\n");
  const fn = new Function("document", "$", "localStorage", "MODEL", "STATE", "ROOMS", "t", "classes", "moves", body);
  const out = fn(document, $, localStorage, MODEL, STATE, rooms || {}, t, classes, moves);
  const pills = []; let head = null;
  for(const c of out.root.children){
    if(c.className && c.className.startsWith("mvGroup")) head = c.children[0].textContent.replace("mv.h.", "");
    else if(/\bmvGrid\b/.test(c.className || ""))   /* mvGrid, or mvGrid mvWide for the moves */ for(const p of c.children)
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
ck("a smaller capture retains the earlier exact room arrival sighting", /st_markIn/.test(TAX.mark(st, "AR", amann).text));

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
ck("absence from even a complete capture does not confirm checkout",
   TAX.mark(st, "DP", bur).cls === "mNone");
ck("still on it with CI — as 414-15 for a departure listed as 414 — still in house", /st_markStay\(11:00\)/.test(TAX.mark(st, "DP", mue).text) && TAX.mark(st, "DP", mue).cls === "mStay");
/* a later cut-short read does not undo what the complete one showed */
ih(IHTXT("Guests inhouse: 04/09/26", [["ARKINSTALL PHILIP/CAROL ", "426", "2/0/0/0/0", "02/09/26", "05/09/26", "CI"]], true), T(12));
st = TAX.load();
ck("a later cut-short read keeps the last complete one for absence", st.IHC.at === T(11) && st.IH.at === T(12));
ck("a missing departure remains unconfirmed", TAX.mark(st, "DP", bur).cls === "mNone");
ck("and the one the cut read does not show is NOT called out by it", /st_markStay\(11:00\)/.test(TAX.mark(st, "DP", mue).text));
/* CO on the in-house list itself is the other way to be checked out */
ih(IHTXT("Guests inhouse: 04/09/26", [["MUELLER HANS", "414-15", "1/0/0/0/0", "30/08/26", "04/09/26", "CO"]]), T(15));
st = TAX.load();
ck("IH CO alone waits for the explicit departure CO", TAX.mark(st, "DP", mue).cls === "mNone");

/* a census dated BEFORE the departure's day says nothing about it */
for(const k of Object.keys(store)) delete store[k]; store["reccheck_legacy"] = "0";
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["LATE ARRIVAL ", "222", "1/0/0/0/0", "03/09/26", "CI"]]), T(7));
ih(IHTXT("Guests inhouse: 03/09/26", [["SOMEONE ELSE", "300", "1/0/0/0/0", "01/09/26", "05/09/26", "CI"]]), Date.UTC(2026, 8, 3, 20, 0, 0));
st = TAX.load(); rows = Object.values(st.DP["20260904"].rows);
ck("a complete census from the day before, taken before the guest arrived, does not call them checked out",
   /st_markNoIH/.test(TAX.mark(st, "DP", rows[0], 20260904).text) && TAX.mark(st, "DP", rows[0], 20260904).cls === "mNone");
ih(IHTXT("Guests inhouse: 04/09/26", [["SOMEONE ELSE", "300", "1/0/0/0/0", "01/09/26", "05/09/26", "CI"]]), T(6));
st = TAX.load();
ck("a same-day complete census still cannot prove checkout by absence",
   TAX.mark(st, "DP", rows[0], 20260904).cls === "mNone");
ck("omitting the day cannot enable absence-based checkout", TAX.mark(st, "DP", rows[0]).cls === "mNone");

console.log("--- 3. what is not a row, and what the store does not keep");
for(const k of Object.keys(store)) delete store[k]; store["reccheck_legacy"] = "0";
rpt("AR", RPT("AR", "Arrival Report for the 04/09/26", [["HALF READ ", "", "", "", ""], ["", "300", "", "", ""], ["WHOLE ", "301", "1/0/0/0/0", "05/09/26", ""]]), T(8));
st = TAX.load();
ck("a row without both a name and a room is not a reservation and is not kept", Object.keys(st.AR["20260904"].rows).length === 1);
ck("a capture with no date in its caption writes nothing", TAX.ingest("AR", TAX.parseTagged(RPT("AR", "Arrival Report", [["X ", "302", "", "", ""]]), "AR"), T(9)) === false);
ck("a caption that is not the in-house list's writes no census", TAX.ingest("IH", TAX.parseInhouse(IHTXT("Arrival Report for the 04/09/26", [["X", "302", "", "", "", "CI"]])), T(9)) === false);
ck("the same capture seen again on the next tick changes nothing", rpt("AR", RPT("AR", "Arrival Report for the 04/09/26", [["WHOLE ", "301", "1/0/0/0/0", "05/09/26", ""]]), T(8)) === false);
/* 15/08 is 20 nights before the pinned night of 04/09 — past STATUS_KEEP_DAYS (15) whatever the
   calendar says. It was 20/08 under the real clock, which is exactly 15 back from the pin. */
rpt("AR", RPT("AR", "Arrival Report for the 15/08/26", [["OLD ", "303", "1/0/0/0/0", "16/08/26", ""]]), T(10));
st = TAX.load();
ck("a day older than the store's window is pruned; today's is kept", !st.AR["20260815"] && !!st.AR["20260904"]);

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
/* the pill carries two departing names here (MUELLER HANS from the earlier capture, the
   whole one from this) — a receipt opening with MUELLER HANS matches the first under the
   two-way rule of 1.17.60, so the no-match case differs inside the shorter name */
ck("a receipt sharing no word with a departing name does not dot",                       !pillsFor(NIGHT, [rc("110", "SCHMIDT KLAUS")]).dot("110"));
/* the one case the opening cannot settle: an arrival on the same room whose name the
   receipt opens too — then nothing is marked, the arriving guest's paper above all */
rpt("AR", RPT("AR", "Arrival Report for the 04/09/26", [["MUELLER HANS-JOACHIM/ANNA ", "110", "2/0/0/0/0", "10/09/26", "CI"]]), T(12));
P = pillsFor(NIGHT, [rc("110", CUTN)]);
ck("a cut name that opens BOTH the departing and the arriving name marks nothing",      !P.dot("110") && P.kinds("110") === "arr+dep");
ck("a receipt that IS the arriving name marks nothing either, though it opens the departing one", !pillsFor(NIGHT, [rc("110", "MUELLER HANS-JOACHIM/ANNA")]).dot("110"));
/* under the WORD rule (1.17.61) the two reservations share MUELLER, HANS and JOACHIM, so
   a receipt sharing those is either of them — nothing is marked; only a whole word of one
   and not the other decides */
ck("a longer continuous fragment unique to the departure matches it", pillsFor(NIGHT, [rc("110", "MUELLER HANS-JOACHIM/ANNEL")]).dot("110"));
ck("a receipt with the whole word of one alone decides",                                   pillsFor(NIGHT, [rc("110", "ANNELIESE")]).dot("110") && !pillsFor(NIGHT, [rc("110", "ANNA")]).dot("110"));
ck("the red mark follows the same rule",                                                 !pillsFor(NIGHT, [rc("110", CUTN)]).isLeaving("110", CUTN) && pillsFor(NIGHT, []).isLeaving("110", "ANNELIESE") && !pillsFor(NIGHT, []).isLeaving("110", "ANNA"));
P = pillsFor(NIGHT, [rc("110", CUTN)], {"110": {guest: WHOLEN, liveKey: 20260905}});
ck("a fragment fitting a captured arrival too remains unexpanded", P.name(rc("110", CUTN)) === CUTN);
ck("census completion cannot turn an ambiguous fragment into a departure dot", !P.dot("110"));
ck("an arriving guest's receipt on the same room keeps its own name",                    P.name(rc("110", "NEUMANN PETRA")) === "NEUMANN PETRA");
ck("a short fragment fitting both known stays stays unexpanded", P.name(rc("110","MUE")) === "MUE");
P = pillsFor(NIGHT, [rc("110", "NEUMANN PETRA")], {"110": {guest: WHOLEN, liveKey: 20260905}});
ck("... and it does not dot the departure",                                              !P.dot("110"));
P = pillsFor(NIGHT, [rc("110", CUTN)], {"110": {guest: "NEUMANN PETRA/KLAUS", liveKey: 20260905}});
ck("a census naming the NEW guest completes nothing for the old guest's receipt",        P.name(rc("110", CUTN)) === CUTN && !P.dot("110"));
ck("a stored name with no liveKey — the .oxps's own — completes nothing either",         pillsFor(NIGHT, [rc("110", CUTN)], {"110": {guest: WHOLEN}}).name(rc("110", CUTN)) === CUTN);
ck("the completed name is what the night's index remembers",                             (JSON.parse(store["reccheck_receipts_v1"])["20260904"] || []).some(p => p[0] === "110" && p[1] === CUTN));
P = pillsFor(NIGHT, [rc("110", CUTN)], {"110": {guest: WHOLEN, liveKey: 20260905}});
ck("receipt memory also retains the ambiguous original fragment", (JSON.parse(store["reccheck_receipts_v1"])["20260904"] || []).some(p => p[0] === "110" && p[1] === CUTN));


console.log("--- 5d. whole receipt text must occur continuously in the reference name");
for(const k of Object.keys(store)) delete store[k]; store.reccheck_legacy="0";
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["QUINK", "56", "2/0/0/0/0", "30/08/26", "CI"]]), T(11));
ck("a surname alone cannot validate extra unmatched receipt characters", !pillsFor(NIGHT,[rc("56","QUINK FREDERICK")]).dot("56"));
ck("nor may characters be dropped, reordered or changed", !pillsFor(NIGHT,[rc("56","FREDERICK QUINK")]).dot("56") && !pillsFor(NIGHT,[rc("56","QUINKE")]).dot("56"));
ih(IHTXT("Guests inhouse: 04/09/26", [["QUINK FREDERICK/ANNA","56","2/0/0/0/0","30/08/26","04/09/26","CI"]]),T(11));
P=pillsFor(NIGHT,[rc("56","FREDERICK/ANN")]);
ck("a full capture for the exact stay completes the short departure reference", P.dot("56") && P.isLeaving("56","FREDERICK/ANN"));
ck("every character must match even with a full capture", !pillsFor(NIGHT,[rc("56","QUINK FREDERICA")]).dot("56") && !pillsFor(NIGHT,[rc("56","ANNA/FREDERICK")]).dot("56"));
rpt("AR", RPT("AR","Arrival Report for the 04/09/26",[["QUINK FREDERICK/ANNE","56","2/0/0/0/0","10/09/26","CI"]]),T(12));
ck("a complete printed fragment fitting two reservations remains ambiguous", !pillsFor(NIGHT,[rc("56","FREDERICK/ANN")]).dot("56"));
/* the previous room: protel moved QUINK from 72 to 56 on 02/09 (its X); the receipt of
   01/09 was written on 72 */
for(const k of Object.keys(store)) delete store[k];
store["reccheck_legacy"] = "0";
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["QUINK FREDERICK/ANNA", "56", "2/0/1/1/0", "30/08/26", "CI"]]), T(11));
rpt("MV", "TITLE\tPerform Move for Date 02/09/26\nMV\t72\tBGV\t56\tMVFAM\tQUINK\tX\t30/08/26\t04/09/26\nDONE\t1\t1\t9\t5\tunicode\tcomplete\n", Date.UTC(2026, 8, 2, 9));
store["reccheck_receipts_v1"] = JSON.stringify({"20260901": [["72", "QUINK FREDERICK"]]});
ck("a receipt written in the room protel moved the guest out of dots the departure from the new room", pillsFor(NIGHT, []).dot("56"));
store["reccheck_receipts_v1"] = JSON.stringify({"20260829": [["72", "QUINK FREDERICK"]]});
ck("... not one from before the reservation arrived",                                     !pillsFor(NIGHT, []).dot("56"));
store["reccheck_receipts_v1"] = JSON.stringify({"20260901": [["72", "QUINK FREDERICK"]]});
rpt("MV", "TITLE\tPerform Move for Date 02/09/26\nMV\t72\tBGV\t56\tMVFAM\tQUINK\t\t30/08/26\t04/09/26\nDONE\t1\t1\t9\t5\tunicode\tcomplete\n", Date.UTC(2026, 8, 2, 10));
ck("... nor through a move protel has not marked",                                        !pillsFor(NIGHT, []).dot("56"));
/* one reservation on two lists: moved 72 → 56 on the night it departs from 56 — a departure
   pill and a move pill under the same name, and the receipt dots BOTH (1.17.61: 1.17.60 let
   the departure's own name block the move pill) */
for(const k of Object.keys(store)) delete store[k];
store["reccheck_legacy"] = "0";
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["QUINK FREDERICK/ANNA", "56", "2/0/1/1/0", "30/08/26", "CI"]]), T(11));
rpt("MV", "TITLE\tPerform Move for Date 04/09/26\nMV\t72\tBGV\t56\tMVFAM\tQUINK\tX\t30/08/26\t04/09/26\nDONE\t1\t1\t9\t5\tunicode\tcomplete\n", T(9));
P = pillsFor(NIGHT, [rc("56", "QUINK frederick")]);
ck("the same reservation departing and moved carries two pills, and the receipt dots both", P.kinds("56") === "dep+move" && P.pills.filter(p => p.room === "56" && p.dot).length === 2);
ck("... a receipt on the room it left dots both too",                                     pillsFor(NIGHT, [rc("72", "QUINK frederick")]).pills.filter(p => p.room === "56" && p.dot).length === 2);
/* a different guest moved in on the departing guest's room: each pill its own name */
for(const k of Object.keys(store)) delete store[k];
store["reccheck_legacy"] = "0";
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [["QUINK FREDERICK/ANNA", "56", "2/0/1/1/0", "30/08/26", "CI"]]), T(11));
rpt("MV", "TITLE\tPerform Move for Date 04/09/26\nMV\t72\tBGV\t56\tMVFAM\tNEUMANN PETRA\tX\t02/09/26\t10/09/26\nDONE\t1\t1\t9\t5\tunicode\tcomplete\n", T(9));
P = pillsFor(NIGHT, [rc("56", "QUINK frederick"), rc("56", "NEUMANN PETRA")]);
ck("another guest moved in: the departure dots on QUINK's receipt, the move on NEUMANN's, each alone", P.pills.filter(p => p.room === "56" && p.dot).map(p => p.kind).sort().join("+") === "dep+move" && !pillsFor(NIGHT, [rc("56", "NEUMANN PETRA")]).pills.some(p => p.kind === "dep" && p.dot) && !pillsFor(NIGHT, [rc("56", "QUINK frederick")]).pills.some(p => p.kind === "move" && p.dot));
ck("the memory and the store keep fifteen nights — his word",                              /^const RECEIPTS_KEEP = 15;/m.test(src) && /^const STATUS_KEEP_DAYS = 15;/m.test(src));

console.log("--- 5e. move surnames and receipt first names meet through a captured full reservation");
const MOVE_SHORT = "MORGAN/TAYLOR", MOVE_FULL = "MORGAN/TAYLOR ALICE/ROBERT", RECEIPT_FIRST = "ALICE/ROBER";
function bridgeFixture(){
  for(const k of Object.keys(store)) delete store[k];
  store["reccheck_legacy"] = "0";
  return {
    AR: {"20260901": {rows: {
      expected: {name: MOVE_FULL, room: "163?", dep: "10/09/26"},
      checkedIn: {name: MOVE_FULL, room: "163", dep: "10/09/26"}
    }}},
    MV: {"20260904": {rows: {
      move: {name: MOVE_SHORT, from: "163", to: "164", x: "X", arr: "01/09/26", dep: "10/09/26"}
    }}}
  };
}
function bridgePills(st, pairs, census){
  store["reccheck_status_v1"] = JSON.stringify(st);
  store["reccheck_receipts_v1"] = JSON.stringify({"20260901": pairs || [["163", RECEIPT_FIRST]]});
  return pillsFor(NIGHT, [], census || {});
}
let bridge = bridgeFixture();
P = bridgePills(bridge, undefined, {"164": {guest: RECEIPT_FIRST, liveKey: 20260904}});
ck("a receipt on arrival day in the old room dots the move using the captured full name", P.dot("164"));
ck("the move pill still displays protel's own move-list name", P.pills[0].title.includes(MOVE_SHORT) && !P.pills[0].title.includes(MOVE_FULL));
ck("matching does not rewrite the captured status rows", store["reccheck_status_v1"] === JSON.stringify(bridge));
ck("the same name on the new room also dots", bridgePills(bridge, [["164", RECEIPT_FIRST]]).dot("164"));
ck("the same receipt name on an unrelated room does not dot", !bridgePills(bridge, [["165", RECEIPT_FIRST]]).dot("164"));
ck("another guest's receipt on the old room does not dot", !bridgePills(bridge, [["163", "SOMEONE ELSE"]]).dot("164"));
bridge = bridgeFixture();
bridge.AR["20260901"].rows.expected.room = bridge.AR["20260901"].rows.checkedIn.room = "165";
ck("a full name captured only on another room cannot connect the names", !bridgePills(bridge).dot("164"));
bridge = bridgeFixture();
bridge.AR["20260902"] = bridge.AR["20260901"]; delete bridge.AR["20260901"];
ck("an arrival from another date cannot connect the names", !bridgePills(bridge).dot("164"));
bridge = bridgeFixture();
for(const r of Object.values(bridge.AR["20260901"].rows)) r.dep = "11/09/26";
ck("a reservation with a different departure cannot connect the names", !bridgePills(bridge).dot("164"));
bridge = bridgeFixture();
bridge.AR["20260901"].rows.rival = {name: "MORGAN/TAYLOR CLARA/DAVID", room: "163", dep: "10/09/26"};
ck("two different full names fitting the same room and stay remain ambiguous", !bridgePills(bridge).dot("164"));
ck("an unresolved full name does not break the original exact move-name match", bridgePills(bridge, [["163", MOVE_SHORT]]).dot("164"));
bridge = bridgeFixture();
bridge.MV["20260904"].rows.move.name = "MORGAN/OTHER";
ck("every word of the move-list name must occur in the full name", !bridgePills(bridge).dot("164"));
bridge = bridgeFixture();
bridge.AR["20260904"] = {rows: {rival: {name: "NEWFAMILY ALICE", room: "164", dep: "10/09/26"}}};
ck("a competing arrival sharing only one word does not block the complete unique fragment", bridgePills(bridge).dot("164"));
bridge = bridgeFixture();
delete bridge.AR;
bridge.IH = {rows: [{name: MOVE_FULL, room: "164", arr: "01/09/26", dep: "10/09/26"}]};
ck("the in-house capture can supply the full name for the same room and stay", bridgePills(bridge).dot("164"));
bridge.IH.rows[0].arr = "02/09/26";
ck("an in-house row for another arrival date cannot supply it", !bridgePills(bridge).dot("164"));
bridge = bridgeFixture();
bridge.IHC = {rows: [{name: "MORGAN/TAYLOR CLARA/DAVID", room: "164", arr: "01/09/26", dep: "10/09/26"}]};
ck("conflicting arrival and in-house full names remain ambiguous", !bridgePills(bridge).dot("164"));
bridge = bridgeFixture();
bridge.DP = {"20260904": {rows: {departure: {name: MOVE_FULL, room: "164", arr: "01/09/26"}}}};
P = bridgePills(bridge);
ck("the same reservation moving and departing can dot both pills", P.pills.filter(p => p.dot).length === 2);
bridge = bridgeFixture();
bridge.MV["20260904"].rows.move.x = "";
ck("a full name cannot turn an unmarked move into a move pill", !bridgePills(bridge).has("164"));

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

console.log("--- guest account 9017 in arrival, departure and move pills");
for(const k of Object.keys(store)) delete store[k]; store["reccheck_legacy"] = "0";
rpt("AR", RPT("AR", "Arrival Report for the 04/09/26", [["MORGAN ALICE", "9008", "1/0/0/0/0", "09/09/26", "CI"]]), T(7));
rpt("DP", RPT("DP", "Departure Report for 04/09/26", [
  ["MORGAN/TAYLOR ALICE/ROBERT", "9017", "2/0/0/0/0", "02/09/26", "CI"],
  ["CREDIT CARDS", "9604", "0/0/0/0/0", "01/09/26", "CI"],
  ["HOUSE", "9000", "0/0/0/0/0", "01/09/26", "CI"],
  [" maison ", "9040", "0/0/0/0/0", "01/09/26", "CI"]]), T(7));
rpt("MV", RPT("MV", "Perform Move for Date 04/09/26", [
  ["505", "SV", "9017", "ACC", "MORGAN/TAYLOR ALICE/ROBERT", "X", "02/09/26", "04/09/26"]]), T(7));
P = pillsFor(NIGHT, [rc("9017", "ALICE/ROBERT")]);
ck("guest-account arrival is a pill", P.kind("9008") === "arr");
ck("guest-account departure and move both retain their dots", P.kinds("9017") === "dep+move" && P.pills.filter(p => p.room === "9017" && p.dot).length === 2);
ck("guest-account departure is included in the department red mark", !!P.leaving["9017"]);
ck("house accounts never become pills or departure marks", ["9000", "9604", "9040"].every(room => !P.has(room) && !P.leaving[room]));


{
console.log("--- same-day in-house row preservation");
for(const k of Object.keys(store)) delete store[k];store["reccheck_legacy"]="0";
const capRows=(date,rows,at)=>TAX.ingest("IH",{title:"Guests Inhouse: "+date,rows:rows,done:{cut:false}},at);
const ihCols=src.match(/^const IH = (\{.*\});/m);
const ix=new Function("return "+ihCols[1])();
const item=(name,room,dep)=>{const row=[];row[ix.NAME]=name;row[ix.ROOM]=room;row[ix.ARR]="01/09/26";row[ix.DEP]=dep;row[ix.STATUS]="CI";return row;};
capRows("04/09/26",[item("ALPHA TEST","101","18/09/26"),item("BETA TEST","102","19/09/26")],T(8));
capRows("04/09/26",[item("ALPHA TEST","101","20/09/26")],T(9));
let kept=TAX.load();
ck("smaller same-day list preserves omitted room",kept.IH.rows.length===2&&kept.IH.rows.some(r=>r.room==="102"));
ck("recaptured row updates its actual dates",kept.IH.rows.find(r=>r.room==="101").dep==="20/09/26");
ck("latest actual snapshot remains separate",kept.IHL.rows.length===1&&kept.IHC.rows.length===1);
capRows("04/09/26",[item("ALPHA TEST","101","10/09/26")],T(7));
ck("older capture cannot replace newer dates",TAX.load().IH.rows.find(r=>r.room==="101").dep==="20/09/26");
capRows("05/09/26",[item("GAMMA TEST","103","21/09/26")],T(10));
ck("a new business day starts a new union",TAX.load().IH.rows.length===1&&TAX.load().IH.rows[0].room==="103");

}


console.log("--- explicit departures retire only the matching retained in-house stay");
{
 for(const k of Object.keys(store)) delete store[k]; store.reccheck_legacy="0";
 ih(IHTXT("Guests inhouse: 04/09/26", [
 ["ALPHA TEST","101","2/0/0/0/0","01/09/26","04/09/26","CI"],
 ["BETA TEST","102","1/0/0/0/0","02/09/26","08/09/26","CI"]]),T(8));
 ih(IHTXT("Guests inhouse: 04/09/26",[["BETA TEST","102","1/0/0/0/0","02/09/26","08/09/26","CI"]]),T(9));
 ck("a smaller capture retains both active stays", TAX.active().length===2);
 rpt("DP",RPT("DP","Departure Report for 04/09/26",[["ALPHA TEST","101","2/0/0/0/0","01/09/26","CI"]]),T(10));
 ck("departure CI does not retire a retained guest",TAX.active().length===2);
 rpt("DP",RPT("DP","Departure Report for 04/09/26",[["ALPHA TEST","101","2/0/0/0/0","01/09/26","CO"]]),T(11));
 ck("departure CO retires exactly that stay",TAX.active().length===1&&TAX.active()[0].room==="102");
 ck("original in-house facts are still stored",TAX.load().IH.rows.length===2);
 const out=Object.values(TAX.load().DP["20260904"].rows)[0];
 ck("explicit departure CO drives its checked-out status",TAX.mark(TAX.load(),"DP",out,20260904).cls==="mOut");
 rpt("DP",RPT("DP","Departure Report for 04/09/26",[["ALPHA TEST","101","2/0/0/0/0","01/09/26","CI"]]),T(10));
 ck("an older capture cannot erase the later CO",Object.values(TAX.load().DP["20260904"].rows)[0].status==="CO");
 ih(IHTXT("Guests inhouse: 04/09/26",[["ALPHA TEST","101","2/0/0/0/0","01/09/26","04/09/26","CI"]]),T(12));
 ck("newer explicit in-house evidence is retained",TAX.active().length===2);
}
console.log("--- confirmed room moves supersede old departure locations without deleting captures");
{
  const name = "MORGAN/BRIGGS DAVID/ELENA";
  const make = () => ({
    DP: {"20260904": {rows: {
      old: {name, room:"110", arr:"01/09/26", last:100},
      current: {name, room:"120", arr:"01/09/26", last:300}
    }}},
    MV: {"20260903": {rows: {
      moved: {name:"MORGAN/BRIGGS", from:"110", to:"120", arr:"01/09/26", dep:"04/09/26", x:"X"}
    }}}
  });
  const draw = data => {
    for(const k of Object.keys(store)) delete store[k];
    store.reccheck_legacy = "0";
    store.reccheck_status_v1 = JSON.stringify(data);
    return pillsFor(NIGHT, []);
  };
  let data = make(), saved = JSON.stringify(data), p = draw(data);
  ck("only the newer captured departure room is displayed after a recorded move", !p.has("110") && p.kind("120") === "dep");
  ck("the old room is removed from LEFT TODAY too", !p.leaving["110"] && !!p.leaving["120"]);
  ck("the stored departure history remains unchanged", store.reccheck_status_v1 === saved);
  data=make();delete data.MV;
  ck("same name in two rooms is insufficient without a captured move", draw(data).has("110"));
  data=make();data.MV["20260903"].rows.moved.x="";
  ck("an unmarked move cannot hide the original departure", draw(data).has("110"));
  data=make();data.MV["20260903"].rows.moved.arr="02/09/26";
  ck("a move from a different arrival cannot hide it", draw(data).has("110"));
  data=make();data.MV["20260903"].rows.moved.dep="05/09/26";
  ck("a move from a different departure cannot hide it", draw(data).has("110"));
  data=make();data.MV["20260903"].rows.moved.name="STONE DAVID";
  ck("one shared first name does not link a different reservation's move", draw(data).has("110"));
  data=make();data.DP["20260904"].rows.current.last=100;
  ck("equal capture times leave both rooms visible", draw(data).has("110"));
  data=make();delete data.DP["20260904"].rows.current.last;
  ck("missing capture times leave both rooms visible", draw(data).has("110"));
  data=make();data.DP["20260904"].rows.current.name="MORGAN/BRIGGS DAVID/ANNA";
  ck("a different full departure name cannot replace the earlier row", draw(data).has("110"));
  data=make();delete data.DP["20260904"].rows.current;
  ck("without a newer destination departure, no departure is invented", draw(data).has("110") && !draw(data).has("120"));
  data=make();data.MV["20260905"]=data.MV["20260903"];delete data.MV["20260903"];
  ck("a move after the departure night cannot remove it", draw(data).has("110"));
  data=make();data.MV["20260903"].rows.moved.to="115";
  data.MV["20260904"]={rows:{next:{name:"MORGAN/BRIGGS",from:"115",to:"120",arr:"01/09/26",dep:"04/09/26",x:"X"}}};
  ck("two recorded moves are followed in date order", !draw(data).has("110") && draw(data).has("120"));
  data.MV["20260902"]=data.MV["20260904"];delete data.MV["20260904"];
  ck("a reverse-date chain is not treated as a completed move", draw(data).has("110"));
}

console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
