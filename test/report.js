/* Drives the SHIPPED movesReport over a ledger shaped like his: some entries written by
   the newest list, some left behind by an older one. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); let d=0,i=src.indexOf("{",at);
  for(let j=i;j<src.length;j++){ if(src[j]==="{")d++; else if(src[j]==="}"){d--; if(!d) return src.slice(at+1,j+1);} } };
const led = {
  "110": {20260826:{d:20260902,n:"MUELLER",seen:20260901}},        // fresh
  "116": {20260826:{d:20260902,n:"SCHAFERL",seen:20260901}},       // fresh
  "244": {20260810:{d:20260902,n:"OLD ENTRY",seen:20260814}},      // stale — a phantom
  "325": {20260828:{d:20260904,n:"PFUENDL",mv:20260901}},          // vacated, must not show
  "601": {20260830:{d:20260930,n:"STAYS ON",seen:20260901}}        // not tonight
};
const store = {reccheck_moves_v2: JSON.stringify(led), reccheck_legacy: "0",
  reccheck_moves_last: JSON.stringify({biz:"1/9/2026",key:20260901,listRooms:227,wrote:227})};
const localStorage = {getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>store[k]=String(v)};
const body = [lift("dateNum"), src.match(/^const MOVES_KEY = .*$/m)[0], lift("loadMoves"),
  "const STATUS_KEY = \"reccheck_status_v1\";", lift("loadStatus"), lift("statusRows"), lift("pillRoom"),
  "const LEGACY_KEY = \"reccheck_legacy\";", lift("legacyOn"),
  lift("roomMoves"), lift("ledgerMoves"), lift("movesReport"), "return movesReport();"].join("\n");
const fn = new Function("localStorage","MODEL","ROOMS","Number","String","Object","JSON","Math", body);
const out = fn(localStorage, {reportDate:"2/9/2026", receipts:[]}, {}, Number, String, Object, JSON, Math);
console.log(out);
console.log("\n--- checks ---");
let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };
ck("the pills' own source comes first, and says nothing was captured for the night",
   /status store .*NOTHING CAPTURED FOR THIS NIGHT/.test(out) && out.indexOf("status store") < out.indexOf("ledger"));
ck("so the panel draws nothing, whatever the ledger says", /^tonight +: no pills/m.test(out));
ck("the ledger's view is labelled as the ledger's, not the pills'", /ledger's own view — not the pills' source/.test(out));
ck("every pill the ledger would draw is listed with the list that wrote it", /every pill the ledger would draw tonight/.test(out));
ck("the fresh departures are there", /110/.test(out) && /116/.test(out));
ck("the stale one is flagged", /244.*OLDER THAN THE NEWEST LIST/.test(out));
ck("the fresh ones are not flagged", !/110.*OLDER THAN THE NEWEST/.test(out));
ck("it counts the stale ones", /1 of 3 were last written by a list older than 20260901/.test(out));
ck("the vacated stay draws nothing", !/325 +dep/.test(out));
ck("a stay that is not tonight is not a pill", !/601 +dep/.test(out));
console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
