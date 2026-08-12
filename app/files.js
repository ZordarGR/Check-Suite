/* Reports-folder access — pure Node logic, no Electron imports, testable standalone.
   The directory is chosen once, persisted in config.json, watched for changes. */
"use strict";
const fs = require("fs"), path = require("path");
const REPORT_RE = /\.(oxps|xps)$/i;

class FileHub {
  constructor(opts){            // {configPath, onDirEvent}
    this.o = opts;
    this.watcher = null;
    this.debounce = null;
  }
  readConfig(){ try{ return JSON.parse(fs.readFileSync(this.o.configPath, "utf8")); }catch(e){ return {}; } }
  writeConfig(c){
    try{
      fs.mkdirSync(path.dirname(this.o.configPath), {recursive: true});
      fs.writeFileSync(this.o.configPath, JSON.stringify(c));
    }catch(e){}
  }
  getDir(){
    const d = this.readConfig().reportsDir;
    return (d && fs.existsSync(d)) ? d : null;
  }
  setDir(dir){
    const c = this.readConfig();
    c.reportsDir = dir;
    this.writeConfig(c);
    this.startWatch();
    return dir;
  }
  /* a path is usable only inside the configured folder tree */
  contained(p){
    const base = this.getDir();
    if(!base) return null;
    const rbase = path.resolve(base);
    const full = path.resolve(p);
    if(full !== rbase && !full.startsWith(rbase + path.sep)) return null;
    return full;
  }
  /* list one level of the tree: sub-folders plus the report files in `rel` */
  list(rel){
    const base = this.getDir();
    if(!base) return {dir: null, rel: "", dirs: [], files: []};
    const target = this.contained(path.resolve(base, String(rel || "")));
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
  read(p){
    const full = this.contained(p);
    if(!full) throw new Error("file is outside the reports folder");
    if(!REPORT_RE.test(full)) throw new Error("not a report file");
    return fs.readFileSync(full);
  }
  stat(p){
    const full = this.contained(p);
    if(!full) return null;
    try{
      const st = fs.statSync(full);
      return {mtimeMs: st.mtimeMs, size: st.size};
    }catch(e){ return null; }
  }
  startWatch(){
    this.stopWatch();
    const dir = this.getDir();
    if(!dir) return;
    try{
      let opts = {};
      try{ opts = {recursive: true}; }catch(e){}
      this.watcher = fs.watch(dir, opts, () => {
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => { try{ this.o.onDirEvent(); }catch(e){} }, 800);
      });
      this.watcher.on("error", () => {});
    }catch(e){}
  }
  stopWatch(){
    if(this.watcher){ try{ this.watcher.close(); }catch(e){} this.watcher = null; }
    clearTimeout(this.debounce);
  }
}
module.exports = {FileHub, REPORT_RE};
