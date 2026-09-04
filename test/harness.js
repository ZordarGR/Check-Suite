/* Builds test/browser/h-sweep.html: the real app/index.html with one line added that
   exports the dialog openers and a few setters, so a browser harness can drive the
   SHIPPED code instead of a copy of it. Regenerate after every change to index.html. */
const fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "app", "index.html"), "utf8");
const probe = `
try{ window.__t = { openModal:openModal, closeModal:closeModal,
  openDebug:openDebug, openShortcuts:openShortcuts, openProfiles:openProfiles,
  openOverlaySettings:openOverlaySettings, showLivePrompt:showLivePrompt,
  openCorrectionModal:openCorrectionModal, openRoomModal:openRoomModal,
  openExtraModal:openExtraModal, printCorrections:printCorrections,
  openWatchChangePrompt:openWatchChangePrompt, closeDrawer:closeDrawer,
  showScreen:showScreen, setDebug:setDebug,
  setModel:function(m){MODEL=m;}, setState:function(x){STATE=x;},
  setWatch:function(w){WATCH=w;}, FB:function(){return FB;},
  buildPrintSheet:function(){return buildPrintSheet();},
  setStateKey:function(k){stateKey=k;}, rKey:function(r){return rKey(r);} }; }catch(e){}
`;
/* The tax half is its own <script> and shares nothing with the app half, so a probe in
   one cannot reach the other. This second one exposes the few tax-scope values a harness
   has to be able to set — PAIR_OVERRIDE above all, because the guard that stops the
   five-second automatic read from throwing away his pairing decision cannot be checked
   from outside that scope. */
const taxProbe = `
try{ window.__tx = { setPair:function(v){ PAIR_OVERRIDE = v; },
                     getPair:function(){ return PAIR_OVERRIDE; },
                     read:function(auto){ return readInhouseLive(auto); },
                     sig:function(){ return LIVE_SIG; } }; }catch(e){}
`;
const taxMark = "/* ============ boot ============ */";
if(src.indexOf(taxMark) < 0) throw new Error("tax boot anchor moved — fix test/harness.js");
const mark = "/* ---------- auto-update (active only inside the desktop app) ---------- */";
if(src.indexOf(mark) < 0) throw new Error("anchor comment moved — fix test/harness.js");
const out = path.join(__dirname, "browser", "h-sweep.html");
fs.writeFileSync(out, src.replace(mark, probe + mark).replace(taxMark, taxProbe + taxMark));
console.log("wrote " + out);
