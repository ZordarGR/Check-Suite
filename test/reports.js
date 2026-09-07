/* The redacted departures print — the Departure List by Time parser and the sheet,
   through the SHIPPED functions, over a page laid out exactly like his 06/09/26 file
   (every position from it; the names replaced, since a fixture is not the place for
   them). What it holds the line on: the columns come from the file's own heading line;
   the room type printed beside the number is read apart; the groups carry their time,
   the first one none; a note under a room is kept and the fragment protel prints in the
   guest column beside it is not; the totals are read; the sheet carries no guest name
   and no fragment, and everything else; a checkcharge page is not a departure list. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); if(at<0) throw new Error(n);
  let d=0,i=src.indexOf("{",at);
  for(let j=i;j<src.length;j++){ if(src[j]==="{")d++; else if(src[j]==="}"){d--; if(!d) return src.slice(at+1,j+1);} } };
const line = re => { const m = src.match(re); if(!m) throw new Error(String(re)); return m[0]; };
const PARSE = [line(/^const SPLIT_GAP = .*$/m), line(/^const DEFAULT_ADV = .*$/m), line(/^const DEPLIST_HEAD = [\s\S]*?\];$/m),
  lift("xmlDecode"), lift("parseIndices"), lift("pageTokens"), lift("parseDepList"), lift("isDepList")].join("\n");
const parse = xmls => new Function("xmls", PARSE + "\nreturn {p: parseDepList(xmls), is: isDepList(parseDepList(xmls))};")(xmls);
const BOARD = [line(/^const SPLIT_GAP = .*$/m), line(/^const DEFAULT_ADV = .*$/m), lift("xmlDecode"), lift("parseIndices"), lift("pageTokens"), lift("parseBoardingList"), lift("isBoardingList"), lift("esc"), lift("buildBoardingSheet")].join("\n");

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };

/* ---- the page, token by token, at his file's positions ---- */
const G = (x, y, s) => `<Glyphs OriginX="${x}" OriginY="${y}" FontRenderingEmSize="10" UnicodeString="${s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" />`;
const row = (y, room, type, name, arr, rate, board, price, req) =>
  [G(room.length > 2 ? 66 : 72, y, room), G(88, y, type), req ? G(176, y, req) : "", G(232, y, name), G(624, y, rate), G(808, y, board),
   G(146, y + 1, "1"), G(445, y + 1, arr), G(522, y + 1, "2"), G(551, y + 1, "0"), G(578, y + 1, "0"), G(602, y + 1, "0"), G(860, y + 1, price)].join("");
