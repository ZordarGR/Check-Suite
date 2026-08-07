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
  list(){
    const dir = this.getDir();
    if(!dir) return {dir: null, files: []};
    let names;
    try{ names = fs.readdirSync(dir); }catch(e){ return {dir, files: [], error: String(e.message || e)}; }
    const files = [];
    for(const n of names){
      if(!REPORT_RE.test(n)) continue;
      try{
        const st = fs.statSync(path.join(dir, n));
        if(st.isFile()) files.push({name: n, path: path.join(dir, n), size: st.size, mtimeMs: st.mtimeMs});
      }catch(e){}
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return {dir, files};
  }
  read(p){
    const dir = this.getDir();
    if(!dir) throw new Error("no reports folder configured");
    const full = path.resolve(p);
    if(path.dirname(full) !== path.resolve(dir)) throw new Error("file is outside the reports folder");
    if(!REPORT_RE.test(full)) throw new Error("not a report file");
    return fs.readFileSync(full);
  }
  startWatch(){
    this.stopWatch();
    const dir = this.getDir();
    if(!dir) return;
    try{
      this.watcher = fs.watch(dir, () => {
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
