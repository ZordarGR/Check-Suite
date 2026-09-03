/* The two boundaries across Greece's real DST transitions, driving the SHIPPED functions.
   Spring 2027-03-28: 03:00 -> 04:00.   Autumn 2026-10-25: 04:00 -> 03:00. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); let d=0,i=src.indexOf("{",at);
  for(let j=i;j<src.length;j++){ if(src[j]==="{")d++; else if(src[j]==="}"){d--; if(!d) return src.slice(at+1,j+1);} } };
const consts = src.match(/const NIGHT_ROLLOVER_H = [\d.]+;[\s\S]*?const SHIFT_ROLLOVER_H = \d+;/)[0];

let NOW = 0;
const FakeDate = class extends Date {
  constructor(...a){ if(!a.length) super(NOW); else super(...a); }
  static now(){ return NOW; }
};
const probe = new Function("Date","Number","String","Math",
  consts + "\n" + lift("dayAt") + "\n" + lift("dayKeyAt") + "\n" + lift("bnKey") + "\n" + lift("shiftKey")
  + "\nreturn function(){ return {bn: bnKey(), sh: shiftKey()}; };")(FakeDate, Number, String, Math);

/* the first local minute at which the key becomes `want`, scanning a real day */
function flipTime(kind, y, mo, d, want){
  for(let mins = 0; mins < 24*60; mins++){
    const t = new Date(y, mo-1, d, 0, 0, 0).getTime() + mins*60000;
    NOW = t;
    const r = probe();
    if((kind === "bn" ? r.bn : r.sh) === want) return new Date(t).toString().slice(16,21);
  }
  return "never";
}
let bad = 0;
const ck = (l, got, want) => { const ok = got === want; if(!ok) bad++;
  console.log("  " + (ok?"ok  ":"FAIL") + "  " + l.padEnd(52) + got + (ok ? "" : "   wanted " + want)); };

console.log("TZ = " + Intl.DateTimeFormat().resolvedOptions().timeZone + "\n");
console.log("an ordinary night");
ck("working night turns at",  flipTime("bn", 2026, 9, 3, 20260903), "03:30");
ck("shift turns at",          flipTime("sh", 2026, 9, 3, 20260903), "07:00");
console.log("\nautumn, the night the clock goes back (04:00 -> 03:00)");
ck("working night turns at",  flipTime("bn", 2026,10,25, 20261025), "03:30");
ck("shift turns at",          flipTime("sh", 2026,10,25, 20261025), "07:00");
console.log("\nspring, the night the clock jumps (03:00 -> 04:00, so 03:30 never happens)");
ck("working night turns at",  flipTime("bn", 2027, 3,28, 20270328), "04:00");
ck("shift turns at",          flipTime("sh", 2027, 3,28, 20270328), "07:00");
console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
