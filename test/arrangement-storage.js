/* Real service/file boundary, synthetic references only. Run in cloud, never hotel PC. */
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),{EventEmitter}=require("events");
const {start}=require("../app/arrangement-live");
const calc=require("../app/arrangement");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"arrangement-storage-"));
const now=Date.now(),day=n=>{const d=new Date(now+n*86400000);return String(d.getUTCDate()).padStart(2,"0")+"/"+String(d.getUTCMonth()+1).padStart(2,"0")+"/"+d.getUTCFullYear();};
const ref=(name="SAVED GUEST",room="201")=>({tag:"IH",name,room,arr:day(-2),dep:day(5),price:"100,00",agency:"DIRECT",currency:"EUR",at:now-10000});
const capture="TITLE\tGuests inhouse: "+day(0)+"\nRATE\tIH\tNEW GUEST\t101\t"+day(-2)+"\t"+day(5)+"\t150,00\tDIRECT\tEUR\tCI\nDONE\t1\t1\t0\t0\tunicode\tcomplete\n";
let cases=0,logs=[];
const originalError=console.error;
console.error=(...args)=>logs.push(args.map(String).join(" "));
function service(dir,fn){
 const app=new EventEmitter(),ipcMain=new EventEmitter(),child=new EventEmitter();
 child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};child.stdin=new EventEmitter();child.stdin.write=()=>true;
 const controller=start({electron:{app,ipcMain,BrowserWindow:class{constructor(){throw Error("Unexpected overlay without invoice");}},screen:{}},helperPath:"unused",captureDir:dir,userData:dir,spawnHelper:()=>child});
 try{return fn(controller);}finally{app.emit("before-quit");}
}
function test(name,fn){const dir=path.join(root,String(++cases));fs.mkdirSync(dir);fn(dir,path.join(dir,"arrangement-rates-v1.json"));console.log("PASS "+name);}
const names=file=>JSON.parse(fs.readFileSync(file,"utf8")).map(r=>r.name).sort();
try{
 test("missing rate store is created from a valid capture",(dir,file)=>{
  fs.writeFileSync(path.join(dir,"rc-list-IH.tsv"),capture);
  service(dir,()=>assert.deepStrictEqual(names(file),["NEW GUEST"]));
 });
 test("corrupt JSON or reference schema is preserved, then a repaired store recovers without losing old rows",(dir,file)=>{
  fs.writeFileSync(path.join(dir,"rc-list-IH.tsv"),capture);
  for(const raw of ["", "{", "{}", "[null]",JSON.stringify([{...ref(),at:"wrong"}]),JSON.stringify([{...ref(),arr:"not a date"}])]){
   fs.writeFileSync(file,raw);const before=logs.length;
   service(dir,c=>{
    assert.equal(fs.readFileSync(file,"utf8"),raw);assert(logs.length>before,"Storage fault must be reported");
    fs.writeFileSync(file,JSON.stringify([ref()]));c.scanRefs();
    assert.deepStrictEqual(names(file),["NEW GUEST","SAVED GUEST"]);
   });
  }
 });
 test("a read failure is not mistaken for a missing store",(dir,file)=>{
  const raw=JSON.stringify([ref()]);fs.writeFileSync(file,raw);fs.writeFileSync(path.join(dir,"rc-list-IH.tsv"),capture);
  const read=fs.readFileSync;let deny=true;
  fs.readFileSync=function(p,...args){if(String(p)===file&&deny){const e=Error("synthetic denied read");e.code="EACCES";throw e;}return read.call(this,p,...args);};
  try{service(dir,c=>{assert.equal(read(file,"utf8"),raw);deny=false;c.scanRefs();assert.deepStrictEqual(names(file),["NEW GUEST","SAVED GUEST"]);});}
  finally{fs.readFileSync=read;}
 });
 for(const operation of ["writeFileSync","renameSync"]){
  test(operation+" failure preserves originals and retries an unchanged capture",(dir,file)=>{
   const raw=JSON.stringify([ref()]);fs.writeFileSync(file,raw);
   service(dir,c=>{
    fs.writeFileSync(path.join(dir,"rc-list-IH.tsv"),capture);
    const method=fs[operation];let attempts=0,deny=true;
    fs[operation]=function(p,...args){if(String(p)===file+".tmp"){attempts++;if(deny)throw Error("synthetic storage failure");}return method.call(this,p,...args);};
    try{
     c.scanRefs();assert.equal(fs.readFileSync(file,"utf8"),raw);
     c.scanRefs();assert.equal(attempts,2,"The unchanged capture must still retry persistence");assert.equal(fs.readFileSync(file,"utf8"),raw);
     deny=false;c.scanRefs();assert.equal(attempts,3);assert.deepStrictEqual(names(file),["NEW GUEST","SAVED GUEST"]);
    }finally{fs[operation]=method;}
   });
  });
 }
 test("corruption discovered before replacement remains untouched and repaired concurrent rows are merged",(dir,file)=>{
  fs.writeFileSync(file,JSON.stringify([ref()]));
  service(dir,c=>{
   fs.writeFileSync(file,"{damaged");fs.writeFileSync(path.join(dir,"rc-list-IH.tsv"),capture);c.scanRefs();
   assert.equal(fs.readFileSync(file,"utf8"),"{damaged");
   fs.writeFileSync(file,JSON.stringify([ref(),ref("RECOVERED GUEST","202")]));c.scanRefs();
   assert.deepStrictEqual(names(file),["NEW GUEST","RECOVERED GUEST","SAVED GUEST"]);
  });
 });
 test("an interrupted source capture cannot replace the saved reference store",(dir,file)=>{
  const raw=JSON.stringify([ref()]);fs.writeFileSync(file,raw);fs.writeFileSync(path.join(dir,"rc-list-IH.tsv"),capture.replace("complete","cut-short"));
  service(dir,c=>{c.scanRefs();assert.equal(fs.readFileSync(file,"utf8"),raw);});
 });
 test("archived price before checkout zero survives out-of-order replay and duplicate replay is durable without another write",(dir,file)=>{
  service(dir,c=>{
   const zero=capture.replace("150,00","0,00");
   assert.equal(c.ingestCapture("IH",zero,now),true);
   assert.equal(c.ingestCapture("IH",capture,now-1000),true);
   const saved=JSON.parse(fs.readFileSync(file,"utf8")),r=calc.reference({name:"NEW GUEST",room:"101",arr:day(-2),dep:day(5)},saved);
   assert.equal(r.price,"0,00");assert.equal(r.priorRate,15000);assert.equal(saved.length,2);
   const raw=fs.readFileSync(file,"utf8"),rename=fs.renameSync;let writes=0;
   fs.renameSync=function(p,...args){if(String(p)===file+".tmp")writes++;return rename.call(this,p,...args);};
   try{assert.equal(c.ingestCapture("IH",capture,now-1000),true);assert.equal(c.ingestCapture("IH",zero,now),true);}
   finally{fs.renameSync=rename;}
   assert.equal(writes,0);assert.equal(fs.readFileSync(file,"utf8"),raw);
  });
 });
 test("archive replay refuses a corrupt store and resumes after repair without deleting evidence",(dir,file)=>{
  fs.writeFileSync(file,"{damaged");
  service(dir,c=>{
   assert.equal(c.ingestCapture("IH",capture,now),false);assert.equal(fs.readFileSync(file,"utf8"),"{damaged");
   fs.writeFileSync(file,JSON.stringify([ref()]));
   assert.equal(c.ingestCapture("IH",capture,now),true);assert.deepStrictEqual(names(file),["NEW GUEST","SAVED GUEST"]);
  });
 });
 for(const operation of ["writeFileSync","renameSync"]){
  test("archive replay acknowledges durability only after "+operation+" recovers",(dir,file)=>{
   const raw=JSON.stringify([ref()]);fs.writeFileSync(file,raw);
   service(dir,c=>{
    const method=fs[operation];let deny=true;
    fs[operation]=function(p,...args){if(String(p)===file+".tmp"&&deny)throw Error("synthetic replay save failure");return method.call(this,p,...args);};
    try{
     assert.equal(c.ingestCapture("IH",capture,now),false);assert.equal(fs.readFileSync(file,"utf8"),raw);
     deny=false;assert.equal(c.ingestCapture("IH",capture,now),true);assert.deepStrictEqual(names(file),["NEW GUEST","SAVED GUEST"]);
    }finally{fs[operation]=method;}
   });
  });
 }
 test("archive API ignores movement metadata and refuses interrupted or wrong-list input",(dir,file)=>{
  service(dir,c=>{
   assert.equal(c.ingestCapture("MV","no price metadata",now),true);
   assert.equal(c.ingestCapture("IH",capture.replace("complete","cut-short"),now),false);
   assert.equal(c.ingestCapture("AR",capture,now),false);
   assert.equal(c.ingestCapture("IH",capture,NaN),false);
   assert.equal(fs.existsSync(file),false);
  });
 });
 console.log(cases+" Arrangement storage integration cases passed");
}finally{console.error=originalError;fs.rmSync(root,{recursive:true,force:true});}
