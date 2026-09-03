const fs = require("fs");
const src = fs.readFileSync("app/index.html", "utf8");
const lines = src.split("\n");

// the IIFE that holds renderMoves: script tags at 981 / 1323 / 4938
const iife = lines.slice(1322, 4937).join("\n");

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

for (const fn of ["renderMoves","roomMoves","movesReport"]) {
  const body = bodyOf(fn);
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
