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
  lift("xmlDecode"), lift("parseIndices"), lift("pageTokens"), lift("parseDepList"), lift("isDepList"),
  lift("xpsDeobfuscate"), lift("ttfMetrics"), lift("parseGlyphIndices"), lift("xpsPageSvg"), lift("xpsFontCss"), lift("xpsFontKey"), lift("buildDepExact")].join("\n");
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

/* ---- his 08/09/26 file: two pages, 30 rooms — and three ways a row went missing ----
   Every position below is that file's (names replaced). What it holds the line on:
   1. a room printed 427-2 (a stay with an index) starts at x=56, 7.68 LEFT of the Δωμάτιο
      heading, and is a row — four such rooms were dropped, three ΩΡΑ groups printed empty;
   2. where a guest name wraps, protel prints the clipped second line of the name 3.68
      above the NEXT room's text, and that room's numbers 0.64 under its text: the row must
      come out whole, with its Ποσ., Άφιξη, ΑΤ. and Συμφωνία, the fragment withheld;
   3. the header block repeated on page 2 is not a note, a fragment or a row under the
      last room of page 1. */
const {G2, PAGE1, PAGE2, NAMES} = require("./fixtures/dep0809.js");
const q = parse([PAGE1, PAGE2]).p;
const rowsOf = q => [].concat(...q.groups.map(g => g.rows));
ck("08/09: two pages, five groups, every room a row — nine of them",  q.pages === 2 && q.groups.length === 5 && q.guests === 9 && rowsOf(q).map(r => r.room).join(",") === "253,270,83,9015,427-2,319-1,404-5,146,67");
ck("08/09: a room printed 427-2 is a row, as printed, with its cells", q.groups.map(g => g.rows.length).join(",") === "4,1,2,1,1" && q.groups[1].time === "03:30" && (r => r.room === "427-2" && r.type === "BSV" && r.req === "BGV" && r.arr === "01/09/26" && r.bc === "1" && r.rate === "rack" && r.notes.length === 1 && r.notes[0].text === "1 Y.O. COT")(q.groups[1].rows[0]));
ck("08/09: 319-1, 404-5 under 07:10, one without a board",           q.groups[2].rows.map(r => r.room + ":" + r.board + ":" + r.price).join(" ") === "319-1:HB:228,00 404-5::193,80");
const r270 = q.groups[0].rows[1], r9015 = q.groups[0].rows[3], r146 = q.groups[2].rows.concat(q.groups[3].rows).find(r => r.room === "146");
ck("08/09: a row whose numbers sit 0.64 under its text, under a clipped name fragment, comes out whole", r270.room === "270" && r270.qty === "1" && r270.arr === "04/09/26" && r270.adults === "2" && r270.eb === "0" && r270.child === "0" && r270.bc === "0" && r270.price === "246,00" && r270.rate === "SNAR" && r270.board === "HB");
ck("08/09: the fragment lands in the guest band and nowhere else",    /TYA/.test(r270.guest) && !r270.guestExtra && rowsOf(q).every(r => r.notes.every(n => !/TYA/.test(n.text))));
ck("08/09: the same for 9015, with protel's label in the guest band withheld", r9015.qty === "0" && r9015.arr === "07/09/26" && r9015.price === "0,00" && /Αφ\.Ατόμου/.test(r9015.guest) && !r9015.guestExtra);
ck("08/09: nothing of page 2's header lands under page 1's last room",  r146 && r146.notes.length === 1 && /TAXI/.test(r146.notes[0].text) && !/Σελίδα|Πελάτης|Kernos|departroom|Station/.test(r146.guestExtra + r146.notes.map(n => n.text).join("")));
ck("08/09: page 2's group, row and note are read, and the totals from page 2", q.groups[4].time === "10:40" && q.groups[4].rows[0].room === "67" && q.groups[4].rows[0].req === "SPMV" && q.groups[4].rows[0].notes[0].text === "SINGLE USE" && q.totals.map(x => x.label + "=" + x.value).join(" ") === "Ατόμων=56 Child=2 Δωματίων=29 Extra Bed=0 Baby Cot=2");
ck("08/09: the header is read once — page 1's number, the hotel, the date",  q.page === "1" && q.hotel === "Kernos Hotel, GR-70007 Malia" && q.printed === "Τρίτη, 8 Σεπτέμβριος 2026 03:31" && q.listDate === "08/09/26" && q.station === "220679");
const html2 = new Function("p", "fname", "$", "t", SHEET + "\nreturn buildDepSheet(p, fname);")(q, "d9832265-0809.oxps", () => ({}), t);
ck("08/09: the sheet carries every room, 427-2 as printed, nine dashes, no name and no fragment", /class="dlRoom">427-2</.test(html2) && /class="dlRoom">319-1</.test(html2) && /class="dlRoom">270</.test(html2) && (html2.match(/class="dlOut">—</g) || []).length === 9 && !/TYA|KOV|MAL|MU\/HO|TUR|MOR|GAR|BOR|KAL|KAR|SCH|MAR|Αφ\.Ατόμου/.test(html2) && /04\/09\/26/.test(html2) && /246,00/.test(html2) && !/Σελίδα : <b>/.test(html2));

