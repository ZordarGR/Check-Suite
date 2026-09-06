/* Drives the SHIPPED renderMoves — the function that was actually broken — over a
   minimal DOM, and reads back what it drew.

   Since 1.17.42 the pills come from the STATUS store, which the helper's captures feed,
   and not from the ledger. So the night is built here the way it is built in the app:
   the captured lists go through the shipped statusIngest, and roomMoves reads what it
   wrote. The ledger is still filled in below, and must count for nothing. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");

function lift(name){
  const at = src.indexOf("\nfunction " + name + "(");
  if (at < 0) throw new Error("missing " + name);
  let d = 0, i = src.indexOf("{", at);
  for (let j = i; j < src.length; j++){
    if (src[j] === "{") d++;
    else if (src[j] === "}") { d--; if (!d) return src.slice(at + 1, j + 1); }
  }
}
const line = re => { const m = src.match(re); if(!m) throw new Error("missing " + re); return m[0]; };
const elDecl = line(/^const el = \(tag, cls, txt\) =>.*$/m);

// ---- minimal DOM ----
function Node(tag){ this.tag = tag; this.className = ""; this.textContent = ""; this.title = "";
  this.children = []; this.style = {}; }
Node.prototype.append = function(...k){ for(const c of k) this.children.push(c); };
Object.defineProperty(Node.prototype, "innerHTML", {set(v){ if(v === "") this.children = []; }});
const moves = new Node("aside");
const classes = new Set();
const document = {
  createElement: t => new Node(t),
  body: { classList: { toggle: (c, on) => { on ? classes.add(c) : classes.delete(c); } } },
  querySelectorAll: () => []
};
const $ = sel => (sel === "#moves" ? moves : null);

// ---- one store for both halves ----
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k,v) => store[k]=String(v), removeItem: k => { delete store[k]; } };
store["reccheck_legacy"] = "0";                        // the automatic read is on

// ---- the ledger, shaped like the real one — and no longer a source of pills ----
store["reccheck_moves_v2"] = JSON.stringify({
  "53":  {20260825: {d: 20260901, n: "BERKMANN"}},
  "601": {20260830: {d: 20260930, n: "STAYS PUT"}},
  "777": {20260825: {d: 20260901, n: "LEDGER ONLY"}}      // departs tonight by the ledger; on no list
});

// ---- the night as protel showed it, through the shipped writer ----
const TAX = new Function("localStorage", "t", "I18N", [
  line(/^const IH = \{NAME: 0.*$/m), line(/^const AR = \{NAME: 0.*$/m), line(/^const DP = \{NAME: 0.*$/m), line(/^const MV = \{FROM: 0.*$/m),
  "const STATUS_KEY = \"reccheck_status_v1\"; const STATUS_KEEP_DAYS = 7; let STATUS_TICK = 0;",
  lift("dkey"), lift("leadRoom"), lift("bnk"), lift("isInhouseTitle"), lift("inhouseDate"), lift("parseTagged"),
  lift("statusLoad"), lift("statusSave"), lift("stName"), lift("stRoom"), lift("stKey"), lift("stSameRoom"), lift("stDayKey"),
  lift("statusPrune"), lift("statusIngest"),
  "return (tag, txt, at) => statusIngest(tag, parseTagged(txt, tag), at);"].join("\n"))(localStorage, k => k, {en: {}});
const RPT = (tag, title, rows) => ["TITLE\t" + title, ...rows.map(r => tag + "\t" + r.join("\t")),
  "DONE\t" + rows.length + "\t" + rows.length + "\t9\t5\tunicode\tcomplete"].join("\n");
TAX("DP", RPT("DP", "Departure Report for 01/09/26", [
  ["BERKMANN ", "53", "2/0/0/0/0", "25/08/26", "CI"],
  ["MILAS ", "67", "1/0/0/0/0", "27/08/26", "CI"],
  ["JAROLIMEK/WIEPURGER ", "112", "2/0/0/0/0", "25/08/26", "CI"]]), 1);
TAX("AR", RPT("AR", "Arrival Report for the 01/09/26", [
  ["NEMMEIER ", "72", "2/0/0/0/0", "06/09/26", ""],
  ["JABLOVSKI ", "112", "2/0/0/0/0", "12/09/26", ""]]), 2);
TAX("MV", "TITLE\tPerform Move for Date 01/09/26\nMV\t325\tBSF\t148\tBSF\tPFUENDL\tX\t28/08/26\t04/09/26\nDONE\t1\t1\t9\t5\tunicode\tcomplete\n", 3);

const MODEL = {
  reportDate: "1/9/2026",
  receipts: [
    {roomMain: "53",  guest: "BERKMANN", cancelled: false, voided: false},
    {roomMain: "999", guest: "X", cancelled: true,  voided: false},   // cancelled — must not count
    {roomMain: "998", guest: "Y", cancelled: false, voided: true}     // voided    — must not count
  ]
};
const ROOMS = {}, STATE = {receipts: {}};
const t = (k, v) => k + (v ? "(" + JSON.stringify(v) + ")" : "");

const body = [elDecl, lift("dateNum"), lift("dShort"), lift("rKey"), lift("rState"),
  "const effRoom = " + line(/^function effRoom\(r\)\{.*$/m).replace(/^function effRoom\(r\)/, "(r) =>") .replace(/^\(r\) =>\{/, "(r) => {"),
  lift("checkableList"), lift("sameName"), lift("isCutOf"), lift("receiptName"), lift("nameHit"), lift("censusNameOf"), lift("roomNames"), "let ARRIVING = {};",
  "const STATUS_KEY = \"reccheck_status_v1\";", lift("loadStatus"), lift("statusRows"), lift("pillRoom"),
  "const LEGACY_KEY = \"reccheck_legacy\";", lift("legacyOn"), line(/^const MOVES_KEY = .*$/m), lift("loadMoves"), lift("ledgerMoves"), 
  lift("dateNum2"), lift("prevNightKey"), "const RECEIPTS_KEY = \"reccheck_receipts_v1\"; const RECEIPTS_KEEP = 60;", lift("loadNightReceipts"), lift("saveNightReceipts"), lift("leavingIndex"), "let LEAVING = {};", lift("isLeaving"),
  lift("roomMoves"), lift("renderMovesFor"), lift("renderMoves"),
  "renderMoves(); return {classes: [...classes], root: moves};"].join("\n");

const run = new Function("document","$","localStorage","MODEL","ROOMS","STATE","t","classes","moves", body);
const out = run(document, $, localStorage, MODEL, ROOMS, STATE, t, classes, moves);

console.log("body classes :", out.classes.join(" ") || "(none)");
let heading = null, n = 0; const drawn = {};
for (const c of out.root.children){
  if (c.className && c.className.startsWith("mvGroup")) heading = c.children[0].textContent;
  else if (/\bmvGrid\b/.test(c.className || ""))   /* mvGrid, or mvGrid mvWide for the moves */
    for (const p of c.children){ n++; const room = p.textContent.split("→").pop().trim(); drawn[room] = ((drawn[room] || "") + " " + p.className).trim(); console.log("  " + heading.padEnd(12) + p.textContent.padEnd(10) + p.className); }
  else if (c.className === "mvTitle") console.log("title        :", c.textContent);
}
console.log(n + " pills drawn");
let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l); };
console.log();
ck("53  departs, with the departing guest's receipt -> dep, dotted", /mv-dep\b/.test(drawn["53"] || "") && /\brec\b/.test(drawn["53"]));
ck("67  departs, no receipt -> dep, no dot",                         /mv-dep\b/.test(drawn["67"] || "") && !/\brec\b/.test(drawn["67"]));
ck("72  arrives -> arr",                                             /mv-arr\b/.test(drawn["72"] || ""));
ck("112 departs and is arrived into -> a departure pill AND an arrival pill, no turnover", /mv-dep\b/.test(drawn["112"] || "") && /mv-arr\b/.test(drawn["112"] || "") && !/mv-turn\b/.test(drawn["112"] || ""));
ck("148 taken by a move -> a move pill reading 325 → 148; 325 itself is no pill",  /mv-move\b/.test(drawn["148"] || "") && !("325" in drawn));
ck("777, tonight's departure by the ledger alone -> no pill",        !("777" in drawn));
ck("601 stays put -> no pill",                                       !("601" in drawn));
ck("exactly those six",                                              n === 6);
console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
