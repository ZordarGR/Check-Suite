/* Reports-folder access — pure Node logic, no Electron imports, testable standalone.
   Each tool has its own directory ("dept" = Department Check, "tax" = Tax Check),
   chosen once, persisted in config.json, watched for changes independently. */
"use strict";
const fs = require("fs"), path = require("path");
const REPORT_RE = /\.(oxps|xps)$/i;
const PROFILES = ["dept", "tax"];

class FileHub {
  constructor(opts){            // {configPath, onDirEvent(profile)}
    this.o = opts;
    this.watchers = {};         // profile -> fs.FSWatcher
    this.debounce = {};         // profile -> timer
  }
  norm(profile){ return profile === "tax" ? "tax" : "dept"; }
  readConfig(){ try{ return JSON.parse(fs.readFileSync(this.o.configPath, "utf8")); }catch(e){ return {}; } }
  writeConfig(c){
    try{
      fs.mkdirSync(path.dirname(this.o.configPath), {recursive: true});
      fs.writeFileSync(this.o.configPath, JSON.stringify(c));
    }catch(e){}
  }
  getDir(profile){
    const p = this.norm(profile);
    const c = this.readConfig();
    let d = (c.reportsDirs || {})[p];
    if(!d && p === "dept") d = c.reportsDir;      // pre-1.8 config had a single shared folder
    return (d && fs.existsSync(d)) ? d : null;
  }
  setDir(profile, dir){
    const p = this.norm(profile);
    const c = this.readConfig();
    c.reportsDirs = c.reportsDirs || {};
    c.reportsDirs[p] = dir;
    if(p === "dept") c.reportsDir = dir;          // keep the legacy key in step
    this.writeConfig(c);
    this.startWatch();
    return dir;
  }
  /* a path is usable only inside that profile's folder tree */
  contained(profile, p){
    const base = this.getDir(profile);
    if(!base) return null;
    const rbase = path.resolve(base);
    const full = path.resolve(p);
    if(full !== rbase && !full.startsWith(rbase + path.sep)) return null;
    return full;
  }
  /* list one level of the tree: sub-folders plus the report files in `rel` */
  list(profile, rel){
    const base = this.getDir(profile);
    if(!base) return {dir: null, rel: "", dirs: [], files: []};
    const target = this.contained(profile, path.resolve(base, String(rel || "")));
    if(!target) return {dir: base, rel: "", dirs: [], files: [], error: "outside the reports folder"};
    let entries;
    try{ entries = fs.readdirSync(target, {withFileTypes: true}); }
    catch(e){ return {dir: base, rel: String(rel || ""), dirs: [], files: [], error: String(e.message || e)}; }
    const dirs = [], files = [];
    for(const d of entries){
      if(d.isDirectory()){
        dirs.push({name: d.name, rel: path.relative(base, path.join(target, d.name))});
        continue;
      }
      if(!d.isFile() || !REPORT_RE.test(d.name)) continue;
      try{
        const st = fs.statSync(path.join(target, d.name));
        files.push({name: d.name, path: path.join(target, d.name), size: st.size, mtimeMs: st.mtimeMs});
      }catch(e){}
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return {dir: base, rel: path.relative(base, target), dirs, files};
  }
  read(profile, p){
    const full = this.contained(profile, p);
    if(!full) throw new Error("file is outside the reports folder");
    if(!REPORT_RE.test(full)) throw new Error("not a report file");
    return fs.readFileSync(full);
  }
  /* the path of a report file he asked to delete, or null: only inside the folder, only
     a report file. The deletion itself is the caller's (shell.trashItem — the Recycle
     Bin, never unlink), so what is removable is decided here and what removal means there. */
  trashable(profile, p){
    const full = this.contained(profile, p);
    if(!full || !REPORT_RE.test(full)) return null;
    try{ if(!fs.statSync(full).isFile()) return null; }catch(e){ return null; }
    return full;
  }
  stat(profile, p){
    const full = this.contained(profile, p);
    if(!full) return null;
    try{
      const st = fs.statSync(full);
      return {mtimeMs: st.mtimeMs, size: st.size};
    }catch(e){ return null; }
  }
  startWatch(){
    this.stopWatch();
    for(const p of PROFILES){
      const dir = this.getDir(p);
      if(!dir) continue;
      try{
        let opts = {};
        try{ opts = {recursive: true}; }catch(e){}
        const w = fs.watch(dir, opts, () => {
          clearTimeout(this.debounce[p]);
          this.debounce[p] = setTimeout(() => { try{ this.o.onDirEvent(p); }catch(e){} }, 800);
        });
        w.on("error", () => {});
        this.watchers[p] = w;
      }catch(e){}
    }
  }
  stopWatch(){
    for(const p of Object.keys(this.watchers)){
      try{ this.watchers[p].close(); }catch(e){}
      delete this.watchers[p];
    }
    for(const p of Object.keys(this.debounce)) clearTimeout(this.debounce[p]);
    this.debounce = {};
  }
}
module.exports = {FileHub, REPORT_RE, PROFILES};
