/* The alerts store, driven through the SHIPPED functions.

   The thing that has to hold: the same missing X, seen again five seconds later by a read
   that never stops, must be the SAME alert and not a second copy. Read and resolved are
   different states — opening the list stops the pulse, only the button removes the alert,
   and removal is removal. */
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
const CONST = /^const ALERTS_[A-Z_]+ = .*$/gm;
const body = [
  (src.match(CONST) || []).join("\n"),
  "let ALERTS = [], ALERTS_DONE = {};",
  "let NOW = 20260904;",
  "function bnKey(){ return NOW; }",
  "function paintAlertsBtn(){}",
  "function renderAlerts(){}",
  "let SCREEN = 'menu';",
  "function $(){ return null; }",
  lift("pruneAlerts"), lift("loadAlerts"), lift("saveAlerts"), lift("addAlert"),
  lift("resolveAlert"), lift("unreadAlerts"), lift("markAlertsRead"), lift("dfmtKey"),
  "return {loadAlerts, saveAlerts, addAlert, resolveAlert, unreadAlerts, markAlertsRead, dfmtKey," +
  " pruneAlerts, all: () => ALERTS, done: () => ALERTS_DONE, setNow: n => { NOW = n; }};"
].join("\n");
const A = new Function("localStorage","JSON","Array","Object","String","Set","console", body)(
  localStorage, JSON, Array, Object, String, Set, console);

A.loadAlerts();
ck("an empty store loads as no alerts",        A.all().length === 0);

const mk = (from, to, name) => ({key: "movex|20260904|" + from + "|" + to + "|" + name,
                                 kind: "moveNoX", night: 20260904, text: from + "->" + to});
ck("a new alert is taken",                     A.addAlert(mk("525","505","VASSILIEV")) === true);
ck("and it is unread",                         A.unreadAlerts() === 1);
/* the read never stops, so the same row comes back every five seconds */
ck("the SAME move is not a second alert",      A.addAlert(mk("525","505","VASSILIEV")) === false);
ck("still just the one",                       A.all().length === 1);
for(let i = 0; i < 20; i++) A.addAlert(mk("525","505","VASSILIEV"));
ck("and twenty more reads do not pile up",     A.all().length === 1);

ck("a different move IS a second alert",       A.addAlert(mk("85","153","HEINE")) === true);
ck("two now",                                  A.all().length === 2 && A.unreadAlerts() === 2);

/* read is not resolved */
A.markAlertsRead();
ck("opening the list marks them read",         A.unreadAlerts() === 0);
ck("but removes nothing",                      A.all().length === 2);
ck("and the same move still does not re-add",  A.addAlert(mk("85","153","HEINE")) === false);

/* resolving removes entirely */
A.resolveAlert("movex|20260904|85|153|HEINE");
ck("resolving removes it",                     A.all().length === 1);
ck("and the right one is left",                A.all()[0].key.indexOf("VASSILIEV") > 0);
ck("resolving an unknown key changes nothing", (A.resolveAlert("nope"), A.all().length === 1));
/* AND IT STAYS RESOLVED. The moves window is read every five seconds, so without a record
   of what he dismissed the same row is back before he has let go of the mouse — "remove
   them entirely" would have lasted five seconds and the button would pulse again. */
ck("a resolved alert does NOT come straight back", A.addAlert(mk("85","153","HEINE")) === false);
for(let i = 0; i < 20; i++) A.addAlert(mk("85","153","HEINE"));
ck("not after twenty more reads either",       A.all().length === 1);
ck("and the resolution is remembered",         !!A.done()["movex|20260904|85|153|HEINE"]);

/* an alert with no key is not an alert */
ck("no key, not stored",                       A.addAlert({text: "x"}) === false);
ck("null is refused",                          A.addAlert(null) === false);

/* it survives a reload the way the app reloads it */
const seen = A.all().length;
A.loadAlerts();
ck("the store round trips",                    A.all().length === seen);

/* rubbish in localStorage must not take the whole list down */
store["reccheck_alerts"] = "{not json";
A.loadAlerts();
ck("broken storage loads as empty, not a throw", A.all().length === 0);
store["reccheck_alerts"] = JSON.stringify([null, 3, {key:"k", text:"t"}]);
A.loadAlerts();
ck("and junk entries are dropped, the good one kept", A.all().length === 1);

/* NOTHING IN THIS FILE MAY GROW FOREVER. A full localStorage does not fail loudly — it
   throws on the NEXT setItem, which is whatever was trying to save the ledger. */
store["reccheck_alerts"] = "[]"; store["reccheck_alerts_done"] = "{}";
A.loadAlerts();
for(let n = 0; n < 30; n++){
  A.setNow(20260101 + n);
  A.addAlert({key: "night" + n, night: 20260101 + n, text: "x"});
}
const nights = new Set(A.all().map(a => a.night));
ck("only the last fourteen nights are kept (" + nights.size + ")", nights.size === 14);
ck("and the newest night survived",            nights.has(20260130));
ck("the oldest is gone",                       !nights.has(20260101));
A.setNow(20260904);
for(let i = 0; i < 600; i++) A.addAlert({key: "bulk" + i, night: 20260904, text: "x"});
ck("and a single night cannot pass the ceiling (" + A.all().length + ")", A.all().length <= 400);

store["reccheck_alerts"] = "[]"; store["reccheck_alerts_done"] = "{}";
A.loadAlerts();
ck("the night reads as a date he recognises",  A.dfmtKey(20260904) === "4/9/2026");
ck("and a broken one is not invented",         A.dfmtKey(0) === "0");

console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
