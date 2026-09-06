/* Drives the SHIPPED name resolution used by the search-result cards. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); if(at<0) throw new Error(n);
  let d=0,i=src.indexOf("{",at);
  for(let j=i;j<src.length;j++){ if(src[j]==="{")d++; else if(src[j]==="}"){d--; if(!d) return src.slice(at+1,j+1);} } };
const nickForLine = src.match(/^function nickFor\(room\)\{.*$/m)[0];
const effRoomLine = src.match(/^function effRoom\(r\)\{.*$/m)[0];

/* THE CALLER'S OWN LINE, lifted — not retyped. This harness used to carry a copy of the
   expression and said it was matchCard's; it was receiptRow's, and matchCard had kept an
   older rule (the room's name only when the room was corrected by hand) since 1.17.3, so
   the search cards showed the cut name for as long as the whole names had existed while
   this passed. A test that lifts a function proves that function, not its caller. */
const gnameOf = fn => { const m = lift(fn).match(/^\s*const gname = .*$/m); if(!m) throw new Error(fn + ": no gname line"); return m[0].trim(); };
const MATCH_LINE = gnameOf("matchCard"), ROW_LINE = gnameOf("receiptRow");
const NAME = `
  ${MATCH_LINE}
  const nick = nickFor(effRoom(r));
  return {shown: nick || gname, isNick: !!nick,
          tip: (nick ? gname + " (nick)" : gname) + (r.guest && gname !== r.guest ? "  ·  back: " + r.guest : "")};
`;
function resolve(receipts, rooms, r, state){
  const MODEL = {reportDate:"3/9/2026", receipts};
  const STATE = state || {receipts:{}};
  const body = [lift("rKey"), lift("rState"), nickForLine, lift("dateNum"), lift("isCutOf"), lift("guestFor"),
    "const effRoom = (r) => { " + effRoomLine.replace(/^function effRoom\(r\)\{/,"").replace(/\}$/,"") + " };",
    NAME].join("\n");
  const fn = new Function("MODEL","ROOMS","STATE","r","Object","String", body);
  return fn(MODEL, rooms, STATE, r, Object, String);
}

const R = (sn, room, guest) => ({sn, roomMain: room, guest, dept:"BAR", cancelled:false, voided:false});
let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };

// 0. the search card and the accordion row resolve the name by the same line
ck("matchCard's name line is receiptRow's", MATCH_LINE === ROW_LINE);
ck("and it goes through the room first", /^const gname = guestFor\(effRoom\(r\)\)/.test(MATCH_LINE));

// 0b. the case the hunt found: a live whole name, an ordinary (uncorrected) receipt
let recs0 = [R("3","426","ABBUSHI MIRIAM/OLIVER/NA")];
let z = resolve(recs0, {"426":{guest:"ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA", liveKey:20260905}}, recs0[0]);
ck("a search card shows the WHOLE name protel gave, with no room correction", z.shown === "ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA");
ck("and keeps the cut one on the tooltip", /back: ABBUSHI MIRIAM\/OLIVER\/NA$/.test(z.tip));

// 1. an ordinary charge, room known from the report
let recs = [R("1","112","JAROLIMEK"), R("2","112","J.")];
let a = resolve(recs, {}, recs[1]);
ck("a charge shows the ROOM's name, not its own abbreviation", a.shown === "JAROLIMEK");
ck("and the printed name is kept on the tooltip", /back: J\./.test(a.tip));

// 2. a nickname still wins
let b = resolve(recs, {"112":{guest:"JAROLIMEK", nick:"THE GERMANS"}}, recs[0]);
ck("a nickname still overrides the room's name", b.shown === "THE GERMANS" && b.isNick);

// 3. a room with no report name at all falls back to what is printed
let recs3 = [R("9","777","WALK IN")];
let c = resolve(recs3, {}, recs3[0]);
ck("with nothing else known, the charge's own name is used", c.shown === "WALK IN");
ck("and there is no misleading tooltip", !/back:/.test(c.tip));

// 4. ROOMS carries a name the report does not (this is the seam protel will fill)
let recs4 = [R("5","300","")];
let d = resolve(recs4, {"300":{guest:"FROM THE LEDGER"}}, recs4[0]);
ck("a room named only in ROOMS still resolves", d.shown === "FROM THE LEDGER");

// 5. a corrected room resolves through the CORRECTED room
let recs5 = [R("7","111","OLD ROOM GUEST"), R("8","263","PFUENDL")];
let st = {receipts:{}};
const rk = new Function("r", lift("rKey") + "\nreturn rKey(r);");
st.receipts[rk(recs5[0])] = {status:"pending", corr:{room:"263"}};
let e = resolve(recs5, {}, recs5[0], st);
ck("a charge whose room was corrected takes the new room's name", e.shown === "PFUENDL");
console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
