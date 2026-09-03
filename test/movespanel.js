/* Drives the SHIPPED renderMoves — the function that was actually broken — over a
   minimal DOM, and reads back what it drew. */
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
const elDecl = src.match(/^const el = \(tag, cls, txt\) =>.*$/m)[0];

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

// ---- his data, shaped like the real ledger ----
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k,v) => store[k]=String(v) };
const led = {
  "53":  {20260825: {d: 20260901, n: "BERKMANN"}},
  "67":  {20260827: {d: 20260901, n: "MILAS"}},
  "72":  {20260901: {d: 20260906, n: "NEMMEIER"}},
  "112": {20260825: {d: 20260901, n: "JAROLIMEK/WIEPURGER"}, 20260901: {d: 20260912, n: "JABLOVSKI"}},
  "148": {20260901: {d: 20260904, n: "PFUENDL", from: "325"}},
  "325": {20260828: {d: 20260904, n: "PFUENDL", mv: true}},
  "601": {20260830: {d: 20260930, n: "STAYS PUT"}}
};
store["reccheck_moves_v2"] = JSON.stringify(led);

const MODEL = {
  reportDate: "1/9/2026",
  receipts: [
    {roomMain: "53",  guest: "BERKMANN", cancelled: false, voided: false},
    {roomMain: "999", guest: "X", cancelled: true,  voided: false},   // cancelled — must not count
    {roomMain: "998", guest: "Y", cancelled: false, voided: true}     // voided    — must not count
  ]
};
const ROOMS = {}, STATE = {receipts: {}};
const I18N = JSON.parse('{"en":{}}');
const t = (k, v) => k + (v ? "(" + JSON.stringify(v) + ")" : "");

const body = [elDecl, lift("dateNum"), lift("dShort"), lift("rKey"), lift("rState"),
  "const effRoom = " + src.match(/^function effRoom\(r\)\{.*$/m)[0].replace(/^function effRoom\(r\)/, "(r) =>") .replace(/^\(r\) =>\{/, "(r) => {"),
  lift("checkableList"), lift("sameName"), src.match(/^const MOVES_KEY = .*$/m)[0], lift("loadMoves"),
  lift("leavingIndex"), "let LEAVING = {};", lift("isLeaving"),
  lift("roomMoves"), lift("renderMoves"),
  "renderMoves(); return {classes: [...classes], root: moves};"].join("\n");

const run = new Function("document","$","localStorage","MODEL","ROOMS","STATE","t","classes","moves","Number","String","Object","Set","parseInt","Math","JSON", body);
const out = run(document, $, localStorage, MODEL, ROOMS, STATE, t, classes, moves, Number, String, Object, Set, parseInt, Math, JSON);

console.log("body classes :", out.classes.join(" ") || "(none)");
let heading = null, n = 0;
for (const c of out.root.children){
  if (c.className && c.className.startsWith("mvGroup")) heading = c.children[0].textContent;
  else if (c.className === "mvGrid")
    for (const p of c.children){ n++; console.log("  " + heading.padEnd(12) + p.textContent.padEnd(5) + p.className); }
  else if (c.className === "mvTitle") console.log("title        :", c.textContent);
}
console.log(n + " pills drawn");