const note = (y, d, s) => G(200, y, s) + G(152, y + 1, d);
const PAGE = "<FixedPage>" + [
  G(256, 41, " Ημερομηνία Εκτύπωσης"), G(800, 49, "Σελίδα :"), G(866, 50, "1"), G(424, 52, "Kernos Hotel, GR-70007 Malia"),
  G(384, 64, "07:06"), G(232, 66, "Κυριακή, 6 Σεπτέμβριος 2026"),
  G(784, 89, "departroom1time 2"), G(523, 95, "Departure List by Time"), G(240, 97, "PROTEL HMS"), G(352, 98, "6/9/2026"), G(784, 105, "Station 219691"),
  G(312, 140, "  Ημερομηνία Αναχώρησης :"), G(512, 140, "06/09/26"),
  G(64, 161, "Δωμάτιο"), G(136, 161, "Ποσ"), G(168, 161, "Ζήτηση"), G(224, 161, "Πελάτης"), G(448, 161, "Άφιξη"), G(511, 161, "ΑΤ."), G(543, 161, "Eb"),
  G(560, 161, "Chil"), G(599, 161, "Bc"), G(624, 161, "Τιμοκατάλογος"), G(801, 161, "Όροι"), G(848, 161, "Συμφωνία"), G(936, 161, "Vip Code"),
  G(136, 173, "."), G(560, 173, "d."),
  G(72, 185, "ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ"), G(201, 185, "  :"),
  row(199, "201", "SPMV", "ALPHA/BETA", "01/09/26", "SNAR", "HB", "218,00"),
  row(215, "207", "SPMV", "GAMMA", "31/08/26", "SNAR", "HB", "0,00"),
  row(231, "251", "SPMV", "DELTA EPSILON", "31/08/26", "rack", "HB", "200,00"),
  note(246, "31/08/26", "FULLY PREPAID!!!"), note(261, "31/08/26", "TANGO ESCAPE / asked to extend 1 night at the same daily rate"),
  row(367, "73", "SGV", "ZETA", "28/08/26", "SNAR", "HB", "250,80", "BGV"),
  G(72, 385, "ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ"), G(201, 385, "16:35"),
  row(399, "245", "SPMV", "ETA/THETA", "29/08/26", "SNAR", "FB", "230,35"),
  G(232, 412, "TA"), G(200, 414, "FB RATE OK!!"), G(152, 415, "29/08/26"),
  G(72, 432, "ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ"), G(201, 432, "16:55"),
  row(446, "102", "SV", "IOTA/KAPPA", "30/08/26", "SNAR", "HB", "0,00"),
  G(512, 505, " Σύνολο Ατόμων :"), G(792, 505, " Σύνολο Child  :"), G(702, 505, "18"), G(969, 505, "0"),
  G(224, 521, " Σύνολο Δωματίων :"), G(420, 521, "9"),
  G(512, 529, " Σύνολο Extra Bed  :"), G(792, 529, " Σύνολο Baby Cot :"), G(709, 529, "0"), G(973, 529, "0"),
].join("") + "</FixedPage>";

const {p, is} = parse([PAGE]);
ck("it is a departure list",                                  is === true);
ck("the report id, the title, the list date and the station", p.id === "departroom1time" && p.title === "Departure List by Time" && p.listDate === "06/09/26" && p.station === "219691");
ck("the hotel and the page, off the line protel shares between them", p.hotel === "Kernos Hotel, GR-70007 Malia" && p.page === "1");
ck("the print date and time, as printed",                     p.printed === "Κυριακή, 6 Σεπτέμβριος 2026 07:06");
ck("the columns come from the heading line, thirteen of them", p.columns && p.columns.length === 13 && p.columns.map(c => c.key).join(",") === "room,qty,req,guest,arr,adults,eb,child,bc,rate,board,price,vip");
ck("three groups: no time, 16:35, 16:55",                     p.groups.length === 3 && p.groups.map(g => g.time).join("|") === "|16:35|16:55");
ck("four rooms in the first group, one in each of the others", p.groups.map(g => g.rows.length).join(",") === "4,1,1" && p.guests === 6);
const r201 = p.groups[0].rows[0], r251 = p.groups[0].rows[2], r73 = p.groups[0].rows[3], r245 = p.groups[1].rows[0];
ck("a room row: number, type beside it, the guest, the dates and the cells", r201.room === "201" && r201.type === "SPMV" && r201.guest === "ALPHA/BETA" && r201.arr === "01/09/26" && r201.qty === "1" && r201.adults === "2" && r201.eb === "0" && r201.child === "0" && r201.bc === "0" && r201.rate === "SNAR" && r201.board === "HB" && r201.price === "218,00");
ck("a two-digit room, right-aligned, still lands in the room column, with its request", r73.room === "73" && r73.type === "SGV" && r73.req === "BGV" && r73.guest === "ZETA");
ck("the notes under a room, with their dates",                r251.notes.length === 2 && r251.notes[0].date === "31/08/26" && r251.notes[0].text === "FULLY PREPAID!!!" && /asked to extend/.test(r251.notes[1].text));
ck("a fragment in the guest column beside a note is withheld with the name, not kept in the note", r245.guestExtra === "TA" && r245.notes.length === 1 && r245.notes[0].text === "FB RATE OK!!" && r245.board === "FB");
ck("the totals, as printed",                                  p.totals.map(x => x.label + "=" + x.value).join(" ") === "Ατόμων=18 Child=0 Δωματίων=9 Extra Bed=0 Baby Cot=0");

