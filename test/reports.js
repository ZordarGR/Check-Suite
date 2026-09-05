/* The arrival and departure reports feeding the ledger, through the SHIPPED functions.

   The constraint these exist to protect: an arrival report names thirty rooms out of two
   hundred, and both saveMoves and detectMoves reason from ABSENCE — a room the list does
   not mention is a room the guest has left. Putting a report through that path would read
   as a hundred and seventy people leaving at once. So feedStays states only what its rows
   state, and these pin that it adds and corrects and never infers.

   The rows are his, verbatim from the 04/09 23:17 reads, cut to the five cells the helper
   sends. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); if(at<0) throw new Error(n);
  let d=0,i=src.indexOf("{",at);
  for(let j=i;j<src.length;j++){ if(src[j]==="{")d++; else if(src[j]==="}"){d--; if(!d) return src.slice(at+1,j+1);} } };

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };

const store = {};
const localStorage = {getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>store[k]=String(v),
                      removeItem:k=>{delete store[k];}};

const mk = (extra) => new Function("localStorage","JSON","Object","String","Number","RegExp","console",
  [ 'const MOVES_KEY = "reccheck_moves_v2";',
    src.match(/^const AR = .*$/m)[0], src.match(/^const DP = .*$/m)[0],
    lift("dkey"), lift("loadLedger"), lift("stayFromRow"), lift("reportToStays"), lift("feedStays"),
    extra || "",
    "return {reportToStays, feedStays, led: () => loadLedger()};" ].join("\n"))(
  localStorage, JSON, Object, String, Number, RegExp, console);
const R = mk();

/* name, room, occupancy, the ONE date the report carries, status */
const ARRIVALS = [
  ["AMANN ANJA/BERND ",           "337", "2/0/0/0/0", "14/09/26", "CI"],
  ["BOHNE BENEDIKT/IVANA/DAVID ", "525", "2/0/0/0/0", "10/09/26", "CI"],
  ["CATANICI CRISTIAN ",          "339", "2/0/0/0/0", "11/09/26", "CI"]
];
const DEPARTURES = [
  ["BAUMGARTNER ROLF PAUL/FRANCOISE ", "534",  "2/0/0/0/0", "26/08/26", "CO"],
  ["BRUEMMER FRED/GUDRUN ",            "9000", "0/0/0/0/0", "04/09/26", "CO"],
  ["BURWIECK/GRUBE TAREK/KATHARINA ",  "125",  "2/0/0/0/0", "28/08/26", "CO"],
  ["ENGEL CLAUDIA/FRANK ",             "9000", "0/0/0/0/0", "04/09/26", "CO"]
];

/* --- the arrival report: its own date IS the arrival --- */
let a = R.reportToStays(ARRIVALS, "04/09/26", true);
ck("every arrival row becomes a stay",          a.recs.length === 3);
ck("the report's date is the ARRIVAL",          a.recs[0].arr === "04/09/26");
ck("and the row's date is the departure",       a.recs[0].dep === "14/09/26");
ck("the name comes through whole",              a.recs[0].name === "AMANN ANJA/BERND");
ck("the room is the room",                      a.recs[0].room === "337");

/* --- the departure report: the other way round --- */
let d = R.reportToStays(DEPARTURES, "04/09/26", false);
ck("the report's date is the DEPARTURE",        d.recs[0].dep === "04/09/26");
ck("and the row's date is the arrival",         d.recs[0].arr === "26/08/26");
/* his word: 9000 is a holding room, ignore it */
ck("room 9000 is dropped, not recorded",        d.recs.length === 2);
ck("and it is counted rather than silently lost", d.dropped === 2);
ck("no holding room reaches the records",       !d.recs.some(r => r.room === "9000"));

/* --- a half-read row is not a stay: ReadCell returns "" for every failure it has --- */
const half = R.reportToStays([
  ["", "201", "2/0/0/0/0", "09/09/26", "CI"],            // no name
  ["SOMEONE ", "202", "2/0/0/0/0", "09/09/26", ""]       // no status
], "04/09/26", true);
ck("a row missing its name or status is dropped", half.recs.length === 0 && half.dropped === 2);
/* But an arrival row with no DEPARTURE is a real thing, not a failed read: protel prints
   an open-ended stay that way, and the ledger already treats an absent departure as one
   protel has not stated rather than one that has passed. It is recorded with no departure,
   and must not clear a departure something else already knew. */
const open = R.reportToStays([["OPEN ENDED ", "204", "2/0/0/0/0", "", "CI"]], "04/09/26", true);
ck("an arrival with no departure is still a stay", open.recs.length === 1 && open.recs[0].dep === "");
store["reccheck_moves_v2"] = JSON.stringify({"204": {"20260904": {d: 20260915, n: "OPEN ENDED", seen: 20260903}}});
R.feedStays(open.recs, 20260905);
ck("and does not wipe a departure already known", R.led()["204"][20260904].d === 20260915);
store["reccheck_moves_v2"] = "";

