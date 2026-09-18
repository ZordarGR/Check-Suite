/* Cloud-only synthetic capture archive; no vendor process is used. */
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),vm=require("vm");
const src=fs.readFileSync("app/main.js","utf8"),start=src.indexOf("function readCapturedLists(after){"),end=src.indexOf('ipcMain.handle("sc-listcaptures"',start);
assert(start>0&&end>start);
const cases=[];const test=(n,f)=>cases.push([n,f]);
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"capture-files-")),archive=path.join(dir,"RecCheck","captures");
 let fail=false;const proxy=Object.create(fs);proxy.readFileSync=(...a)=>{if(fail)throw Object.assign(Error("denied"),{code:"EACCES"});return fs.readFileSync(...a);};
 const c={require:n=>n==="fs"?proxy:require(n),process:{env:{LOCALAPPDATA:dir}}};vm.createContext(c);vm.runInContext(src.slice(start,end),c);
 const id=(n,at=1,tag="IH")=>String(n).padStart(19,"0")+"-"+String(at).padStart(13,"0")+"-"+tag+"-"+"a".repeat(32)+".tsv";
 const put=(name,body="complete saved capture")=>{fs.mkdirSync(archive,{recursive:true});fs.writeFileSync(path.join(archive,name),body);};
 try{fn({read:c.readCapturedLists,id,put,archive,fail:()=>{fail=true;}});}finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test("missing archive is an empty queue",()=>fixture(({read})=>assert.equal(read("").captures.length,0)));
test("all tags and older-than-20-hour captures survive in acquisition order",()=>fixture(({read,id,put})=>{
 for(const [i,t]of["IH","MV","AR","DP"].entries())put(id(i+1,4-i,t),t);
 const r=read("");assert.deepEqual(Array.from(r.captures,x=>x.tag),["IH","MV","AR","DP"]);assert.deepEqual(Array.from(r.captures,x=>x.at),[4,3,2,1]);assert(!r.more);
}));
test("successive filtered snapshots are separate and replay resumes after cursor",()=>fixture(({read,id,put,archive})=>{
 put(id(1),"rooms 54 76");put(id(2),"room 76");assert.equal(read("").captures.length,2);assert.equal(read(id(1)).captures[0].text,"room 76");assert.equal(fs.readdirSync(archive).length,2);
}));
test("unpublished temporary files and unrelated names cannot be replayed",()=>fixture(({read,id,put})=>{
 put(id(1)+".tmp","partial");put("unrelated.tsv");put(id(2),"complete");assert.equal(read("").captures.length,1);
}));
test("bounded batches neither skip nor consume pending files",()=>fixture(({read,id,put})=>{
 for(let i=1;i<=26;i++)put(id(i));const a=read("");assert.equal(a.captures.length,25);assert(a.more);const b=read(a.captures[24].id);assert.equal(b.captures.length,1);assert(!b.more);assert.equal(read("").captures.length,25);
}));
test("invalid cursor and traversal fail closed",()=>fixture(({read})=>{
 for(const x of["../outside",{},123,"bad.tsv"])assert(read(x).error);
}));
test("read failure preserves archive and reports failure",()=>fixture(({read,id,put,archive,fail})=>{
 put(id(1),"kept");fail();assert(read("").error);assert.equal(fs.readFileSync(path.join(archive,id(1)),"utf8"),"kept");
}));
test("oversized capture blocks rather than silently skipping evidence",()=>fixture(({read,id,put})=>{
 put(id(1),Buffer.alloc(8*1024*1024+1));assert(read("").error);
}));
let failed=0;for(const[n,f]of cases){try{f();console.log("PASS "+n);}catch(e){failed++;console.log("FAIL "+n+" "+e.message);}}
console.log(JSON.stringify({suite:"capture-files",total:cases.length,passed:cases.length-failed,failed}));process.exitCode=failed?1:0;