/* a checkcharge-like page: a heading with no Πελάτης column and no title */
const OTHER = "<FixedPage>" + G(100, 40, "ΕΛΕΓΧΟΣ ΤΜΗΜΑΤΩΝ BY ROOM") + G(64, 80, "Δωμάτιο") + G(300, 80, "Ποσό") + G(66, 100, "201") + "</FixedPage>";
ck("a page that is not a departure list is refused",          parse([OTHER]).is === false);

/* ---- the sheet: names out, everything else in ---- */
const SHEET = [lift("esc"), lift("buildDepSheet")].join("\n");
const T = {"rep.withheld": "Guest names withheld", "rep.printedAt": "printed {p}", "rep.noTime": "no departure time"};
const t = (k, v) => { let s = T[k] || k; if(v) for(const x of Object.keys(v)) s = s.split("{" + x + "}").join(String(v[x])); return s; };
const sheetEl = {innerHTML: ""};
const html = new Function("p", "fname", "$", "t", SHEET + "\nreturn buildDepSheet(p, fname);")(p, "dep.oxps", () => sheetEl, t);
ck("the sheet is written into the print sheet",               sheetEl.innerHTML === html && html.length > 500);
ck("no guest name anywhere on it",                            !/ALPHA|BETA|GAMMA|DELTA|EPSILON|ZETA|ETA\/THETA|IOTA|KAPPA/.test(html));
ck("nor the fragment protel printed in the name's place",     !/>TA</.test(html) && !/\bTA\b/.test(html.replace(/<[^>]+>/g, " ")));
/* HIS CHOICE, 07/09: the guest column STAYS, with a dash in every cell, so a reader sees
   a name was removed rather than never printed. The heading is therefore present and the
   count of markers must equal the count of rows — a missing marker would be a row whose
   name simply vanished, which looks like protel printed nothing there. */
ck("the Πελάτης heading stays, with every other heading",     /Πελάτης/.test(html) && /Δωμάτιο/.test(html) && /Άφιξη/.test(html) && /Όροι/.test(html) && /Τιμοκατάλογος/.test(html));
ck("every guest cell is redacted, one marker per row",        (html.match(/class="dlOut">—</g) || []).length === 6);
ck("protel's own header block, read off the file",            /Ημερομηνία Εκτύπωσης/.test(html) && /Kernos Hotel, GR-70007 Malia/.test(html) && /departroom1time/.test(html) && /Station 219691/.test(html) && /PROTEL HMS/.test(html));
ck("the print date and its time in their own places",         /<span>Κυριακή, 6 Σεπτέμβριος 2026<\/span>/.test(html) && /class="dlTime">07:06</.test(html));
ck("the title, and the departure date centred under the box", /class="dlTitle">Departure List by Time</.test(html) && /Ημερομηνία Αναχώρησης : <b>06\/09\/26<\/b>/.test(html));
ck("the sheet still says the names were taken out on purpose", /Guest names withheld/.test(html) && /dep\.oxps/.test(html));
ck("the groups carry their time, the first one protel's own \":\"", /ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ  :/.test(html) && /ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ  16:35/.test(html) && /ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ  16:55/.test(html));
ck("every room, its type, arrival, board and rate",           /class="dlRoom">201</.test(html) && /SPMV/.test(html) && /01\/09\/26/.test(html) && />HB</.test(html) && />FB</.test(html) && /218,00/.test(html) && /250,80/.test(html) && /class="dlRoom">73</.test(html) && /BGV/.test(html));
ck("the notes under their rooms",                             /FULLY PREPAID!!!/.test(html) && /asked to extend 1 night/.test(html) && /FB RATE OK!!/.test(html));
ck("the totals",                                              /Ατόμων : <b>18<\/b>/.test(html) && /Δωματίων : <b>9<\/b>/.test(html));
ck("and it is escaped",                                       !/<script/i.test(html) && /&amp;/.test(new Function("p","fname","$","t", SHEET + "\nreturn buildDepSheet(p, fname);")(Object.assign({}, p, {station: "a&b"}), "x", () => ({}), t)));

