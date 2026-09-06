/* The DEBUG dump of an XPS file — every token of every page with its position — driven
   through the SHIPPED tokenizer and the shipped dump, so what he pastes is what the
   parser will be read from. Two pages, a column gap that splits, an entity, and the
   sort by line then column. */
const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => { const at = src.indexOf("\nfunction " + n + "("); if(at<0) throw new Error(n);
  let d=0,i=src.indexOf("{",at);
  for(let j=i;j<src.length;j++){ if(src[j]==="{")d++; else if(src[j]==="}"){d--; if(!d) return src.slice(at+1,j+1);} } };
const line = re => { const m = src.match(re); if(!m) throw new Error(String(re)); return m[0]; };
const body = [line(/^const SPLIT_GAP = .*$/m), line(/^const DEFAULT_ADV = .*$/m),
  lift("xmlDecode"), lift("parseIndices"), lift("pageTokens"), lift("xpsDump"),
  "return xpsDump(f, xmls);"].join("\n");
const run = (f, xmls) => new Function("f", "xmls", "Math", "Date", "String", "Array", "RegExp", "parseFloat", body)(f, xmls, Math, Date, String, Array, RegExp, parseFloat);

let bad = 0;
const ck = (l, ok) => { if(!ok) bad++; console.log("  " + (ok?"ok  ":"FAIL") + "  " + l); };

/* a glyph run whose advances carry a column gap: "Room" then a 400-unit gap then "101" */
const g = (x, y, s, indices) => `<Glyphs OriginX="${x}" OriginY="${y}" FontRenderingEmSize="10" UnicodeString="${s}"${indices ? ` Indices="${indices}"` : ""} />`;
const page1 = "<FixedPage>" + g(300, 40, "Departure Report for 10/09/26") + g(20, 80, "Room101", ",60;,60;,60;,400;,55;,55;,55") + g(400, 80, "BB &amp; HB") + "</FixedPage>";
const page2 = "<FixedPage>" + g(20, 30, "second page") + "</FixedPage>";
const out = run({name: "dep.oxps", size: 1234, mtimeMs: Date.UTC(2026, 8, 6, 3, 0, 0)}, [page1, page2]);
const lines = out.split("\n");
console.log(out.split("\n").map(l => "    | " + l).join("\n"));
ck("the file is named with its size and time",            /^file: dep\.oxps  1234 bytes  2026-09-06T03:00:00/.test(lines[0]));
ck("the page count is said",                              lines[1] === "pages: 2");
ck("a page header carries its token count",               /^page 1  \(4 tokens\)$/.test(lines[2]));
ck("the title comes first — sorted by line, then column", /^  \(300, 40\)  Departure Report for 10\/09\/26$/.test(lines[3]));
ck("a column gap inside one run splits it into two tokens", /^  \(20, 80\)  Room$/.test(lines[4]) && /^  \(\d+, 80\)  101$/.test(lines[5]));
ck("the split token's x is where the gap ended",          parseInt(lines[5].match(/\((\d+),/)[1]) > 40);
ck("an entity is decoded",                                /^  \(400, 80\)  BB & HB$/.test(lines[6]));
ck("the second page follows",                             /^page 2  \(1 tokens\)$/.test(lines[7]) && /second page$/.test(lines[8]));
console.log(bad ? "\n" + bad + " FAILURES" : "\nall pass");
process.exit(bad ? 1 : 0);
