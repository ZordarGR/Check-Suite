#!/usr/bin/env bash
# Cloud only. Rebuild from the last verified installer’s Electron payload, then unpack and compare.
set -euo pipefail
version=1.17.71
work="$(mktemp -d)"
repo="$PWD"
cat dist-win64/parts/RecCheck-Setup.exe.[0-9]* > "$work/previous.exe"
oldsha="$(node -p 'require("./update/latest.json").setupSha256')"
printf '%s  %s\n' "$oldsha" "$work/previous.exe" | sha256sum -c -
7z x -y "-o$work/stage" "$work/previous.exe" >/dev/null
rm -rf -- "$work/stage/\$PLUGINSDIR"
node <<'NODE'
const fs=require("fs"),crypto=require("crypto");
const v="1.17.71",p=JSON.parse(fs.readFileSync("app/package.json"));p.version=v;
fs.writeFileSync("app/package.json",JSON.stringify(p,null,2)+"\n");
const html=fs.readFileSync("app/index.html","utf8").replace(/APP_VERSION\s*=\s*"1\.17\.70"/,'APP_VERSION = "'+v+'"');
if(!html.includes('APP_VERSION = "'+v+'"'))throw Error("version not replaced");
fs.writeFileSync("app/index.html",html);fs.writeFileSync("Departments Check.html",html);
fs.writeFileSync("dist-win64/nsi/reccheck.nsi",fs.readFileSync("dist-win64/nsi/reccheck.nsi","utf8").replace('!define VERSION "1.17.70"','!define VERSION "'+v+'"'));
NODE
# The helper is unchanged; preserve the verified v31 binary from the previous release.
mkdir "$work/pack"
files=(files.js index.html main.js overlay.html overlay-preload.js package.json preload.js tray.ico updater.js arrangement.js arrangement-live.js arrangement-preload.js arrangement.html arrangement-view.js)
for f in "${files[@]}"; do cp "app/$f" "$work/pack/$f"; done
npx asar pack "$work/pack" "$work/stage/resources/app.asar"
cp app/rc-tbind.exe "$work/stage/resources/rc-tbind.exe"
(cd dist-win64/nsi && makensis "-DSTAGE=$work/stage" "-DVERSION=$version" "-DICON=$repo/app/reccheck.ico" "-DOUTFILE=$work/Pro-Check-Setup.exe" reccheck.nsi)
7z x -y "-o$work/verify" "$work/Pro-Check-Setup.exe" >/dev/null
npx asar extract "$work/verify/resources/app.asar" "$work/verify-app"
for f in "${files[@]}"; do cmp "app/$f" "$work/verify-app/$f"; done
cmp app/rc-tbind.exe "$work/verify/resources/rc-tbind.exe"
test "$(find "$work/verify-app" -type f | wc -l)" -eq "${#files[@]}"
test "$(node -p "require('$work/verify-app/package.json').version")" = "$version"
# The source-controlled parts are replaced only after the packed payload verifies.
rm -f dist-win64/parts/RecCheck-Setup.exe.[0-9]*
split -b 20971520 -d -a 3 "$work/Pro-Check-Setup.exe" dist-win64/parts/RecCheck-Setup.exe.
node - "$work/Pro-Check-Setup.exe" <<'NODE'
const fs=require("fs"),crypto=require("crypto"),sha=f=>crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const v="1.17.71",m=JSON.parse(fs.readFileSync("update/latest.json"));
Object.assign(m,{version:v,engine:v,type:"full",sha256:sha("app/index.html"),setupSha256:sha(process.argv[2]),
setup:"https://github.com/ZordarGR/Check-Suite/releases/download/v"+v+"/Pro-Check-Setup.exe",
notes:"Fix the live accommodation checker discarding daily prices for room identifiers with numeric suffixes, such as 101-2. The full room identifier and original stay dates are preserved."});
fs.writeFileSync("update/latest.json",JSON.stringify(m,null,2)+"\n");
const w=fs.readFileSync(".github/workflows/release.yml","utf8").replace(/VERSION: v[\d.]+/,"VERSION: v"+v).replace(/SETUP_SHA256: [a-f0-9]+/,"SETUP_SHA256: "+m.setupSha256);
fs.writeFileSync(".github/workflows/release.yml",w);
console.log("SETUP_SHA256="+m.setupSha256);
NODE
node test/release.js
node test/arrangement.js
cp "$work/Pro-Check-Setup.exe" Pro-Check-Setup.exe
echo "Installer unpacked, all 14 app files and helper match; release invariants pass."