/* --- a cancelled row is not a stay --- */
const cx = R.reportToStays([["X ", "201", "2/0/0/0/0", "09/09/26", "Reversal/Void"]], "04/09/26", true);
ck("Reversal/Void is not a stay",               cx.recs.length === 0 && cx.cancelled === 1);

/* --- the writer: additive, and it corrects --- */
R.feedStays(a.recs, 20260904);
let led = R.led();
ck("the arrivals reach the ledger",             Object.keys(led).length === 3);
ck("keyed on the arrival",                      !!led["337"][20260904]);
ck("with the departure protel printed",         led["337"][20260904].d === 20260914);
ck("and the whole name",                        led["337"][20260904].n === "AMANN ANJA/BERND");

/* a later report shortening a stay is DATA, not a deduction — protel says so.
   The night passed here is the night the READ happened, never the date on the window: a
   report he opened for a future day would otherwise stamp entries in the future and freeze
   them against every later correction. */
R.feedStays([{room:"337", arr:"04/09/26", dep:"07/09/26", name:"AMANN ANJA/BERND"}], 20260906);
ck("a later read may correct the departure",    R.led()["337"][20260904].d === 20260907);
/* an older one may not */
R.feedStays([{room:"337", arr:"04/09/26", dep:"20/09/26", name:"AMANN ANJA/BERND"}], 20260901);
ck("an older read may not overwrite it",        R.led()["337"][20260904].d === 20260907);

/* ON A TIE THE CENSUS WINS — and this is the one the audit caught.
   `seen` is a business night on both sides, so through a whole shift the in-house census
   and a report stamp the SAME number and the recency guard is a tie. A report window is a
   snapshot from whenever it was printed; the in-house list is re-read every five seconds.
   Letting the snapshot win would push a stale departure back over an extension the census
   had already picked up — and roomMoves puts a pill on a departure equal to tonight. */
store["reccheck_moves_v2"] = JSON.stringify({
  "210": {"20260901": {d: 20260907, n: "EXTENDED GUEST", seen: 20260904}}});
R.feedStays([{room:"210", arr:"01/09/26", dep:"04/09/26", name:"EXTENDED GUEST"}], 20260904);
ck("a same-night report may NOT undo the census", R.led()["210"][20260901].d === 20260907);
/* but it may still fill a blank the census has not answered */
store["reccheck_moves_v2"] = JSON.stringify({
  "211": {"20260901": {d: 0, n: "OPEN", seen: 20260904}}});
R.feedStays([{room:"211", arr:"01/09/26", dep:"04/09/26", name:"OPEN"}], 20260904);
ck("and it may still fill a blank departure",    R.led()["211"][20260901].d === 20260904);
/* and on a strictly later night it is the newer word */
store["reccheck_moves_v2"] = JSON.stringify({
  "212": {"20260901": {d: 20260907, n: "X", seen: 20260904}}});
R.feedStays([{room:"212", arr:"01/09/26", dep:"05/09/26", name:"X"}], 20260905);
ck("a later night's report does correct it",     R.led()["212"][20260901].d === 20260905);
/* a census name is not replaced by a report name on the same night either */
store["reccheck_moves_v2"] = JSON.stringify({
  "213": {"20260901": {d: 20260907, n: "CENSUS NAME", seen: 20260904}}});
R.feedStays([{room:"213", arr:"01/09/26", dep:"07/09/26", name:"REPORT NAME"}], 20260904);
ck("nor is the census name replaced on a tie",   R.led()["213"][20260901].n === "CENSUS NAME");
/* put the ledger back to what the next section expects */
store["reccheck_moves_v2"] = "";
R.feedStays(a.recs, 20260904);
R.feedStays([{room:"337", arr:"04/09/26", dep:"07/09/26", name:"AMANN ANJA/BERND"}], 20260906);

/* IT MUST NEVER TOUCH A ROOM ITS ROWS DO NOT NAME. This is the whole point. */
const before = Object.keys(R.led()).length;
R.feedStays(d.recs, 20260904);
led = R.led();
ck("the departures add their own rooms",        Object.keys(led).length === before + 2);
ck("and every earlier room is still there",     !!led["337"] && !!led["525"] && !!led["339"]);
ck("none of them was marked as leaving",        !led["525"][20260904].mv && !led["339"][20260904].mv);
ck("nor given a departure it never had",        led["525"][20260904].d === 20260910);

/* a recorded move must survive a later report over the same stay */
store["reccheck_moves_v2"] = JSON.stringify({"148": {"20260901": {d: 20260910, n: "X", seen: 20260901, from: "325", mv: 0}}});
R.feedStays([{room:"148", arr:"01/09/26", dep:"12/09/26", name:"X"}], 20260904);
ck("a recorded move is not dropped by a report", R.led()["148"][20260901].from === "325");
ck("while the departure still updates",          R.led()["148"][20260901].d === 20260912);

