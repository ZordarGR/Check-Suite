/* h-sweep.html is a copy of app/index.html. A stale one tests a page that no longer
   exists and passes cheerfully while proving nothing, which happened three times in one
   night before this existed. Every browser harness calls this first. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
module.exports = function freshHarness(){
  const root = path.resolve(__dirname, "..", "..");
  const src = fs.readFileSync(path.join(root, "app", "index.html"), "utf8");
  const want = crypto.createHash("sha256").update(src).digest("hex");
  let head = "";
  try{ head = fs.readFileSync(path.join(__dirname, "h-sweep.html"), "utf8").slice(0, 120); }
  catch(e){ throw new Error("h-sweep.html is missing — run: node test/harness.js"); }
  const m = head.match(/built-from ([0-9a-f]{64})/);
  if(!m) throw new Error("h-sweep.html has no stamp — run: node test/harness.js");
  if(m[1] !== want)
    throw new Error("h-sweep.html is STALE — app/index.html has changed since it was built.\n"
                    + "        run: node test/harness.js");
};
