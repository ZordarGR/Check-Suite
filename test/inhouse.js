/* The in-house list read live from protel, driven through the SHIPPED inhouseToRate and
   then the SHIPPED saveMoves — his five real rows, verbatim from the 04/09 04:38 run,
   plus the statuses he named that those five do not cover. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); if(at<0) throw new Error(n);
  let d=0,i=src.indexOf("{",at);
  for(let j=i;j<src.length;j++){ if(src[j]==="{")d++; else if(src[j]==="}"){d--; if(!d) return src.slice(at+1,j+1);} } };

/* verbatim from his run — 16 cells each */
const R = [
["ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA ","","426","SSV","2/0/0/2/0","29/08/26","05/09/26","EUR","353,60","spo15MAY","2.462,14","CI","","","TUI DEUTSCHLAND GmbH",""],
["ADCHMER/KAST FRANZISKA/ANDREAS ","","102","SV","2/0/0/0/0","30/08/26","06/09/26","EUR","196,20","spo10MAY","1.049,00","CI","","","BYE BYE",""],
["ALBRECHT/WIRTH MARIE SOPHIE/CLEMENS ","","218","SPSV","2/0/0/0/0","02/09/26","14/09/26","EUR","209,10","spo15MAY","447,70","CI","","","TUI DEUTSCHLAND GmbH",""],
["ARKINSTALL PHILIP/CAROL ","","414-15","BSV","2/0/0/0/0","02/09/26","05/09/26","EUR","230,00","RACK","480,00","CI","EGH GROUP ","EGH GROUP - EXPLORE GLOBAL HOLIDAYS","",""],
["AUSWOGER/WINKLER FABIAN/NATALIE ","","94","BGV","2/0/0/0/0","02/09/26","09/09/26","EUR","228,00","SNAR","506,00","CI","","","SCHAUINSLAND REISEN",""]
];
const row = (name, room, arr, dep, status) =>
  [name,"",room,"SV","2/0/0/0/0",arr,dep,"EUR","0,00","RACK","0,00",status,"","","",""];

const ing = new Function("Number","String","Object","Math","RegExp",
  lift("dkey") + "\n" + src.match(/^const IH = .*$/m)[0] + "\n" + lift("inhouseToRate")
  + "\nreturn inhouseToRate;")(Number,String,Object,Math,RegExp);

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };

const rate = ing(R, "04/09/26");
console.log("rooms:", Object.keys(rate.rooms).sort((a,b)=>a-b).join(" "), " dateKey:", rate.dateKey);
ck("all five rows become stays",                 rate.count === 5);
ck("the header date parses",                     rate.dateKey === 20260904 && rate.dateSure);
ck("names come through WHOLE",                   rate.rooms["426"].name === "ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA");
ck("arrival is column 5",                        rate.rooms["426"].arr === "29/08/26");
ck("departure is column 6",                      rate.rooms["426"].dep === "05/09/26");
ck("the adjoining pair keys on the first room",  !!rate.rooms["414"] && !rate.rooms["414-15"]);
ck("and remembers its partner",                  rate.rooms["414"].adjoining && rate.rooms["414"].partner === "15");
ck("occupancy is kept for later",                rate.rooms["426"].occ === "2/0/0/2/0");
ck("no travel agency is stored anywhere",
   JSON.stringify(rate).indexOf("TUI") < 0 && JSON.stringify(rate).indexOf("SCHAUINSLAND") < 0
   && JSON.stringify(rate).indexOf("EGH GROUP") < 0);

/* --- the statuses his five rows do not cover --- */
const S = ing([
  row("STILL HERE","201","01/09/26","10/09/26","CI"),
  row("GONE HOME","202","28/08/26","04/09/26","CO"),
  row("ARRIVING","203","04/09/26","09/09/26","Confirmed"),
  row("CANCELLED","204","04/09/26","07/09/26","Reversal/Void"),
  row("ALSO CANCELLED","205","04/09/26","07/09/26","reversal/void")
], "04/09/26");
ck("CI is a stay",                               !!S.rooms["201"]);
ck("CO is a stay — he departed, that is data",   !!S.rooms["202"]);
ck("Confirmed is a stay — protel holds it",      !!S.rooms["203"]);
ck("Reversal/Void is NOT a stay",                !S.rooms["204"] && !S.rooms["205"]);
ck("and it says how many it dropped",            S.cancelled === 2 && S.count === 3);

