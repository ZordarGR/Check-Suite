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
const consts = src.match(/const NIGHT_ROLLOVER_H = [\d.]+;[\s\S]*?const SHIFT_ROLLOVER_H = \d+;/)[0];

// ---- clock table, driving the SHIPPED functions ----
let NOW = 0;
const sandbox = {
  Date: class extends Date {
    constructor(...a){ if (!a.length) super(NOW); else super(...a); }
    static now(){ return NOW; }
  },
  Number, String, localStorage: null, console
};
const mk = (body) => new Function("Date","Number","String","localStorage","CL","saveCL","renderChecklist",
  consts + "\n" + lift("dayAt") + "\n" + lift("dayKeyAt") + "\n" + lift("bnKey") + "\n" + lift("shiftKey")
  + "\n" + lift("bnKeyOf") + "\n" + lift("businessNightDate") + "\n" + lift("clNightCheck")
  + "\n" + body);

const at = (y,mo,d,h,mi) => new Date(y, mo-1, d, h, mi).getTime();
const probe = mk("return {bn: bnKey(), sh: shiftKey()};");

console.log("wall clock (local)      working night   shift day");
let bad = 0;
const table = [
  [at(2026,9,2, 2,0),  20260901, 20260901],
  [at(2026,9,2, 3,29), 20260901, 20260901],
  [at(2026,9,2, 3,30), 20260902, 20260901],
  [at(2026,9,2, 6,59), 20260902, 20260901],
  [at(2026,9,2, 7, 0), 20260902, 20260902],
  [at(2026,9,2,23, 0), 20260902, 20260902],
  [at(2026,9,3, 0,10), 20260902, 20260902],
];
for (const [ms, wantBn, wantSh] of table){
  NOW = ms;
  const r = probe(sandbox.Date, Number, String, null, [], ()=>{}, ()=>{});
  const ok = r.bn === wantBn && r.sh === wantSh;
  if (!ok) bad++;
  console.log(new Date(ms).toString().slice(0,24).padEnd(24),
              String(r.bn).padEnd(15), String(r.sh), ok ? "" : "  <-- WRONG, wanted " + wantBn + "/" + wantSh);
}

// ---- clNightCheck: the upgrade window must not wipe ticks ----
function runCheck(storedVal, ms, ticks){
  NOW = ms;
  const store = {reccheck_cl_night: storedVal};
  const ls = {getItem: k => (k in store ? store[k] : null), setItem: (k,v) => store[k] = String(v)};
  const CL = ticks.map(d => ({done: d}));
  let painted = false;
  const fn = mk("clNightCheck(); return {cleared: CL.every(x => !x.done), stored: localStorage.getItem('reccheck_cl_night')};");
  const out = fn(sandbox.Date, Number, String, ls, CL, ()=>{}, ()=>{painted = true;});
  return out;
}
const cases = [
  ["upgrade at 04:00, old key is one day ahead", "20260902", at(2026,9,2,4,0),  [true,true], false, "20260901"],
  ["07:00 after that                          ", "20260901", at(2026,9,2,7,0),  [true,true], true,  "20260902"],
  ["ordinary shift roll at 07:30              ", "20260901", at(2026,9,2,7,30), [true,true], true,  "20260902"],
  ["mid-shift 02:00, nothing changes          ", "20260901", at(2026,9,2,2,0),  [true,true], false, "20260901"],
  ["03:30 working night turns, ticks survive  ", "20260901", at(2026,9,2,3,30), [true,true], false, "20260901"],
];
console.log("\nclNightCheck");
for (const [lbl, stored, ms, ticks, wantCleared, wantKey] of cases){
  const r = runCheck(stored, ms, ticks);
  const ok = r.cleared === wantCleared && r.stored === wantKey;
  if (!ok) bad++;
  console.log("  " + lbl + "  cleared=" + String(r.cleared).padEnd(5) + " key=" + r.stored + (ok ? "  ok" : "  <-- WRONG"));
}
console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
