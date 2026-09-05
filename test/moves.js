/* Recording a move that has already happened, through the SHIPPED recordMoves.

   He settled two things before any of this could be written. "Perform Move for Date" is
   "a record of rooms that have moved already indeed", so it may be recorded at all; and
   column 5's X is "the mark that the move is okay for protel to visualize it", so a row
   without one is a move protel itself will not show — it gets the alert, never the ledger.

   What it writes is exactly what detectMoves has always written and nothing more: the new
   room learns where the guest came from, the old room is marked vacated. It must never
   invent a stay, and `mv` must never become a departure — protel did not call it one, and
   inventing one is what put 83 departures on his panel on 30/08. */
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
const R = new Function("localStorage","JSON","Object","String","RegExp","console",
  [ 'const MOVES_KEY = "reccheck_moves_v2";',
    src.match(/^const MOVES_DONE_KEY = .*$/m)[0],
    "let LEDGER_TICK = 0;",                       // the STATUS redraw counter recordMoves bumps
    src.match(/^const MV = .*$/m)[0],
    "function render(){}",
    lift("dkey"), lift("loadLedger"), lift("movesApplied"), lift("recordMoves"),
    "return {recordMoves, applied: movesApplied, led: () => loadLedger()};" ].join("\n"))(
  localStorage, JSON, Object, String, RegExp, console);

/* his rows, verbatim: from, its type, to, its type, guest, X, arrival, departure */
const ROW = (from, to, name, x, arr) => [from, "BSF", to, "BSF", name, x, arr, "17/09/26"];

/* the ledger as the in-house census would have left it: the guest is now in 505, and 525
   still carries the stay they arrived into */
const seed = () => { store["reccheck_moves_v2"] = JSON.stringify({
  "505": {"20260903": {d: 20260917, n: "VASSILIEV", seen: 20260904}},
  "525": {"20260903": {d: 20260917, n: "VASSILIEV", seen: 20260903}}});
  delete store["reccheck_moves_applied"]; };

seed();
let n = R.recordMoves([ROW("525", "505", "VASSILIEV", "X", "03/09/26")], 20260904);
let led = R.led();
ck("the move is recorded",                       n === 2);
ck("the new room learns where they came from",   led["505"][20260903].from === "525");
ck("the old room is marked vacated",             led["525"][20260903].mv === 20260904);
ck("and `mv` is NOT a departure — protel never called it one",
   led["525"][20260903].d === 20260917);

/* the read never stops, so the same row arrives again and again */
ck("the same move is not written twice",         R.recordMoves([ROW("525","505","VASSILIEV","X","03/09/26")], 20260904) === 0);
ck("and it is remembered as applied",            Object.keys(R.applied()).length === 1);

/* A ROW WITHOUT THE X IS NOT A MOVE PROTEL WILL SHOW, so it is not one we record */
seed();
ck("a row with no X writes nothing",             R.recordMoves([ROW("525","505","VASSILIEV","","03/09/26")], 20260904) === 0);
ck("nothing was marked",                         !R.led()["525"][20260903].mv && !R.led()["505"][20260903].from);
seed();
ck("whitespace is not an X either",              R.recordMoves([ROW("525","505","VASSILIEV","  ","03/09/26")], 20260904) === 0);

/* IT MUST NEVER INVENT A STAY */
store["reccheck_moves_v2"] = JSON.stringify({});
delete store["reccheck_moves_applied"];
ck("neither stay known: nothing is written",     R.recordMoves([ROW("525","505","VASSILIEV","X","03/09/26")], 20260904) === 0);
ck("no room was conjured into the ledger",       Object.keys(R.led()).length === 0);
ck("and it is NOT marked applied, so it retries", Object.keys(R.applied()).length === 0);
/* the census arrives and creates the destination — now it lands */
store["reccheck_moves_v2"] = JSON.stringify({"505": {"20260903": {d: 20260917, n: "VASSILIEV", seen: 20260904}}});
ck("once the stay exists the move is applied",   R.recordMoves([ROW("525","505","VASSILIEV","X","03/09/26")], 20260904) === 1);
ck("with the room it came from",                 R.led()["505"][20260903].from === "525");
ck("and no stay invented for the old room",      !R.led()["525"]);

/* junk must not become a move */
seed();
ck("a half-read row is refused",                 R.recordMoves([ROW("", "505", "X", "X", "03/09/26")], 20260904) === 0);
ck("a holding room is refused",                  R.recordMoves([ROW("9000","505","X","X","03/09/26")], 20260904) === 0);
ck("a move to the same room is refused",         R.recordMoves([ROW("505","505","X","X","03/09/26")], 20260904) === 0);
ck("a row with no arrival is refused",           R.recordMoves([ROW("525","505","X","X","")], 20260904) === 0);
ck("no night, nothing written",                  R.recordMoves([ROW("525","505","X","X","03/09/26")], 0) === 0);
ck("and after all that the ledger is untouched",
   !R.led()["505"][20260903].from && !R.led()["525"][20260903].mv);

/* a LATER night's move of the same guest is a different move */
seed();
R.recordMoves([ROW("525","505","VASSILIEV","X","03/09/26")], 20260904);
store["reccheck_moves_v2"] = JSON.stringify({
  "148": {"20260903": {d: 20260917, n: "VASSILIEV", seen: 20260905}},
  "505": {"20260903": {d: 20260917, n: "VASSILIEV", seen: 20260904, from: "525"}}});
ck("a move on a later night is recorded too",
   R.recordMoves([ROW("505","148","VASSILIEV","X","03/09/26")], 20260905) === 2);
ck("and the chain is kept",                      R.led()["148"][20260903].from === "505");

console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
