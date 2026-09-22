#!/usr/bin/env bash
# Cloud only. Reuse the verified Electron runtime, replace app files, unpack and compare.
set -euo pipefail
version="${RELEASE_VERSION:?Set RELEASE_VERSION to the reviewed release number}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
scratch="$(mktemp -d)"
repo="$PWD"
cat dist-win64/parts/RecCheck-Setup.exe.[0-9]* > "$scratch/previous.exe"
oldsha="$(node -p 'require("./update/latest.json").setupSha256')"
printf '%s  %s\n' "$oldsha" "$scratch/previous.exe" | sha256sum -c -
7z x -y "-o$scratch/stage" "$scratch/previous.exe" >/dev/null
rm -rf -- "$scratch/stage/\$PLUGINSDIR"
node <<'NODE'
const fs=require('fs'),v=process.env.RELEASE_VERSION;
const p=JSON.parse(fs.readFileSync('app/package.json'));p.version=v;
fs.writeFileSync('app/package.json',JSON.stringify(p,null,2)+'\n');
const html=fs.readFileSync('app/index.html','utf8').replace(/APP_VERSION\s*=\s*"[\d.]+"/,'APP_VERSION = "'+v+'"');
if(!html.includes('APP_VERSION = "'+v+'"'))throw Error('Page version not replaced');
fs.writeFileSync('app/index.html',html);fs.writeFileSync('Departments Check.html',html);
const nsi=fs.readFileSync('dist-win64/nsi/reccheck.nsi','utf8').replace(/!define VERSION "[\d.]+"/,'!define VERSION "'+v+'"');
fs.writeFileSync('dist-win64/nsi/reccheck.nsi',nsi);
NODE
sh app/build-helper.sh
mkdir "$scratch/pack"
files=(files.js index.html main.js overlay.html overlay-preload.js package.json preload.js tray.ico updater.js arrangement.js arrangement-live.js arrangement-preload.js arrangement.html arrangement-view.js)
for f in "${files[@]}"; do cp "app/$f" "$scratch/pack/$f"; done
npx --no-install asar pack "$scratch/pack" "$scratch/stage/resources/app.asar"
cp app/rc-tbind.exe "$scratch/stage/resources/rc-tbind.exe"
(cd dist-win64/nsi && makensis "-DSTAGE=$scratch/stage" "-DVERSION=$version" "-DICON=$repo/app/reccheck.ico" "-DOUTFILE=$scratch/Pro-Check-Setup.exe" reccheck.nsi)
7z x -y "-o$scratch/verify" "$scratch/Pro-Check-Setup.exe" >/dev/null
npx --no-install asar extract "$scratch/verify/resources/app.asar" "$scratch/verify-app"
for f in "${files[@]}"; do cmp "app/$f" "$scratch/verify-app/$f"; done
cmp app/rc-tbind.exe "$scratch/verify/resources/rc-tbind.exe"
test "$(find "$scratch/verify-app" -type f | wc -l)" -eq "${#files[@]}"
test "$(node -p "require('$scratch/verify-app/package.json').version")" = "$version"
# Only the throwaway cloud checkout's prior installer parts are replaced.
rm -f dist-win64/parts/RecCheck-Setup.exe.[0-9]*
split -b 20971520 -d -a 3 "$scratch/Pro-Check-Setup.exe" dist-win64/parts/RecCheck-Setup.exe.
node - "$scratch/Pro-Check-Setup.exe" <<'NODE'
const fs=require('fs'),crypto=require('crypto'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const v=process.env.RELEASE_VERSION,m=JSON.parse(fs.readFileSync('update/latest.json'));
Object.assign(m,{version:v,engine:v,type:'full',sha256:sha('app/index.html'),setupSha256:sha(process.argv[2]),
setup:'https://github.com/ZordarGR/Check-Suite/releases/download/v'+v+'/Pro-Check-Setup.exe',
notes:'Preserve room and stay evidence across filtered lists, moves and incomplete captures. Keep changed receipts and conflicting tax snapshots under review. Harden backup reports, imports, saved data, configuration and update recovery.'});
fs.writeFileSync('update/latest.json',JSON.stringify(m,null,2)+'\n');
console.log('PACKAGE_EVIDENCE '+JSON.stringify({version:v,sha256:m.setupSha256,size:fs.statSync(process.argv[2]).size,appFiles:14,helper:'v35'}));
NODE
node test/release.js
cp "$scratch/Pro-Check-Setup.exe" Pro-Check-Setup.exe
echo 'Installer unpacked; all 14 app files and helper match the reviewed source.'
