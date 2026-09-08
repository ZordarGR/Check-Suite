/* His 08/09/26 departure list, two pages, at the file's exact positions — the names
   replaced. Shared by test/reports.js (the parser and the exact print) and
   test/browser/exact.js (the print through Chromium). See test/reports.js for what
   each row is there to hold the line on. */
const G2 = (x, y, s) => `<Glyphs OriginX="${x}" OriginY="${y}" FontRenderingEmSize="10.7196" UnicodeString="${s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" />`;
const head2 = pg => [
  G2(256, 41, " Ημερομηνία Εκτύπωσης"), G2(424, 49, "Kernos Hotel, GR-70007 Malia"), G2(800, 49, "Σελίδα :"), G2(866, 49, String(pg)),
  G2(232, 64.5, "Τρίτη, 8 Σεπτέμβριος 2026"), G2(384, 64.5, "03:31"),
  G2(784, 89, "departroom1time 2"), G2(240, 95, "PROTEL HMS"), G2(352, 95, "8/9/2026"), G2(523, 95, "Departure List by Time"), G2(784, 105, "Station 220679"),
  G2(312, 140, "  Ημερομηνία Αναχώρησης :"), G2(512, 140, "08/09/26"),
  G2(64, 161, "Δωμάτιο"), G2(136, 161, "Ποσ"), G2(168, 161, "Ζήτηση"), G2(224, 161, "Πελάτης"), G2(448, 161, "Άφιξη"), G2(511.2, 161, "ΑΤ."), G2(542.88, 161, "Eb"),
  G2(560, 161, "Chil"), G2(598.56, 161, "Bc"), G2(624, 161, "Τιμοκατάλογος"), G2(801.28, 161, "Όροι"), G2(848, 161, "Συμφωνία"), G2(936, 161, "Vip Code"),
  G2(136, 173.28, "."), G2(560, 173.28, "d.")].join("");
const row2 = (y, rx, room, type, name, arr, ad, bc, rate, board, price, req, dy, qty) =>
  [G2(rx, y, room), G2(88, y, type), req ? G2(176, y, req) : "", G2(232, y, name), G2(624, y, rate), board ? G2(808.48, y, board) : "",
   G2(146.08, y + (dy || 0), qty === undefined ? "1" : qty), G2(444.96, y + (dy || 0), arr), G2(522.08, y + (dy || 0), ad), G2(551, y + (dy || 0), "0"), G2(578.08, y + (dy || 0), "0"), G2(602, y + (dy || 0), bc), G2(859.52, y + (dy || 0), price)].join("");
const PAGE1 = "<FixedPage>" + head2(1) + [
  G2(72, 185.28, "ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ"), G2(201, 185.28, "  :"),
  row2(247.36, 65.6, "253", "SPMV", "MU/HO", "02/09/26", "2", "0", "SNTOR", "HB", "205,70"),
  G2(232, 259.68, "TYA"),                                                              /* the clipped second line of 253's name */
  row2(263.36, 65.6, "270", "SPSV", "KOV/MAL", "04/09/26", "2", "0", "SNAR", "HB", "246,00", "", 0.64),
  row2(388.64, 71.52, "83", "BGV", "KOS/SAN", "01/09/26", "3", "0", "SNAR", "HB", "242,25"),
  G2(232, 400.96, "A"),
  row2(404.64, 59.68, "9015", "ACC", "MAR", "07/09/26", "0", "0", "rack", "HB", "0,00", "", 0.64, "0") + G2(368, 404.64, "Αφ.Ατόμου"),
  G2(72, 485.28, "ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ"), G2(201, 485.28, "03:30"),
  row2(499.36, 56, "427-2", "BSV", "TUR", "01/09/26", "2", "1", "rack", "HB", "0,00", "BGV"),
  G2(152, 514.4, "01/09/26"), G2(200, 514.4, "1 Y.O. COT"),
  G2(72, 546.72, "ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ"), G2(201, 546.72, "07:10"),
  row2(560.64, 56, "319-1", "SPFA", "MOR", "02/09/26", "2", "0", "SNAR", "HB", "228,00", "BGV"),
  row2(606.08, 56, "404-5", "BGV", "GAR/BOR", "29/08/26", "2", "0", "SNAR", "", "193,80"),
  G2(72, 718.72, "ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ"), G2(201, 718.72, "08:40"),
  row2(732.64, 65.6, "146", "SPSV", "KAL/KAR", "25/08/26", "2", "0", "SNAR", "HB", "246,00"),
  G2(152, 747.68, "01/01/00"), G2(200, 747.68, "EXEI KLEISEI TAXI"),
].join("") + "</FixedPage>";
const PAGE2 = "<FixedPage>" + head2(2) + [
  G2(72, 185.28, "ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ"), G2(201, 185.28, "10:40"),
  row2(199.36, 71.52, "67", "BGV", "SCH", "03/09/26", "1", "0", "SNAR", "HB", "208,00", "SPMV"),
  G2(152, 214.4, "03/09/26"), G2(200, 214.4, "SINGLE USE"),
  G2(512, 585, " Σύνολο Ατόμων :"), G2(702, 585, "56"), G2(792, 585, " Σύνολο Child  :"), G2(969, 585, "2"),
  G2(224, 601, " Σύνολο Δωματίων :"), G2(412, 601, "29"),
  G2(512, 609, " Σύνολο Extra Bed  :"), G2(709, 609, "0"), G2(792, 609, " Σύνολο Baby Cot :"), G2(973, 609, "2"),
].join("") + "</FixedPage>";
/* every replacement name and fragment the fixture carries — none may reach a sheet */
const NAMES = ["MU/HO", "TYA", "KOV/MAL", "KOS/SAN", "MAR", "TUR", "MOR", "GAR/BOR", "KAL/KAR", "SCH"];
module.exports = {G2, head2, row2, PAGE1, PAGE2, NAMES};
