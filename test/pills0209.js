/* Rebuilds the night of 02/09 from his own DEBUG dump and drives the SHIPPED
   roomMoves + renderMoves over a DOM shim. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = name => {
  const at = src.indexOf("\nfunction " + name + "(");
  if (at < 0) throw new Error("missing " + name);
  let d = 0, i = src.indexOf("{", at);
  for (let j = i; j < src.length; j++){ if (src[j]==="{") d++; else if (src[j]==="}"){ d--; if(!d) return src.slice(at+1, j+1); } }
};
const elDecl = src.match(/^const el = \(tag, cls, txt\) =>.*$/m)[0];
const effRoomLine = src.match(/^function effRoom\(r\)\{.*$/m)[0];

function Node(tag){ this.tag=tag; this.className=""; this.textContent=""; this.title=""; this.children=[]; this.style={}; }
Node.prototype.append = function(...k){ for(const c of k) this.children.push(c); };
Object.defineProperty(Node.prototype, "innerHTML", {set(v){ if(v==="") this.children=[]; }});

function run(led, ROOMS, receipts, reportDate){
  const moves = new Node("aside"); const classes = new Set();
  const document = { createElement: t => new Node(t), body:{classList:{toggle:(c,on)=>{on?classes.add(c):classes.delete(c);}}}, querySelectorAll:()=>[] };
  const $ = sel => (sel === "#moves" ? moves : null);
  const store = {reccheck_moves_v2: JSON.stringify(led)};
  const localStorage = {getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>store[k]=String(v)};
  const MODEL = {reportDate, receipts};
  const STATE = {receipts:{}};
  const t = k => k;
  const body = [elDecl, lift("dateNum"), lift("dShort"), lift("rKey"), lift("rState"),
    "const effRoom = (r) => { " + effRoomLine.replace(/^function effRoom\(r\)\{/, "").replace(/\}$/, "") + " };",
    lift("checkableList"), lift("sameName"),
    src.match(/^const MOVES_KEY = .*$/m)[0], lift("loadMoves"),
    lift("leavingIndex"), "let LEAVING = {};", lift("isLeaving"),
    lift("roomMoves"), lift("renderMoves"),
    "renderMoves(); return {classes:[...classes], root:moves};"].join("\n");
  const fn = new Function("document","$","localStorage","MODEL","ROOMS","STATE","t","classes","moves",
                          "Number","String","Object","Set","parseInt","Math","JSON", body);
  const out = fn(document,$,localStorage,MODEL,ROOMS,STATE,t,classes,moves,Number,String,Object,Set,parseInt,Math,JSON);
  const pills = []; let head = null;
  for (const c of out.root.children){
    if (c.className && c.className.startsWith("mvGroup")) head = c.children[0].textContent.replace("mv.h.","");
    else if (c.className === "mvGrid") for (const p of c.children)
      pills.push({room: p.textContent, kind: head, dot: /\brec\b/.test(p.className), guess: /\bguess\b/.test(p.className)});
  }
  return pills;
}

const NIGHT = "2/9/2026";
// straight from his dump
const led = {
  "65":  {20260820:{d:20260910, n:"STAYS ON A"}},          // no date on 02/09 at all
  "94":  {20260820:{d:20260910, n:"STAYS ON B"}},          // "
  "106": {20260901:{d:20260906, n:"RAZAGHI/NAMAVAR"}},     // in his near-list, neither date is 02/09
  "110": {20260826:{d:20260902, n:"MUELLER"}},             // real departure tonight
  "116": {20260826:{d:20260902, n:"SCHAFERL"}},            // real departure tonight
  "132": {20260901:{d:20260915, n:"MEIER"}},               // in his near-list, neither date is 02/09
  "124": {20260819:{d:20260908, n:"STAYS ON C"}},
  "129": {20260819:{d:20260908, n:"STAYS ON D"}}
};
// the department report shows new names for these rooms — the ledger is 2 nights stale
const ROOMS = {};
for (const r of ["65","94","106","124","129","132"]) ROOMS[r] = {guest:"SOMEONE NEW", movedOn: NIGHT, seen: NIGHT};

const receipts = [
  {roomMain:"110", guest:"MUELLER",       cancelled:false, voided:false},   // the DEPARTING guest -> dot
  {roomMain:"116", guest:"NEW ARRIVAL X", cancelled:false, voided:false},   // the room's NEW guest -> must NOT dot
  {roomMain:"110", guest:"MUELLER",       cancelled:true,  voided:false}    // cancelled -> ignored
];

const pills = run(led, ROOMS, receipts, NIGHT);
console.log("pills drawn: " + pills.length);
for (const p of pills) console.log("   " + p.room.padEnd(5) + p.kind.padEnd(6) + (p.dot ? "DOT " : "    ") + (p.guess ? "dashed" : ""));

const has = r => pills.some(p => p.room === r);
const dot = r => pills.some(p => p.room === r && p.dot);
const checks = [
  ["110 departs tonight -> a pill",                    has("110")],
  ["116 departs tonight -> a pill",                    has("116")],
  ["110 receipt is the DEPARTING guest -> dot",        dot("110")],
  ["116 receipt is the NEW guest -> NO dot",           !dot("116")],
  ["65  name changed, no date tonight -> no pill",     !has("65")],
  ["94  name changed, no date tonight -> no pill",     !has("94")],
  ["124 name changed, no date tonight -> no pill",     !has("124")],
  ["129 name changed, no date tonight -> no pill",     !has("129")],
  ["106 stays 01/09-06/09 -> no pill",                 !has("106")],
  ["132 stays 01/09-15/09 -> no pill",                 !has("132")]
];
let bad = 0;
console.log();
for (const [lbl, ok] of checks){ if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + lbl); }
console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