/* rubbish must not take the ledger down */
const nil = t => t && t.made === 0 && t.fixed === 0 && t.same === 0 && !t.failed;
ck("no rows writes nothing",                     nil(R.feedStays([], 20260904)));
ck("no night writes nothing",                    nil(R.feedStays(a.recs, 0)));
const keep = JSON.stringify(R.led());
R.feedStays([{room:"", arr:"", dep:"", name:""}], 20260904);
ck("an empty row changes nothing",               JSON.stringify(R.led()) === keep);


/* ---- WHAT THE LINE ON SCREEN IS ALLOWED TO SAY ----

   05/09, his: "Departure report 05/09/26: 41 rows, 0 stays recorded." He read that as the
   departures not going in. They had gone in — days earlier, from the in-house census — so
   the count of things CHANGED was honestly nought while the report was a complete success.
   Nothing on screen could tell those apart, which is the whole fault. These pin that the
   three outcomes are now counted separately, so a nought can be read. */
const T = mk();
ck("a stay the ledger has never seen is MADE",
   (() => { const t = T.feedStays([{room:"401", arr:"01/09/26", dep:"05/09/26", name:"NEW"}], 20260905);
            return t.made === 1 && t.fixed === 0 && t.same === 0; })());
ck("the very same report again is ALREADY KNOWN, not a failure",
   (() => { const t = T.feedStays([{room:"401", arr:"01/09/26", dep:"05/09/26", name:"NEW"}], 20260905);
            return t.made === 0 && t.fixed === 0 && t.same === 1; })());
ck("a later report that moves the departure is CORRECTED",
   (() => { const t = T.feedStays([{room:"401", arr:"01/09/26", dep:"09/09/26", name:"NEW"}], 20260907);
            return t.made === 0 && t.fixed === 1 && t.same === 0; })());
ck("and the correction really is in the ledger",   T.led()["401"][20260901].d === 20260909);
ck("a report older than the ledger's word is ALREADY KNOWN, and changes nothing",
   (() => { const t = T.feedStays([{room:"401", arr:"01/09/26", dep:"02/09/26", name:"NEW"}], 20260903);
            return t.made === 0 && t.fixed === 0 && t.same === 1
                   && T.led()["401"][20260901].d === 20260909; })());

/* forty-one rows the census already holds: the exact shape of his line */
const C = mk();
const many = [];
for(let i = 0; i < 41; i++) many.push({room: String(100 + i), arr: "01/09/26", dep: "05/09/26", name: "G" + i});
ck("forty-one new rows are forty-one MADE",
   (() => { const t = C.feedStays(many, 20260905); return t.made === 41 && t.same === 0; })());
ck("the same forty-one again are forty-one ALREADY KNOWN, none lost",
   (() => { const t = C.feedStays(many, 20260905);
            return t.made === 0 && t.fixed === 0 && t.same === 41 && !t.failed; })());

/* a write that throws must say so rather than look like agreement */
const boom = {getItem: k => C_STORE[k] === undefined ? null : C_STORE[k],
              setItem: () => { throw new Error("quota"); },
              removeItem: () => {}};
const C_STORE = {};
const B = new Function("localStorage","JSON","Object","String","Number","RegExp","console",
  [ 'const MOVES_KEY = "reccheck_moves_v2";', lift("dkey"), lift("loadLedger"), lift("feedStays"),
    "return {feedStays};" ].join("\n"))(boom, JSON, Object, String, Number, RegExp, console);
ck("a ledger write that throws reports FAILED, not zero",
   (() => { const t = B.feedStays([{room:"401", arr:"01/09/26", dep:"05/09/26", name:"X"}], 20260905);
            return t.failed === true && t.made === 0; })());

/* ---- THE THREE DROP REASONS ARE THREE REASONS ----
   They shared one counter, which the screen labelled "holding-room row(s) ignored". A
   report whose dates came back unreadable was reported to him as a couple of holding
   rooms — the wrong answer to the only question the line exists to answer. */
const mixed = R.reportToStays([
  ["HELD GUEST ",   "9000", "0/0/0/0/0", "04/09/26", "CO"],   // holding room
  ["NO DATE ",      "301",  "2/0/0/0/0", "",         "CO"],   // arrival unreadable
  ["",              "302",  "2/0/0/0/0", "01/09/26", "CO"],   // name never arrived
  ["HALF READ ",    "303",  "2/0/0/0/0", "01/09/26", ""],     // status never arrived
  ["GOOD GUEST ",   "304",  "2/0/0/0/0", "01/09/26", "CO"]
], "04/09/26", false);
ck("the one good row is the only stay",          mixed.recs.length === 1);
ck("the holding room is counted as a holding room", mixed.held === 1);
ck("an unreadable arrival date is its own count",   mixed.nodate === 1);
ck("a half-read row is its own count",              mixed.partial === 2);
ck("and the old total still adds up",               mixed.dropped === 4);
ck("a cancelled row is none of those three",
   (() => { const c = R.reportToStays([["X ", "201", "2/0/0/0/0", "09/09/26", "Reversal/Void"]], "04/09/26", false);
            return c.cancelled === 1 && c.dropped === 0 && c.recs.length === 0; })());

console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
