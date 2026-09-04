const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lines = src.split("\n");

/* The <script> block that holds renderMoves, found by SEARCHING for it rather than by
   line number. It used to be lines.slice(1322, 4937) — hardcoded — and as the page grew
   that window drifted off the declarations, so the check quietly started reporting
   things as undefined that were declared just outside it. A guard that silently stops
   guarding is worse than none. */
const blocks = [];
{ const re = /<script[^>]*>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(src))) blocks.push(m[1]); }
const iife = blocks.find(b => b.indexOf("function renderMoves(") >= 0);
if (!iife) { console.log("scopecheck could not find the block holding renderMoves"); process.exit(1); }

// declarations visible in that scope
const decl = new Set();
for (const m of iife.matchAll(/\b(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) decl.add(m[1]);
// arrow / function-expression consts already covered by const NAME

// the function under test
function bodyOf(name){
  const at = iife.indexOf("\nfunction " + name + "(");
  if (at < 0) throw new Error("no " + name);
  let i = iife.indexOf("{", at), d = 0;
  for (let j = i; j < iife.length; j++){
    if (iife[j] === "{") d++;
    else if (iife[j] === "}") { d--; if (!d) return iife.slice(i, j + 1); }
  }
}

const GLOBALS = new Set(["Object","String","Number","Array","Set","Map","JSON","Math","Date",
  "parseInt","parseFloat","isNaN","document","window","localStorage","console","el","$",
  "if","for","while","switch","catch","return","typeof","new","function","of","in"]);

/* Comments are prose, and prose contains things that look like calls — "at all (65, 94,
   124, 129 among them)" in one of roomMoves' own comments was reported as an undefined
   function `all`. A checker that cries wolf over its own commentary gets ignored, which
   is the one thing this must not be. */
function stripComments(js){
  return js.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}
for (const fn of ["renderMoves","roomMoves","movesReport"]) {
  const body = stripComments(bodyOf(fn));
  const missing = new Set();
  for (const m of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const id = m[1];
    if (GLOBALS.has(id) || decl.has(id)) continue;
    // methods:  .foo(  — skip
    const at = m.index;
    if (body[at - 1] === "." ) continue;
    missing.add(id);
  }
  console.log(fn.padEnd(12), missing.size ? "UNDEFINED -> " + [...missing].join(", ") : "all calls resolve");
}

/* ---- the two language tables must hold the same keys ----
   A key present in one and not the other renders as the key itself for anyone using the
   other language, and nothing in the page complains. Four had drifted into Greek-only
   before an audit noticed. */
const i18nLines = src.split("\n");
const at = [];
i18nLines.forEach((l, i) => { if (/^\s*"menu\.audit"\s*:/.test(l)) at.push(i + 1); });
if (at.length !== 2) { console.log("i18n       could not find both tables — check test/scopecheck.js"); }
else {
  const en = new Set(), gr = new Set();
  i18nLines.forEach((l, i) => {
    const n = i + 1;
    if (n < at[0] - 40 || n > at[1] + 400) return;
    const re = /"([A-Za-z0-9_]+\.[A-Za-z0-9_]+)"\s*:/g; let m;
    while ((m = re.exec(l))) (n < at[1] ? en : gr).add(m[1]);
  });
  const onlyG = [...gr].filter(k => !en.has(k)), onlyE = [...en].filter(k => !gr.has(k));
  console.log("i18n       " + (onlyG.length + onlyE.length === 0
    ? "both tables hold the same " + en.size + " keys"
    : "MISMATCH — only in greek: [" + onlyG + "]  only in english: [" + onlyE + "]"));
  if (onlyG.length + onlyE.length) process.exitCode = 1;
}