/* --- junk must not become a stay --- */
const J = ing([
  row("NO ROOM","","04/09/26","07/09/26","CI"),
  row("NOT A ROOM","LOBBY","04/09/26","07/09/26","CI"),
  row("NO ARRIVAL","206","","07/09/26","CI"),
  row("BAD DATE","207","not a date","07/09/26","CI"),
  null
], "04/09/26");
ck("a row with no usable room or arrival is dropped, not guessed", J.count === 0 && J.unusable === 4);

/* --- and it drives the real ledger writer --- */
const store = {};
const localStorage = {getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>store[k]=String(v), removeItem:k=>{delete store[k];}};
const body = [src.match(/^const MOVES_KEY *= *"reccheck_moves_v2";$/m)[0], lift("dkey"),
  lift("loadLedger"), lift("mvSameName"), lift("mvPrevNight"), lift("detectMoves"), lift("saveMoves"),
  "return saveMoves(RATE);"].join("\n");
const save = (r) => new Function("localStorage","RATE","Number","String","Object","JSON","Math","Date",body)
                     (localStorage, r, Number, String, Object, JSON, Math, Date);
save(rate);
const led = JSON.parse(store["reccheck_moves_v2"] || "{}");
ck("the ledger takes it through the real writer",  Object.keys(led).length === 5);
ck("room 426 is keyed on its arrival",             !!(led["426"] && led["426"][20260829]));
ck("with the departure protel printed",            led["426"][20260829].d === 20260905);
ck("and the whole name",                           led["426"][20260829].n === "ABBUSHI MIRIAM/OLIVER/NAHLA/HELENA");
ck("stamped as seen by the 04/09 read",            led["426"][20260829].seen === 20260904);

/* --- WHICH list was read.
   On 04/09 he had the arrival list open but restored rather than maximised. The frame's
   caption named no report, the helper handed back the in-house list sitting behind it,
   and nothing anywhere would have stopped those rows entering the ledger as tonight's
   stays. These pin the two things that now stop it. --- */
const titleFns = new Function("String","RegExp",
  lift("isInhouseTitle") + "\n" + lift("inhouseDate")
  + "\nreturn {isIn:isInhouseTitle, date:inhouseDate};")(String, RegExp);
const isIn = titleFns.isIn, tdate = titleFns.date;

const FRAME_BARE = "Kernos Hotel, GR-70007 Malia       protel Hotel Management Suite 2024";
ck("the in-house child's own caption is accepted",   isIn("Guests inhouse: 04/09/26"));
ck("and so is the maximised frame form",
   isIn("Kernos Hotel — protel Hotel Management Suite 2024 - [Guests inhouse: 04/09/26]"));
ck("the bare frame caption he actually got is NOT", !isIn(FRAME_BARE));
ck("the arrival list is NOT",                       !isIn("Arrival list 04/09/26"));
ck("the departure report is NOT",                   !isIn("Departure Report for 02/09/26"));
ck("nothing at all is NOT",                         !isIn("") && !isIn(null) && !isIn(undefined));
ck("a hyphen or a space in the wording still reads",
   isIn("Guests in-house: 04/09/26") && isIn("Guests in house: 04/09/26"));
ck("the date comes off the caption",                tdate("Guests inhouse: 04/09/26") === "04/09/26");
ck("the LAST date wins on the frame form",
   tdate("protel 2024 - [Guests inhouse: 04/09/26]") === "04/09/26");
ck("a caption with no date yields none",            tdate("Guests inhouse") === "");
ck("and the bare frame caption yields none either", tdate(FRAME_BARE) === "");

console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
