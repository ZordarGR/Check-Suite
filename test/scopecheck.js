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
/* AND IT FAILS THE RUN. This printed "UNDEFINED -> name" and exited 0, so run.sh's
   `|| fail=1` never tripped and the suite still said everything ran. The one guard in the
   repo whose whole reason for existing is that `liveReceipts()` did not exist and the
   movements panel was dark for two versions could not fail. The same shape as taxsweep
   printing PAGE SIDE-SCROLLS and exiting clean. Found by the 1.17.53 second audit.
   renderMovesFor joins the list: it is where the receipts index and the dot are written. */
let scopeBad = 0;
for (const fn of ["renderMoves","roomMoves","movesReport","renderMovesFor"]) {
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
  scopeBad += missing.size;
  console.log(fn.padEnd(12), missing.size ? "UNDEFINED -> " + [...missing].join(", ") : "all calls resolve");
}
if(scopeBad) process.exitCode = 1;

/* ---- every <script> block must actually PARSE ----
   Added after a duplicate `const` in the tax scope — one edit leaving the old
   declarations behind and adding new ones — made that whole block a syntax error. The
   page still loaded, the audit half still worked, and the tax half was simply dead: no
   legacy toggle, no live read, no boot. Nothing here noticed, because every other check
   reads the file as TEXT. new Function() is the cheapest thing that reads it as code. */
{
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0, bad = 0;
  while((m = re.exec(src))){
    n++;
    try{ new Function(m[1]); }
    catch(e){ bad++; console.log("syntax     BLOCK " + n + " DOES NOT PARSE — " + e.message); }
  }
  console.log("syntax     " + n + " script block(s), " + (bad ? bad + " BROKEN" : "all parse"));
  if(bad) process.exitCode = 1;
}

/* ---- I18N.en vs I18N.el ----
   The check below this one only ever matched QUOTED, DOTTED keys ("menu.audit":), which
   is the shape T uses. I18N's keys are bare identifiers (live_read:), so every one of
   them — the whole second language table — was invisible to the very guard that exists
   because keys had drifted into one language before. Found while adding two.

   This walks the literal instead of matching lines: strings are skipped whole, so a
   value like "protel said: " cannot be mistaken for a key, and only depth-0 names
   inside each table count. */
function litKeys(body){
  const out = new Set();
  let i = 0, depth = 0;
  while(i < body.length){
    const c = body[i];
    if(c === '"' || c === "'" || c === '`'){
      const q = c; let j = i + 1, buf = "";
      while(j < body.length && body[j] !== q){ if(body[j] === "\\") j++; buf += body[j]; j++; }
      let k = j + 1; while(k < body.length && /\s/.test(body[k])) k++;
      if(depth === 0 && body[k] === ":") out.add(buf);
      i = j + 1; continue;
    }
    if(c === "{" || c === "[" || c === "("){ depth++; i++; continue; }
    if(c === "}" || c === "]" || c === ")"){ depth--; i++; continue; }
    if(depth === 0 && /[A-Za-z_$]/.test(c)){
      let j = i; while(j < body.length && /[A-Za-z0-9_$]/.test(body[j])) j++;
      let k = j; while(k < body.length && /\s/.test(body[k])) k++;
      if(body[k] === ":") out.add(body.slice(i, j));
      i = j; continue;
    }
    i++;
  }
  return out;
}
function tableBody(text, header){        // the text between that table's own braces
  const at = text.indexOf(header);
  if(at < 0) return null;
  const open = text.indexOf("{", at);
  let d = 0;
  for(let j = open; j < text.length; j++){
    if(text[j] === "{") d++;
    else if(text[j] === "}"){ d--; if(!d) return text.slice(open + 1, j); }
  }
  return null;
}
{
  const bEn = tableBody(src, "\n en:{"), bEl = tableBody(src, "\n el:{");
  if(!bEn || !bEl){ console.log("i18n(I18N) could not find en/el — fix test/scopecheck.js"); process.exitCode = 1; }
  else {
    const en = litKeys(bEn), el = litKeys(bEl);
    const onlyEl = [...el].filter(k => !en.has(k)), onlyEn = [...en].filter(k => !el.has(k));
    console.log("i18n(I18N) " + (onlyEl.length + onlyEn.length === 0
      ? "both tables hold the same " + en.size + " keys"
      : "MISMATCH — only in greek: [" + onlyEl + "]  only in english: [" + onlyEn + "]"));
    if(onlyEl.length + onlyEn.length) process.exitCode = 1;
  }
}

/* ---- the two language tables must hold the same keys ----
   A key present in one and not the other renders as the key itself for anyone using the
   other language, and nothing in the page complains. Four had drifted into Greek-only
   before an audit noticed.

   THIS USED THE REGEX /"([A-Za-z0-9_]+\.[A-Za-z0-9_]+)"\s*:/ over a window of lines —
   quoted keys with EXACTLY ONE dot. So T's seven bare-identifier keys (subTag, welcome,
   menu1…) and its three two-dot keys (mv.h.arr, mv.h.dep, mv.h.move — the ARRIVALS /
   DEPARTURES / MOVES headings over the pills he reads every night) were invisible to the
   guard, in both languages. The SAME fault this file already records for I18N, in the
   check that comment sits above. It walks the literal now, like that one. */
{
  const bEn = tableBody(src, "\nen: {"), bGr = tableBody(src, "\ngr: {");
  if(!bEn || !bGr){ console.log("i18n       could not find en/gr — fix test/scopecheck.js"); process.exitCode = 1; }
  else {
    const en = litKeys(bEn), gr = litKeys(bGr);
    const onlyG = [...gr].filter(k => !en.has(k)), onlyE = [...en].filter(k => !gr.has(k));
    console.log("i18n       " + (onlyG.length + onlyE.length === 0
      ? "both tables hold the same " + en.size + " keys"
      : "MISMATCH — only in greek: [" + onlyG + "]  only in english: [" + onlyE + "]"));
    if(onlyG.length + onlyE.length) process.exitCode = 1;
  }
}
