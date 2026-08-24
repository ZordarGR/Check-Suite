/* Self-contained updater logic — no Electron imports, so it is testable in plain
   Node. The app content lives entirely in index.html; updates download only that
   file (~70 KB) from the public repo and swap it in userData, so the 138 MB
   Electron shell never needs re-downloading. A "type":"full" entry in latest.json
   is the escape hatch for the rare shell update (button then opens the release page). */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const MAX_SETUP_TRIES = 3;      // give up re-downloading a vanishing installer after this many attempts

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
    // opts: {userDataDir, packagedDir, pkgVersion, updateUrl, fallbackReleaseUrl, onProgress}
    this.o = opts;
    this.pending = null;
  }
  emit(p){ try{ this.o.onProgress && this.o.onProgress(p); }catch(e){} }
  paths(){
    const d = path.join(this.o.userDataDir, "updates");
    fs.mkdirSync(d, {recursive: true});
    return {
      curHtml:  path.join(d, "current.html"),
      curMeta:  path.join(d, "current.json"),
      pendHtml: path.join(d, "pending.html"),
      pendMeta: path.join(d, "pending.json"),
      setupExe: path.join(d, "pending-setup.exe"),
      setupMeta: path.join(d, "pending-setup.json")
    };
  }
  /* drop a downloaded installer that is no longer newer than what runs */
  cleanupSetup(){
    const P = this.paths();
    const m = this.readJson(P.setupMeta);
    if(m && !vNewer(m.version, this.o.pkgVersion)){
      try{ fs.unlinkSync(P.setupExe); }catch(e){}
      try{ fs.unlinkSync(P.setupMeta); }catch(e){}
    }
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
      this.cleanupSetup();
      const eff = this.effective();
      /* raw.githubusercontent caches the manifest for 5 minutes at each edge, so a
         freshly published version can stay invisible in one region while it is live in
         another. cache:"no-store" only bypasses the local cache, not theirs — a unique
         query string is what actually forces a fresh read. */
      const bust = this.o.updateUrl + (this.o.updateUrl.indexOf("?") < 0 ? "?" : "&") + "_=" + Date.now();
      const r = await fetch(bust, {cache: "no-store"});
      if(!r.ok) return null;
      const latest = await r.json();
      if(!latest || !latest.version) return null;
      if(!vNewer(latest.version, eff.version)) return null;

      /* safeguard: any manifest may declare the minimum engine it needs ("engine").
         If this install's engine is older, take the full-installer path even for a
         light (html) update — a stale engine can never again swallow a tool update
         and strand itself behind a higher version number. */
      const needEngine = latest.engine && vNewer(latest.engine, this.o.pkgVersion);
      if(latest.type === "full" || needEngine){
        const tv = (latest.type === "full") ? latest.version : latest.engine;
        // with a "setup" url we self-download the installer and the arrow click
        // runs it silently; without one we fall back to opening the release page
        if(!latest.setup){
          this.pending = {version: tv, full: true,
                          url: latest.url || this.o.fallbackReleaseUrl};
          return this.pending;
        }
        const P = this.paths();
        const have = this.readJson(P.setupMeta);
        if(!(have && have.version === tv && fs.existsSync(P.setupExe))){
          /* If the installer keeps vanishing between checks — Defender quarantining an
             unsigned 90 MB setup in %APPDATA% is the usual cause — re-fetching it on
             every launch forever helps nobody. Count attempts and, past the limit, hand
             the user the release page instead. The counter is written BEFORE the
             download so a crash mid-transfer still counts. */
          const tries = (have && have.version === tv && +have.tries) || 0;
          if(tries >= MAX_SETUP_TRIES){
            this.pending = {version: tv, full: true, url: latest.url || this.o.fallbackReleaseUrl};
            return this.pending;
          }
          try{ fs.writeFileSync(P.setupMeta, JSON.stringify({version: tv, tries: tries + 1})); }catch(e){}
          const sr = await fetch(latest.setup, {cache: "no-store", redirect: "follow"});
          if(!sr.ok){ this.emit({phase: "failed", version: tv}); return null; }
          let sbuf;
          const total = parseInt(sr.headers.get("content-length") || "0", 10);
          if(sr.body && sr.body.getReader){
            const reader = sr.body.getReader();
            const chunks = [];
            let received = 0, lastPct = -1;
            this.emit({phase: "downloading", version: tv, pct: total ? 0 : null, received: 0, total});
            for(;;){
              const {done, value} = await reader.read();
              if(done) break;
              chunks.push(Buffer.from(value));
              received += value.length;
              const pct = total ? Math.min(99, Math.floor(received / total * 100)) : null;
              if(pct !== lastPct){
                lastPct = pct;
                this.emit({phase: "downloading", version: tv, pct, received, total});
              }
            }
            sbuf = Buffer.concat(chunks);
          }else{
            sbuf = Buffer.from(await sr.arrayBuffer());
          }
          const ssha = crypto.createHash("sha256").update(sbuf).digest("hex");
          if(latest.setupSha256 && ssha.toLowerCase() !== String(latest.setupSha256).toLowerCase()){ this.emit({phase: "failed", version: tv}); return null; }
          if(sbuf.length < 1048576 || sbuf.slice(0, 2).toString("latin1") !== "MZ"){ this.emit({phase: "failed", version: tv}); return null; }
          fs.writeFileSync(P.setupExe + ".tmp", sbuf);
          fs.renameSync(P.setupExe + ".tmp", P.setupExe);
          fs.writeFileSync(P.setupMeta, JSON.stringify({version: tv, sha256: ssha, tries: tries + 1}));
        }
        this.pending = {version: tv, full: true, downloaded: true, setupPath: P.setupExe};
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
