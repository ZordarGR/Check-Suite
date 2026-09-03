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
const mark = "/* ---------- auto-update (active only inside the desktop app) ---------- */";
if(src.indexOf(mark) < 0) throw new Error("anchor comment moved — fix test/harness.js");
const out = path.join(__dirname, "browser", "h-sweep.html");
fs.writeFileSync(out, src.replace(mark, probe + mark));
console.log("wrote " + out);
