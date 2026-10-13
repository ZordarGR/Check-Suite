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
function resolve(receipts, rooms, r, state, leaving = {}, arriving = {}){
  const MODEL = {reportDate:"3/9/2026", receipts};
  const STATE = state || {receipts:{}};
  const body = [lift("rKey"), lift("receiptFingerprint"), lift("rState"), nickForLine, lift("dateNum"), lift("sameName"), lift("isCutOf"), lift("nameTextIn"), lift("sameGuestLabel"), lift("expandReceiptName"), lift("receiptFullName"), lift("receiptDisplayName"), lift("guestFor"),
    "const effRoom = (r) => { " + effRoomLine.replace(/^function effRoom\(r\)\{/,"").replace(/\}$/,"") + " };",
    NAME].join("\n");
  const fn = new Function("MODEL","ROOMS","STATE","r","Object","String","LEAVING","ARRIVING", body);
  return fn(MODEL, rooms, STATE, r, Object, String, leaving, arriving);
}

const R = (sn, room, guest) => ({sn, roomMain: room, guest, dept:"BAR", cancelled:false, voided:false});
let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };

// 0. the search card and the accordion row resolve the name by the same line
ck("matchCard's name line is receiptRow's", MATCH_LINE === ROW_LINE);
ck("and it asks by room AND by receipt", /^const gname = guestFor\(effRoom\(r\), r\)/.test(MATCH_LINE));

// 0b. the case the hunt found: a live whole name, an ordinary (uncorrected) receipt
let recs0 = [R("3","426","ABBUSHI MIRIAM/OLIVER/NA")];
let z = resolve(recs0, {"426":{guest:"ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA", liveKey:20260905}}, recs0[0]);
ck("a search card shows the WHOLE name protel gave, with no room correction", z.shown === "ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA");
ck("and keeps the cut one on the tooltip", /back: ABBUSHI MIRIAM\/OLIVER\/NA$/.test(z.tip));

// 0c. a changeover day — his example, 06/09: dimitris leaves on the 10th, filippis takes
//     the room; each receipt is named after ITS guest, not after the room's first receipt
let recsX = [R("11","110","DIMITRIS"), R("12","110","FILIPPIS")];
ck("the first guest's receipt carries his name",           resolve(recsX, {}, recsX[0]).shown === "DIMITRIS");
ck("the next guest's receipt carries HIS, not the room's first", resolve(recsX, {}, recsX[1]).shown === "FILIPPIS");
let live = {"110": {guest: "FILIPPIS DIMITRIS/ANNA", liveKey: 20260910}};
ck("two different printed fragments fitting one census name stay unexpanded", resolve(recsX, live, recsX[1]).shown === "FILIPPIS");
ck("and the departed guest's receipt keeps his own name",             resolve(recsX, live, recsX[0]).shown === "DIMITRIS");
let recsY = [R("13","110","DIMITRIS PAPADOPOULOS/M"), R("14","110","DIMITRIS PAP")];
ck("a shorter cut of the same guest still takes the room's fuller name", resolve(recsY, {}, recsY[1]).shown === "DIMITRIS PAPADOPOULOS/M");

// 1. an ordinary charge, room known from the report
let recs = [R("1","112","JAROLIMEK"), R("2","112","J.")];
let a = resolve(recs, {}, recs[1]);
ck("an abbreviation that is not in the captured name remains as printed", a.shown === "J.");
ck("no unsupported full name is substituted", !/back:/.test(a.tip));

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
const fingerprint = new Function("r", lift("receiptFingerprint") + "\nreturn receiptFingerprint(r);");
st.receipts[rk(recs5[0])] = {status:"pending", corr:{room:"263"}, source:fingerprint(recs5[0])};
let e = resolve(recs5, {}, recs5[0], st);
ck("a charge whose room was corrected takes the new room's name", e.shown === "PFUENDL");
// Display must not depend on receipt order or the room's latest occupant.
const fullName = "KELLER ANNA/MORGAN", shortName = "KELLER ANNA/MORG";
const cutReceipt = R("21", "120", shortName), fullReceipt = R("22", "120", fullName);
for(const receipts of [[cutReceipt, fullReceipt], [fullReceipt, cutReceipt]]){
  ck("all room receipts can supply a fuller name, in either order", resolve(receipts, {}, cutReceipt).shown === fullName);
}
const newRooms = {"120": {guest:"STONE DAVID/ELENA", liveKey:20260903}};
ck("a departing guest's captured name survives a new room occupant",
  resolve([cutReceipt], newRooms, cutReceipt, null, {"120":[fullName]}).shown === fullName);
ck("the arrival list can supply its own guest's full name",
  resolve([cutReceipt], newRooms, cutReceipt, null, {}, {"120":[fullName]}).shown === fullName);
ck("another room cannot supply missing characters",
  resolve([cutReceipt], newRooms, cutReceipt, null, {"121":[fullName]}).shown === shortName);
ck("two matching full names stay ambiguous",
  resolve([cutReceipt], {}, cutReceipt, null, {"120":[fullName,fullName+"/ELENA"]}, {"120":["KELLER ANNA/MORGANA"]}).shown === shortName);
ck("a cancelled receipt cannot supply a fuller name",
  resolve([cutReceipt, {...fullReceipt,cancelled:true}], {}, cutReceipt).shown === shortName);
ck("a voided receipt cannot supply a fuller name",
  resolve([cutReceipt, {...fullReceipt,voided:true}], {}, cutReceipt).shown === shortName);
ck("source receipt names stay intact",cutReceipt.guest===shortName && fullReceipt.guest===fullName);
const reorderedFull = "KELLER/STONE ALICE/BRUNO/CLARA";
const rotatedShort = R("31", "55", "ALICE/BRUNO/CLARA K"), rotatedLong = R("32", "55", "ALICE/BRUNO/CLARA KE");
const rotatedRooms = {"55": {guest:reorderedFull,liveKey:20260904}};
for(const receipts of [[rotatedShort,rotatedLong],[rotatedLong,rotatedShort]]){
  ck("different lengths of the same reordered receipt text expand together",
    receipts.every(r=>resolve(receipts,rotatedRooms,r).shown===reorderedFull));
}
ck("a reordered list fragment of this guest is not a competing name",
  resolve([rotatedShort],rotatedRooms,rotatedShort,null,{"55":[rotatedLong.guest]}).shown===reorderedFull);
ck("a genuinely different captured surname still blocks the reordered fragment",
  resolve([rotatedShort],rotatedRooms,rotatedShort,null,{"55":["KENT ALICE/BRUNO/CLARA"]}).shown===rotatedShort.guest);
ck("reordered display does not alter source text",rotatedShort.guest==="ALICE/BRUNO/CLARA K" && rotatedLong.guest==="ALICE/BRUNO/CLARA KE");
console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");

process.exitCode = bad ? 1 : 0;
