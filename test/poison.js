/* Drives the SHIPPED saveMoves. Does one open-ended reservation printed 31/12/99 wipe
   the ledger? */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); if(at<0) throw new Error(n);
  let d=0,i=src.indexOf("{",at);
  for(let j=i;j<src.length;j++){ if(src[j]==="{")d++; else if(src[j]==="}"){d--; if(!d) return src.slice(at+1,j+1);} } };

function run(rateRows, existing){
  const store = {reccheck_moves_v2: JSON.stringify(existing)};
  const localStorage = {getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>store[k]=String(v),
                        removeItem:k=>{delete store[k];}};
  const body = [
    src.match(/^const MOVES_KEY *= *"reccheck_moves_v2";$/m) ? src.match(/^const MOVES_KEY *= *"reccheck_moves_v2";$/m)[0] : 'const MOVES_KEY="reccheck_moves_v2";',
    lift("dkey"), lift("loadLedger"), lift("mvSameName"), lift("mvPrevNight"),
    lift("detectMoves"), lift("saveMoves"),
    "return saveMoves(RATE);"].join("\n");
  const fn = new Function("localStorage","RATE","Number","String","Object","JSON","Math","Date","console", body);
  const rate = {kind:"rate", dateKey: 20260901, bizDate:"1/9/2026", all: rateRows,
                rooms:{}, count:Object.keys(rateRows).length, dateSure:true};
  let out = null;
  try { out = fn(localStorage, rate, Number, String, Object, JSON, Math, Date, console); }
  catch(e){ return {error: e.message}; }
  return {report: out, led: JSON.parse(store.reccheck_moves_v2 || "{}")};
}

const normal = {
  "110": [{arr:"26/08/26", dep:"02/09/26", name:"MUELLER"}],
  "116": [{arr:"26/08/26", dep:"02/09/26", name:"SCHAFERL"}],
  "601": [{arr:"30/08/26", dep:"30/09/26", name:"STAYS ON"}]
};
const poisoned = Object.assign({}, normal, {
  "777": [{arr:"01/09/26", dep:"31/12/99", name:"OPEN ENDED"}]     // one open-ended row
});

console.log("dkey('31/12/99') =", (function(){
  const f = new Function("Number","String","Math", lift("dkey") + "\nreturn dkey('31/12/99');");
  return f(Number, String, Math);
})());

let a = run(normal, {});
console.log("\nwithout the open-ended row -> ledger rooms:", Object.keys(a.led).sort().join(" "));

let b = run(poisoned, {});
console.log("WITH the open-ended row    -> ledger rooms:", Object.keys(b.led).sort().join(" "));

// and does it keep wiping on the next ordinary load?
let c = run(normal, b.led);
console.log("next ordinary load on top  -> ledger rooms:", Object.keys(c.led).sort().join(" "));

const wiped = !("110" in b.led) && !("116" in b.led) && !("601" in b.led) && ("777" in b.led);
const stays = !("110" in c.led);
console.log("\n  " + (wiped ? "CONFIRMED" : "not reproduced") + "  one 31/12/99 row deletes every real stay");
console.log("  " + (stays ? "CONFIRMED" : "not reproduced") + "  and the poison row survives to do it again on the next load");

// --- does pruning still prune, and does a stay with no departure survive? ---
const carried = {
  "990": {20240101: {d: 20240110, n: "TWO YEARS AGO", seen: 20240101}},   // must go
  "991": {20260101: {d: 20260110, n: "THIS YEAR",     seen: 20260101}},   // must stay (within a year of 01/09/26)
  "992": {20260820: {d: 0,        n: "NO DEPARTURE",  seen: 20260820}}    // must stay
};
const d = run(normal, carried);
const rooms = Object.keys(d.led).sort().join(" ");
console.log("\ncarried ledger after an ordinary 01/09/26 load -> " + rooms);
let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };
ck("a stay that ended two years ago is still pruned", !("990" in d.led));
ck("a stay from this year is kept",                   "991" in d.led);
ck("a stay with NO departure date is kept",           "992" in d.led);
ck("tonight's real stays are written",                ("110" in d.led) && ("116" in d.led));
ck("the open-ended row no longer wipes anything",     !wiped);
console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