/* ---- the delete door: only a report file inside the reports folder ---- */
const path = require("path"), os = require("os");
const {FileHub} = require(path.resolve("app/files.js"));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rcrep-"));
const REPORTS = path.join(DIR, "reports"); fs.mkdirSync(REPORTS);
fs.writeFileSync(path.join(REPORTS, "dep.oxps"), "x");
fs.writeFileSync(path.join(REPORTS, "notes.txt"), "x");
fs.mkdirSync(path.join(REPORTS, "folder.oxps"));
fs.writeFileSync(path.join(DIR, "outside.oxps"), "x");
const DEPT = path.join(DIR, "dept"); fs.mkdirSync(DEPT);
fs.writeFileSync(path.join(DEPT, "checkcharge.oxps"), "x");
const hub = new FileHub({configPath: path.join(DIR, "config.json"), onDirEvent(){}});
hub.setDir("rep", REPORTS);
hub.setDir("dept", DEPT);
ck("a report file inside the folder is removable, by its full path", hub.trashable("rep", path.join(REPORTS, "dep.oxps")) === path.resolve(REPORTS, "dep.oxps"));
ck("a file outside the folder is not",                              hub.trashable("rep", path.join(DIR, "outside.oxps")) === null);
ck("a path that climbs out of the folder is not",                   hub.trashable("rep", path.join(REPORTS, "..", "outside.oxps")) === null);
ck("a file that is not a report is not",                            hub.trashable("rep", path.join(REPORTS, "notes.txt")) === null);
ck("a folder named like a report is not",                           hub.trashable("rep", path.join(REPORTS, "folder.oxps")) === null);
ck("a file that is not there is not",                               hub.trashable("rep", path.join(REPORTS, "gone.oxps")) === null);
ck("nothing was removed by asking",                                 fs.existsSync(path.join(REPORTS, "dep.oxps")));

/* ---- REPORTS has its OWN folder, and an unknown name is refused, not turned into dept ----
   His word, 06/09, choosing between the three: "the most reasonable solution". norm() was
   `profile === "tax" ? "tax" : "dept"`, so a third profile anywhere in the app would have
   read and WRITTEN the Department Check's folder with nothing on screen to say so. */
ck("the two folders are separate",                                  hub.getDir("rep") === REPORTS && hub.getDir("dept") === DEPT && REPORTS !== DEPT);
ck("REPORTS lists its own folder, not the Department Check's",      hub.list("rep", "").files.map(f => f.name).join() === "dep.oxps");
ck("and the Department Check still lists its own",                  hub.list("dept", "").files.map(f => f.name).join() === "checkcharge.oxps");
ck("a name files.js does not know is refused, not read as dept",    hub.norm("reports") === null && hub.getDir("reports") === null);
ck("... and cannot be written either",                              hub.setDir("reports", DIR) === null && hub.getDir("dept") === DEPT);
ck("... nor can it delete through the wrong folder",                hub.trashable("reports", path.join(REPORTS, "dep.oxps")) === null);
ck("a report of one profile is not removable through another",      hub.trashable("dept", path.join(REPORTS, "dep.oxps")) === null);
ck("the three profiles files.js knows are dept, tax and rep",       hub.norm("dept") === "dept" && hub.norm("tax") === "tax" && hub.norm("rep") === "rep");
ck("no profile at all still means the Department Check",            hub.norm(undefined) === "dept" && hub.norm(null) === "dept");
hub.stopWatch();


