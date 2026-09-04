/* The protel names meeting the .oxps ingest — the collision that would have cost him
   real data, driven through the SHIPPED functions.

   A name read live from protel is UNCUT. The same guest on the Departments Check receipt
   is CUT. The room database's ingest reads any difference as "this room turned over", and
   acts on it: stamps movedOn, deletes the nickname, fires the watchlist, and overwrites
   the stored name with the receipt's. On the first night both sources are used that fires
   on EVERY room at once. This pins that it does not. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); if(at<0) throw new Error(n);
  let d=0,i=src.indexOf("{",at);
  for(let j=i;j<src.length;j++){ if(src[j]==="{")d++; else if(src[j]==="}"){d--; if(!d) return src.slice(at+1,j+1);} } };

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };

const FULL = "ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA";
const CUT  = "ABBUSHI MIRIAM/OLI";

/* syncRooms is what feeds the .oxps report into the room database. Its world is supplied
   here — ROOMS, MODEL, WATCH — and the pieces it calls that are not the subject. */
function runSync(rooms, receipts, reportDate, watch){
  const body = [
    lift("dateNum"),
    lift("prevNightKey"),
    lift("sameName"),
    lift("isCutOf"),
    lift("syncRooms"),
    "return syncRooms();"
  ].join("\n");
  const out = {dropped: null};
  new Function("ROOMS","MODEL","WATCH","saveRooms","showToast","renderNickPanel","PANEL",
               "Object","String","Set","Array","console","RegExp", body)(
    rooms, {receipts, reportDate}, watch || [],
    () => {}, (m) => { out.dropped = m; }, () => {}, null,
    Object, String, Set, Array, console, RegExp);
  return {rooms, toast: out.dropped};
}

/* --- guestFor: which name reaches the card --- */
const guestFor = (rooms, model) => new Function("ROOMS","MODEL","String","Object","RegExp",
  lift("dateNum") + "\n" + lift("isCutOf") + "\n" + lift("guestFor") + "\nreturn guestFor;")(
    rooms, model, String, Object, RegExp);

const R = () => ({"426": {guest: FULL, seen: null, liveKey: 20260904}});

let g = guestFor(R(), {receipts: [{roomMain:"426", guest: CUT}], reportDate: "4/9/2026"});
ck("the protel name beats the receipt's, same night", g("426") === FULL);

g = guestFor(R(), null);
ck("and stands when no report is loaded", g("426") === FULL);

g = guestFor(R(), {receipts: [{roomMain:"426", guest: "SOMEONE ELSE"}], reportDate: "5/9/2026"});
ck("but NOT on a different night — the room may have turned over", g("426") === "SOMEONE ELSE");

g = guestFor(R(), {receipts: [{roomMain:"426", guest: CUT}], reportDate: "?"});
ck("and on an undated report, because the cut name says so", g("426") === FULL);

/* THE ONE HE FOUND. He audits the night that has just ended; protel's in-house list
   always says today. After midnight those are different days, and matching on the date
   sent every name back to the cut one — the fix looked like it had done nothing. */
g = guestFor(R(), {receipts: [{roomMain:"426", guest: CUT}], reportDate: "3/9/2026"});
ck("a cut name still wins ACROSS the midnight boundary", g("426") === FULL);
g = guestFor(R(), {receipts: [{roomMain:"426", guest: "ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA"}],
                   reportDate: "3/9/2026"});
ck("an already-whole name is left alone",  g("426") === FULL);

/* and the case the date guard existed for must still hold */
g = guestFor(R(), {receipts: [{roomMain:"426", guest: "PAPADOPOULOS NIKOS"}], reportDate: "8/9/2026"});
ck("a turned-over room keeps the receipt's guest", g("426") === "PAPADOPOULOS NIKOS");
g = guestFor(R(), {receipts: [{roomMain:"426", guest: "ABB"}], reportDate: "8/9/2026"});
ck("and three letters is not enough to claim a match", g("426") === "ABB");

/* --- THE COLLISION. Load the Departments Check after a live read. --- */
const withNick = {"426": {guest: FULL, seen: null, liveKey: 20260904, nick: "the loud ones"},
                  "102": {guest: "ADCHMER/KAST FRANZISKA/ANDREAS", seen: null, liveKey: 20260904}};
let out = runSync(withNick,
                  [{roomMain: "426", guest: CUT}, {roomMain: "102", guest: "ADCHMER/KAST FRAN"}],
                  "4/9/2026",
                  [{room: "426"}]);
ck("the nickname SURVIVES the report load",     out.rooms["426"].nick === "the loud ones");
ck("no room is marked as turned over",          !out.rooms["426"].movedOn && !out.rooms["102"].movedOn);
ck("the uncut name is NOT overwritten by the cut one",
   out.rooms["426"].guest === FULL && out.rooms["102"].guest === "ADCHMER/KAST FRANZISKA/ANDREAS");
ck("the watchlist does not cry guest-changed",  !out.toast || !/426/.test(String(out.toast)));
ck("and the room is stamped as seen tonight",   out.rooms["426"].seen === "4/9/2026");

/* the guard must survive the .oxps spacing the cut name differently */
const spaced = {"426": {guest: FULL, seen: null, liveKey: 20260904, nick: "the loud ones"}};
out = runSync(spaced, [{roomMain: "426", guest: "  abbushi   miriam/oli  "}], "9/9/2026", []);
ck("odd spacing and case still read as the truncation",
   out.rooms["426"].nick === "the loud ones" && out.rooms["426"].guest === FULL
   && !out.rooms["426"].movedOn);

/* a REAL turnover must still be caught — the guard must not blind the detector */
const turned = {"426": {guest: FULL, seen: null, liveKey: 20260904}};
out = runSync(turned, [{roomMain: "426", guest: "PAPADOPOULOS NIKOS"}], "5/9/2026", []);
ck("a genuinely different guest IS still a turnover", !!out.rooms["426"].movedOn);
ck("and takes the new name",                    out.rooms["426"].guest === "PAPADOPOULOS NIKOS");

/* and a room the live read never touched behaves exactly as before */
const plain = {"301": {guest: "OLD GUEST", seen: "3/9/2026", nick: "corner"}};
out = runSync(plain, [{roomMain: "301", guest: "NEW GUEST"}], "4/9/2026", []);
ck("an ordinary changed name still drops the nickname", !out.rooms["301"].nick);
ck("and still marks the room",                  !!out.rooms["301"].movedOn);

console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