/* ---- THE EXACT PRINT (1.17.59): protel's page as it is, the names cut out ----
   His ask, 08/09: "everything ... an exact protel document print with the sole exclusion
   of the names". What it holds the line on: the parser says WHICH glyph runs it withheld
   (page, run, character range) and where each row's dash goes — on the room's baseline,
   not on the clipped fragment's above it; a font part is un-obfuscated by its GUID; a
   glyph's implicit advance comes from the font's own hmtx; the SVG carries every run but
   the withheld characters, protel's rectangles, a clip id unique per page (page 2 was
   blank where its clips resolved to page 1's), and a dash per row; nothing withheld
   survives in the drawing. */
const X = new Function("xmls", "fonts", PARSE + `
const p = parseDepList(xmls);
return {p, ex: buildDepExact(p, {pages: xmls, fonts: fonts || {}}, false), parseGlyphIndices, xpsDeobfuscate, ttfMetrics, xpsPageSvg, pageTokens};`);
{
  const {p, ex, parseGlyphIndices, xpsDeobfuscate, ttfMetrics, xpsPageSvg, pageTokens} = X([PAGE1, PAGE2], {});
  const rows = [].concat(...p.groups.map(g => g.rows));
  ck("exact: twelve withheld tokens — nine guest cells, the two clipped fragments, protel's label in the band", p.withheld.length === 12 && p.withheld.filter(w => w.t === "TYA" || w.t === "A" || w.t === "Αφ.Ατόμου").length === 3 && p.unplaced.length === 0);
  ck("exact: every withheld token names its page, run and characters",  p.withheld.every(w => w.pg >= 0 && w.el >= 0 && w.i1 > w.i0) && p.withheld.some(w => w.pg === 1));
  ck("exact: one dash per row, on the ROOM's baseline — 270's under 263.36 not the fragment's 259.68, 9015's under 404.64", p.dashes.length === rows.length && p.dashes.find(d => Math.abs(d.y - 263.36) < 0.01 && d.x === 232) && p.dashes.find(d => Math.abs(d.y - 404.64) < 0.01) && !p.dashes.find(d => Math.abs(d.y - 259.68) < 0.01));
  const html = ex.html;
  ck("exact: two pages drawn, every character the parser withheld cut, nothing unknown", ex.pages === 2 && ex.cut === p.withheld.reduce((n, w) => n + w.i1 - w.i0, 0) && ex.unknown.length === 0 && ex.unplaced === 0);
  ck("exact: no name, no fragment, on either page",                    NAMES.every(n => html.indexOf(n) < 0) && html.indexOf("Αφ.Ατόμου") < 0);
  ck("exact: everything else is there — 427-2, Σελίδα, departroom1time 2, the Σύνολο labels, the totals", /427-2/.test(html) && /Σελίδα :/.test(html) && /departroom1time 2/.test(html) && /Σύνολο Ατόμων :/.test(html) && /Σύνολο Δωματίων :/.test(html) && />29</.test(html) && /Kernos Hotel, GR-70007 Malia/.test(html) && /1 Y.O. COT/.test(html) && /Πελάτης/.test(html));
  ck("exact: nine dashes",                                              (html.match(/>—</g) || []).length === 9);
  ck("exact: the page number of page 2 is on page 2",                    /<text[^>]*>2<\/text>/.test(html.split('class="xpsPage"')[2] || ""));
  /* a rectangle and a clipped run, on both pages: the fill is protel's, the clip ids differ */
  const P = "<FixedPage Width=\"1122.56\" Height=\"793.76\">" + '<Path Data="F1 M 24,174.4 L 1098.56,174.4 1098.56,190.4 24,190.4 z" Fill="#ffc0c0c0" />';
  const withClip = pg => P + pg.replace("<FixedPage>", "").replace('OriginX="424" OriginY="49"', 'OriginX="424" OriginY="49" Clip="M 424,40 L 700,40 700,52 424,52 z"');
  const r2 = X([withClip(PAGE1), withClip(PAGE2)], {}).ex;
  ck("exact: protel's rectangle is drawn with its own grey",             /<path d="M 24,174.4 L 1098.56,174.4 1098.56,190.4 24,190.4 z" fill-rule="nonzero" fill="#c0c0c0"\/>/.test(r2.html));
  ck("exact: a clip id is unique to its page",                           /id="xp0c1"/.test(r2.html) && /id="xp1c1"/.test(r2.html) && /clip-path="url\(#xp1c1\)"/.test(r2.html));
  ck("exact: the viewBox is the page",                                    /viewBox="0 0 1122.56 793.76"/.test(r2.html));
  ck("exact: a run with children is reported and NOT counted — the next run keeps its ordinal", (r => r.unknown.join() === "Glyphs with children,Glyphs.Fill" && /x="5"/.test(r.svg) && />y</.test(r.svg) && !/>x</.test(r.svg))(xpsPageSvg('<FixedPage Width="10" Height="10"><Glyphs OriginX="1" OriginY="2" UnicodeString="x"><Glyphs.Fill/></Glyphs><Glyphs OriginX="5" OriginY="2" UnicodeString="y" /></FixedPage>', {withheld: {0: [[0, 1]]}})));
  /* the ordinal the renderer gives a run IS the one pageTokens gives it, property elements included */
  ck("exact: the renderer and the tokenizer number the runs alike",        (x => { const t = pageTokens(x); const s = xpsPageSvg(x, {withheld: {[t.find(k => k.t === "y").el]: [[0, 1]]}}).svg; return t.find(k => k.t === "y").el === 2 && !/>y</.test(s) && />z</.test(s); })('<FixedPage Width="10" Height="10"><Glyphs OriginX="1" OriginY="2" UnicodeString="x" /><Glyphs.Fill/><Glyphs OriginX="5" OriginY="2" UnicodeString="y" /><Glyphs OriginX="8" OriginY="2" UnicodeString="z" /></FixedPage>'));
  ck("exact: a run with glyph indices and no text is reported",           xpsPageSvg('<FixedPage Width="10" Height="10"><Glyphs OriginX="1" OriginY="2" UnicodeString="" Indices="7" /></FixedPage>', {}).unknown.join() === "Glyphs without text");
  ck("exact: an element the renderer does not know is reported, not dropped in silence", X(["<FixedPage Width=\"10\" Height=\"10\"><Canvas><Glyphs OriginX=\"1\" OriginY=\"2\" UnicodeString=\"x\" /></Canvas></FixedPage>"], {}).ex.unknown.join() === "Canvas");
  /* the font part: XOR of the first 32 bytes by the GUID's bytes reversed */
  const key = [0xE1,0x77,0xC1,0xA0,0xE1,0x46,0x11,0x95,0x48,0x45,0xC7,0x14,0x55,0xBE,0xAD,0x77];
  const scr = new Uint8Array(40); for(let i = 0; i < 32; i++) scr[i] = key[i % 16] ^ (i < 4 ? [0,1,0,0][i] : 0x5A); scr[39] = 7;
  const un = xpsDeobfuscate("Documents/1/Resources/Fonts/77ADBE55-14C7-4548-9511-46E1A0C177E1.odttf", scr);
  ck("exact: the font part is unscrambled by its GUID, bytes reversed — a TrueType header appears", un[0] === 0 && un[1] === 1 && un[2] === 0 && un[3] === 0 && un[4] === 0x5A && un[31] === 0x5A && un[39] === 7 && scr[0] !== un[0]);
  ck("exact: a part not named by a GUID is left alone",                  xpsDeobfuscate("x/font.ttf", scr)[0] === scr[0]);
  ck("exact: Indices in full — glyph and advance, either one left to the font", JSON.stringify(parseGlyphIndices("39;72,57;,60;(2:1)5,8", 4)) === JSON.stringify([{gid:39,adv:null},{gid:72,adv:57},{gid:null,adv:60},{gid:5,adv:8}]));
  /* a four-table TrueType: unitsPerEm 2048, three advances, cmap A→1 B→2 */
  const u16 = (b, o, v) => { b[o] = v >> 8; b[o + 1] = v & 255; }, u32 = (b, o, v) => { u16(b, o, v >>> 16); u16(b, o + 2, v & 0xFFFF); };
  const head = new Uint8Array(54); u16(head, 18, 2048);
  const hhea = new Uint8Array(36); u16(hhea, 34, 3);
  const hmtx = new Uint8Array(12); u16(hmtx, 0, 1000); u16(hmtx, 4, 1229); u16(hmtx, 8, 500);
  const cmap = new Uint8Array(44); u16(cmap, 2, 1); u16(cmap, 4, 3); u16(cmap, 6, 1); u32(cmap, 8, 12);
  u16(cmap, 12, 4); u16(cmap, 14, 32); u16(cmap, 18, 4); u16(cmap, 26, 66); u16(cmap, 28, 0xFFFF); u16(cmap, 32, 65); u16(cmap, 34, 0xFFFF); u16(cmap, 36, (1 - 65) & 0xFFFF); u16(cmap, 38, 1);
  const tabs = [["cmap", cmap], ["head", head], ["hhea", hhea], ["hmtx", hmtx]];
  const ttf = new Uint8Array(12 + 16 * tabs.length + tabs.reduce((n, t) => n + t[1].length, 0));
  u32(ttf, 0, 0x00010000); u16(ttf, 4, tabs.length);
  let off = 12 + 16 * tabs.length;
  tabs.forEach(([tag, buf], i) => { const o = 12 + 16 * i; for(let k = 0; k < 4; k++) ttf[o + k] = tag.charCodeAt(k); u32(ttf, o + 8, off); u32(ttf, o + 12, buf.length); ttf.set(buf, off); off += buf.length; });
  const met = ttfMetrics(ttf);
  ck("exact: the font's units, advances and cmap are read",              met && met.upem === 2048 && met.adv.join() === "1000,1229,500" && met.cmap.get(65) === 1 && met.cmap.get(66) === 2);
  ck("exact: garbage is not a font",                                      ttfMetrics(new Uint8Array(3)) === null);
  const fonts = {"Documents/1/Resources/Fonts/F.odttf": {family: "ff", metrics: met}};
  const resolve = uri => "Documents/1/Resources/Fonts/F.odttf";
  const run = ind => xpsPageSvg('<FixedPage Width="100" Height="50"><Glyphs OriginX="10" OriginY="20" FontRenderingEmSize="10" FontUri="../Resources/Fonts/F.odttf" UnicodeString="AB" ' + (ind === null ? "" : 'Indices="' + ind + '" ') + "/></FixedPage>", {fonts, resolve, withheld: {}, dashes: []}).svg;
  ck("exact: an implicit advance is the font's own — B sits 1229/2048 em after A",  /x="10 16.001"/.test(run("1;2")) && /font-family="ff,/.test(run("1;2")));
  ck("exact: an explicit advance wins over the font's",                  /x="10 18"/.test(run("1,80;2")));
  ck("exact: a glyph named by character only goes through the cmap",     /x="10 16.001"/.test(run(null)));
  ck("exact: withheld characters are cut, the rest keep their places",   (s => /x="16.001"/.test(s) && />B</.test(s) && !/>A/.test(s))(xpsPageSvg('<FixedPage Width="100" Height="50"><Glyphs OriginX="10" OriginY="20" FontRenderingEmSize="10" FontUri="f" UnicodeString="AB" Indices="1;2" /></FixedPage>', {fonts, resolve, withheld: {0: [[0, 1]]}, dashes: []}).svg));
  ck("exact: mono paints every glyph black; otherwise protel's fill and its alpha", /fill="#000000"/.test(xpsPageSvg('<FixedPage Width="9" Height="9"><Glyphs OriginX="1" OriginY="2" UnicodeString="x" Fill="#ff000080" /></FixedPage>', {mono: true}).svg) && /fill="#000080"/.test(xpsPageSvg('<FixedPage Width="9" Height="9"><Glyphs OriginX="1" OriginY="2" UnicodeString="x" Fill="#ff000080" /></FixedPage>', {}).svg) && /fill="#000080" fill-opacity="0.502"/.test(xpsPageSvg('<FixedPage Width="9" Height="9"><Glyphs OriginX="1" OriginY="2" UnicodeString="x" Fill="#80000080" /></FixedPage>', {}).svg));
  ck("exact: a token in the guest band on a line the parser could not place is cut too", (r => r.p.unplaced.length === 1 && r.p.unplaced[0].t === "STRAY" && r.ex.html.indexOf("STRAY") < 0 && r.ex.unplaced === 1)(X([PAGE1.replace('<FixedPage>', '<FixedPage Width="1122.56" Height="793.76">').replace(G2(72, 185.28, "ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ"), G2(72, 185.28, "ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ") + G2(240, 179, "STRAY"))], {})));
}

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