/* ---- the Boarding List: names out, room/counts in, glued room peeled, range and "?" kept ---- */
const BG = (x, y, str) => `<Glyphs OriginX="${x}" OriginY="${y}" FontRenderingEmSize="10" UnicodeString="${String(str).replace(/&/g,"&amp;").replace(/"/g,"&quot;")}" />`;
const bpage = "<FixedPage>" + [
  BG(336,86,"Kernos Hotel, GR-70007 Malia"), BG(635,86,"Page :"), BG(695,86,"1"),
  BG(58,94,"Printdate: 7/9/2026  03:55"),
  BG(613,118,"mealplandetail 24.010  S"), BG(392,130,"Boarding List"),
  BG(58,134,"protel"), BG(186,134,"7/9/2026"), BG(617,134,"Station 220067"),
  BG(262,193,"Breakfast"), BG(354,193,"Lunch"), BG(432,193,"Dinner"), BG(689,193,"Table"),
  BG(58,207,"Name"), BG(230,207,"#"),
  BG(51,229,"Δευ,"), BG(90,229,"07. Σεπ. 2026"), BG(665,229,"54/39"),
  BG(297,246,"266"), BG(391,246,"6"), BG(465,246,"562"), BG(670,246,"552"),
  BG(58,262,"ALPHA BETA"), BG(208,262,"201"), BG(294,262,"1"), BG(453,262,"1"),
  BG(58,276,"GAMMADELTA277"), BG(291,276,"1"), BG(450,276,"2"),
  BG(58,290,"EPSILON ZETA"), BG(210,290,"414-15"), BG(300,290,"1"), BG(460,290,"2"),
  BG(58,304,"THETA IOTA"), BG(210,304,"?"), BG(456,304,"2"),
  BG(48,340,"Summe fur Zeitraum"), BG(297,340,"266"), BG(389,340,"6"), BG(464,340,"562"),
  BG(45,360,"Pers.  Arrivals / Departures / Inhouse"), BG(656,360,"270 / 195 / 2.760"),
].join("") + "</FixedPage>";
const bfn = new Function("xmls", BOARD + "\nreturn {p: parseBoardingList(xmls), is: isBoardingList(parseBoardingList(xmls))};");
const bres = bfn([bpage]); const bp = bres.p;
ck("it is recognised as a boarding list",                     bres.is === true && bp.title === "Boarding List" && bp.id === "mealplandetail");
ck("the header: hotel, page, station, the print date",        bp.hotel === "Kernos Hotel, GR-70007 Malia" && bp.page === "1" && bp.station === "220067" && /7\/9\/2026/.test(bp.printed) && bp.printedShort === "7/9/2026");
ck("the day sub-header and its arrivals/departures",          bp.dayLabel === "Δευ, 07. Σεπ. 2026" && bp.dayArrDep === "54/39");
ck("the day totals, and the Pers. footer",                    bp.dayTotals && bp.dayTotals.bf === "266" && bp.dayTotals.dinner === "562" && bp.persLine === "270/195/2.760");
ck("four guest rows, every name replaced by the dash",        bp.rows.length === 4 && bp.rows.every(r => r.name === "—"));
ck("a plain room, kept; its meal counts in their columns",    bp.rows[0].room === "201" && bp.rows[0].bf === "1" && bp.rows[0].dinner === "1" && bp.rows[0].lunch === "" && bp.rows[0].table === "");
ck("a name glued to the room: the room is peeled back off",   bp.rows[1].room === "277" && bp.rows[1].bf === "1" && bp.rows[1].dinner === "2");
ck("an adjoining-room range is kept whole",                   bp.rows[2].room === "414-15");
ck("an unallocated room stays '?'",                            bp.rows[3].room === "?");
const bsheetEl = {innerHTML: ""};
const bhtml = new Function("p", "fname", "$", "t", BOARD + "\nreturn buildBoardingSheet(p, fname);")(bp, "boarding.oxps", () => bsheetEl, t);
ck("the sheet is written into the print sheet",               bsheetEl.innerHTML === bhtml && bhtml.length > 400);
ck("NO fixture guest name anywhere on the boarding sheet",    !/ALPHA|BETA|GAMMA|DELTA|EPSILON|ZETA|THETA|IOTA/.test(bhtml));
ck("no Name value column — only the dash under Name",          !/>ALPHA/.test(bhtml) && (bhtml.match(/class="dlOut">—</g) || []).length === 4);
ck("the boarding sheet keeps the room, the counts, the totals", /201/.test(bhtml) && /277/.test(bhtml) && /414-15/.test(bhtml) && /Boarding List/.test(bhtml) && /Summe fur Zeitraum/.test(bhtml));


console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
