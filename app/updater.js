/* Self-contained updater logic — no Electron imports, so it is testable in plain
   Node. The app content lives entirely in index.html; updates download only that
   file (~70 KB) from the public repo and swap it in userData, so the 138 MB
   Electron shell never needs re-downloading. A "type":"full" entry in latest.json
   is the escape hatch for the rare shell update (button then opens the release page). */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");

function vParse(v){ return String(v).trim().replace(/^v/i, "").split(".").map(n => parseInt(n, 10) || 0); }
function vNewer(a, b){          // true when a > b
  const A = vParse(a), B = vParse(b);
  for(let i = 0; i < Math.max(A.length, B.length); i++){
    const x = A[i] || 0, y = B[i] || 0;
    if(x !== y) return x > y;
  }
  return false;
}

class Updater {
  constructor(opts){
    // opts: {userDataDir, packagedDir, pkgVersion, updateUrl, fallbackReleaseUrl}
    this.o = opts;
    this.pending = null;
  }
  paths(){
    const d = path.join(this.o.userDataDir, "updates");
    fs.mkdirSync(d, {recursive: true});
    return {
      curHtml:  path.join(d, "current.html"),
      curMeta:  path.join(d, "current.json"),
      pendHtml: path.join(d, "pending.html"),
      pendMeta: path.join(d, "pending.json")
    };
  }
  readJson(p){ try{ return JSON.parse(fs.readFileSync(p, "utf8")); }catch(e){ return null; } }

  /* which html/version actually runs: a promoted update if it beats the packaged
     one, else the packaged index.html (also cleans stale leftovers after the user
     installs a newer full package) */
  effective(){
    const P = this.paths();
    const m = this.readJson(P.curMeta);
    if(m && m.version && fs.existsSync(P.curHtml) && vNewer(m.version, this.o.pkgVersion))
      return {version: m.version, file: P.curHtml};
    if(m){
      try{ fs.unlinkSync(P.curHtml); }catch(e){}
      try{ fs.unlinkSync(P.curMeta); }catch(e){}
    }
    return {version: this.o.pkgVersion, file: path.join(this.o.packagedDir, "index.html")};
  }

  /* background check + download; resolves to pending info or null; never throws */
  async check(){
    try{
      const eff = this.effective();
      const r = await fetch(this.o.updateUrl, {cache: "no-store"});
      if(!r.ok) return null;
      const latest = await r.json();
      if(!latest || !latest.version) return null;
      if(!vNewer(latest.version, eff.version)) return null;

      if(latest.type === "full"){
        this.pending = {version: latest.version, full: true,
                        url: latest.url || this.o.fallbackReleaseUrl};
        return this.pending;
      }
      const P = this.paths();
      const have = this.readJson(P.pendMeta);
      if(!(have && have.version === latest.version && fs.existsSync(P.pendHtml))){
        const hr = await fetch(latest.html, {cache: "no-store"});
        if(!hr.ok) return null;
        const buf = Buffer.from(await hr.arrayBuffer());
        const sha = crypto.createHash("sha256").update(buf).digest("hex");
        if(latest.sha256 && sha.toLowerCase() !== String(latest.sha256).toLowerCase()) return null;
        if(buf.length < 10000 || !buf.slice(0, 200).toString("utf8").includes("<!DOCTYPE html")) return null;
        fs.writeFileSync(P.pendHtml + ".tmp", buf);
        fs.renameSync(P.pendHtml + ".tmp", P.pendHtml);
        fs.writeFileSync(P.pendMeta, JSON.stringify({version: latest.version, sha256: sha, notes: latest.notes || ""}));
      }
      this.pending = {version: latest.version};
      return this.pending;
    }catch(e){ return null; }   // offline / bad JSON / fs error — stay silent
  }

  /* apply a downloaded html update; returns true on success */
  promote(){
    if(!this.pending || this.pending.full) return false;
    const P = this.paths();
    const pm = this.readJson(P.pendMeta);
    if(!pm || !fs.existsSync(P.pendHtml)) return false;
    fs.copyFileSync(P.pendHtml, P.curHtml);
    fs.writeFileSync(P.curMeta, JSON.stringify(pm));
    try{ fs.unlinkSync(P.pendHtml); fs.unlinkSync(P.pendMeta); }catch(e){}
    this.pending = null;
    return true;
  }
}
module.exports = {Updater, vNewer};
