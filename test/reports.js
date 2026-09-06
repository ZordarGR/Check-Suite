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
ck("no Πελάτης heading",                                      !/Πελάτης/.test(html) && /Δωμάτιο/.test(html) && /Άφιξη/.test(html) && /Όροι/.test(html));
ck("the title carries the list date, the meta says names are withheld and when it was printed", /Departure List by Time — 06\/09\/26/.test(html) && /Guest names withheld/.test(html) && /printed Κυριακή, 6 Σεπτέμβριος 2026 07:06/.test(html));
ck("the groups carry their time, the first one says it has none", /ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ — no departure time/.test(html) && /ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ 16:35/.test(html) && /ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ 16:55/.test(html));
ck("every room, its type, arrival, board and rate",           /201/.test(html) && /SPMV/.test(html) && /01\/09\/26/.test(html) && />HB</.test(html) && />FB</.test(html) && /218,00/.test(html) && /250,80/.test(html) && />73 /.test(html) && /BGV/.test(html));
ck("the notes under their rooms",                             /FULLY PREPAID!!!/.test(html) && /asked to extend 1 night/.test(html) && /FB RATE OK!!/.test(html));
ck("the totals",                                              /Ατόμων: <b>18<\/b>/.test(html) && /Δωματίων: <b>9<\/b>/.test(html));
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

console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
