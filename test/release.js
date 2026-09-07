/* THE RELEASE INVARIANTS, checked where they can actually fire.

   The workflow refuses to publish when the two copies of the page differ — but it only
   runs on a push touching `dist-win64/parts/**` or the workflow file. An HTML release
   touches neither, and an html release is the one that ships the page. So the guard that
   exists to stop the two copies drifting has never once run for the releases most likely
   to drift them. It runs here instead, on every `sh test/run.sh`.

   And the engine bookkeeping: app/package.json is the ENGINE's version — main.js reads it
   as PKG_VERSION and updater.js compares it against the manifest's `engine` to decide
   whether an install must take the full path. Every html release before 1.17.53 left it at
   the engine version; 1.17.53 bumped it by mistake and the audit caught it. Pinned now. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const root = path.resolve(__dirname, "..");
const R = f => fs.readFileSync(path.join(root, f));
const sha = b => crypto.createHash("sha256").update(b).digest("hex");

let bad = 0;
const ck = (l, ok, extra) => { if(!ok) bad++; console.log("  " + (ok ? "ok  " : "FAIL") + "  " + l + (ok || extra === undefined ? "" : "   → " + extra)); };

const page = R("app/index.html"), copy = R("Departments Check.html");
const man = JSON.parse(R("update/latest.json").toString("utf8"));
const pkg = JSON.parse(R("app/package.json").toString("utf8"));
const appVer = (page.toString("utf8").match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];

ck("the two copies of the page are byte-identical", page.equals(copy),
   "app/index.html " + page.length + " bytes, 'Departments Check.html' " + copy.length);
ck("APP_VERSION in the page matches the manifest's version", appVer === man.version,
   "page " + appVer + ", manifest " + man.version);
ck("the manifest's html sha256 is the sha256 of the shipped page", man.sha256 === sha(copy),
   "manifest " + man.sha256 + ", page " + sha(copy));
ck("package.json is the ENGINE's version, not the page's", pkg.version === man.engine,
   "package.json " + pkg.version + ", engine " + man.engine);
ck("the installer the manifest points at is the engine's", String(man.setup).indexOf("/v" + man.engine + "/") >= 0,
   man.setup);
ck("an html release never claims to be a full one", man.type !== "html" || man.version !== man.engine,
   "type " + man.type + ", version " + man.version + ", engine " + man.engine);

/* only when this tree actually carries an installer for the manifest it publishes */
if(man.type === "full"){
  const dir = path.join(root, "dist-win64", "parts");
  const parts = fs.readdirSync(dir).filter(f => /^RecCheck-Setup\.exe\.\d+$/.test(f)).sort();
  ck("the parts are there", parts.length > 0, String(parts.length));
  if(parts.length){
    const all = Buffer.concat(parts.map(f => fs.readFileSync(path.join(dir, f))));
    ck("the parts reassemble to the manifest's setupSha256", sha(all) === man.setupSha256,
       "parts " + sha(all) + ", manifest " + man.setupSha256);
  }
} else {
  console.log("  --    type is \"" + man.type + "\": the parts are last release's and are not re-checked here");
}

console.log(bad ? "\n" + bad + " FAILED" : "\nall pass");
process.exit(bad ? 1 : 0);
