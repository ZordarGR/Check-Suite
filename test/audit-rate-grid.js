"use strict";
// Synthetic cloud fixtures: complete grids, interruption, identity, payment and durable replay.
const assert=require("assert/strict"),fs=require("fs"),os=require("os"),path=require("path"),{EventEmitter}=require("events");
const c=require("../app/arrangement"),{start}=require("../app/arrangement-live");
const now=Date.now(),base=Math.floor(now/86400000),fmt=n=>{const d=new Date(n*86400000);return [String(d.getUTCDate()).padStart(2,"0"),String(d.getUTCMonth()+1).padStart(2,"0"),d.getUTCFullYear()].join("/");};
function grid(n=10,at=now){
 return {tag:"RG",name:"SYNTHETIC FULL GUEST",room:"507",arr:fmt(base-2),dep:fmt(base-2+n),currency:"EUR",at,complete:true,
 rows:Array.from({length:n+1},(_,i)=>["","Mo",fmt(base-2+i),"507","2","0","0","0","0","0","0","RACK","HB","TAX,*HB",i<5?"240,00":"220,00","Individuals"])};
}
const txt=g=>["TITLE\tRate by Day Grid",["GRID",g.name+" , room "+g.room+", "+g.arr+" - "+g.dep,g.currency].join("\t"),...g.rows.map(r=>["RG",...r].join("\t")),["DONE",g.rows.length,g.complete?g.rows.length:10,0,0,"unicode",g.complete?"complete":"pending"].join("\t")].join("\n")+"\n";
const list=g=>({tag:"IH",name:g.name,room:g.room,arr:g.arr,dep:g.dep,price:"220,00",agency:"INDIVIDUAL",currency:"EUR",at:now});
const inv=g=>({name:g.name,room:g.room,arr:g.arr,dep:g.dep,currency:"EUR",complete:true,rows:[{label:"Deposit",amount:"-2.300,00",date:g.arr,currency:"EUR"},{label:"*Arrangement",amount:"310,00",date:g.arr,currency:"EUR"}]});
let tests=0;function test(n,f){f();tests++;console.log("PASS "+n);}
test("11-row capture covers 10 nights; departure row retained but not charged",()=>{
 const g=grid(),r=c.captureGrid(txt(g),now)[0];assert(r);assert.equal(r.rows.length,11);assert.equal(c.evaluate(inv(g),[list(g),r]).expected,230000);assert.equal(c.evaluate(inv(g),[list(g),r]).state,"paid");
 assert.equal(c.evaluate(inv(g),[list(g)]).expected,229000,"fallback retains actual posted 310 + nine list rates");
});
test("grid total wins over posted invoice prices and the guest-list price",()=>{
 const g=grid(),r=c.evaluate(inv(g),[list(g),g]);assert.equal(r.source,"grid");assert.equal(r.posted,31000);assert.equal(r.diff,0);
 assert.equal(c.evaluate({...inv(g),rows:[{label:"Deposit",amount:"-2.230,00",date:g.arr,currency:"EUR"}]},[list(g),g]).diff,-7000);
});
test("all four authorized agencies work despite different B allocation, others remain excluded",()=>{
 const g=grid();for(const agency of ["BOOKING.COM","EXPEDIA","INDIVIDUAL","WEBHOTELIER"])assert.equal(c.evaluate({...inv(g),title:"SOME OTHER NAME"},[{...list(g),agency},g]).state,"paid");
 assert.equal(c.evaluate(inv(g),[{...list(g),agency:"OTHER TOUR OPERATOR"},g]).state,"outside");
 assert.equal(c.evaluate(inv(g),[g]).state,"unknown","market Individuals must not become agency evidence");
});
test("month, multi-month, year and longer stays read entirely without five/50/366-row truncation",()=>{
 for(const n of [31,62,120,366,401,1000]){
  const g=grid(n),read=c.captureGrid(txt(g),now)[0];assert.equal(read.rows.length,n+1);
  const result=c.evaluate(inv(g),[list(g),read]);assert.equal(result.expected,5*24000+(n-5)*22000);assert.equal(result.nights,n);
 }
});
test("zero-priced nights are explicit grid facts, while the departure package is irrelevant",()=>{
 const g=grid();g.rows[3][14]="0,00";g.rows.at(-1)[13]="";assert(c.validGrid(g));assert.equal(c.evaluate(inv(g),[list(g),g]).expected,206000);assert(c.gridTaxRecords([g])[0].nights.every(n=>n.tax));
});
test("full exact identity prevents stale/moved/reused room and changed-date matches",()=>{
 const g=grid();for(const delta of [{name:"SYNTHETIC OTHER GUEST"},{room:"508"},{arr:fmt(base-3)},{dep:fmt(base+9)}])assert.equal(c.gridReference({...inv(g),...delta},[g]),null);
 const moved=grid();moved.rows[5][3]="508";assert(c.validGrid(moved));assert.equal(c.gridTaxRecords([moved])[0].nights[5].room,"508");
});
test("partial, missing/duplicate/out-of-range dates, unreadable rates and bad footers never certify",()=>{
 const g=grid();for(const modify of [
 x=>x.rows.splice(4,1),x=>{x.rows[4][2]=x.rows[3][2];},x=>{x.rows[4][2]=fmt(base-3);},
 x=>{x.rows[4][14]="";},x=>{x.rows[4][14]="-1,00";},x=>{x.rows[4].pop();},x=>{x.rows[4][2]="31/02/2026";}
 ]){const x=structuredClone(g);modify(x);assert(!c.validGrid(x));assert.equal(c.captureGrid(txt(x),now).length,0);}
 for(const text of [txt(g).replace("complete","cut-short"),txt(g).replace("DONE\t11\t11","DONE\t5\t11"),txt(g)+"ERR\tfailed\n",txt(g)+"DONE\t11\t11\t0\t0\tunicode\tcomplete\n"])assert.equal(c.captureGrid(text,now).length,0);
});
test("pending latest grid blocks verdict without destroying last complete evidence; reread recovers",()=>{
 const g=grid(),pending={...g,at:now+1,complete:false,rows:[]};
 const refs=c.mergeRefs([g,list(g)],[pending],now);assert(refs.some(x=>x.tag==="RG"&&x.complete));assert.equal(c.evaluate(inv(g),refs).state,"unknown");
 const recovered=c.mergeRefs(refs,[{...g,at:now+2}],now);assert.equal(c.evaluate(inv(g),recovered).state,"paid");
 const conflict=structuredClone(g);conflict.rows[3][14]="300,00";assert.equal(c.evaluate(inv(g),[list(g),g,conflict]).state,"unknown");
});
test("TAX is an exact package token for every occupied night, never NOTAX or *TAX",()=>{
 const g=grid();g.rows[4][13]="*HB,NOTAX";g.rows[5][13]="*TAX";g.rows[6][13]="HB; TAX";
 const nights=c.gridTaxRecords([g])[0].nights;assert(!nights[4].tax);assert(!nights[5].tax);assert(nights[6].tax);
});
test("native-grid archive replay, restart and failed replacement preserve evidence",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"rate-grid-")),file=path.join(dir,"arrangement-rates-v1.json"),g=grid();
 const service=()=>{const app=new EventEmitter(),ipcMain=new EventEmitter();return {app,c:start({electron:{app,ipcMain,screen:{},BrowserWindow:class{}},helperPath:"unused",captureDir:dir,userData:dir,enabled:false})};};
 try{
  let {app,c:svc}=service();assert(svc.ingestCapture("RG",txt(g),now));assert.equal(svc.getRateGrids()[0].nights.length,10);
  const saved=fs.readFileSync(file,"utf8"),rename=fs.renameSync;
  fs.renameSync=function(p,...args){if(p===file+".tmp")throw Error("synthetic disk failure");return rename.call(this,p,...args);};
  try{assert.equal(svc.ingestCapture("RG",txt({...g,complete:false,rows:[]}),now+1),false);assert.equal(fs.readFileSync(file,"utf8"),saved);}
  finally{fs.renameSync=rename;}
  assert(svc.ingestCapture("RG",txt({...g,complete:false,rows:[]}),now+1));app.emit("before-quit");
  ({app,c:svc}=service());assert(svc.getRateGrids().some(x=>!x.complete));assert(svc.ingestCapture("RG",txt(g),now+2));assert(svc.getRateGrids().some(x=>x.at===now+2&&x.complete));app.emit("before-quit");
  fs.writeFileSync(file,"{damaged");({app,c:svc}=service());assert.equal(svc.ingestCapture("RG",txt(g),now+3),false);assert.equal(fs.readFileSync(file,"utf8"),"{damaged");app.emit("before-quit");
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("tax warning uses exact stay identity/night and preserves 9xxx and departure exemptions",()=>{
 const html=fs.readFileSync("app/index.html","utf8"),a=html.indexOf("function rateGridTaxWarning("),b=html.indexOf("function crossReference(",a);
 const window={__rcRateGrids:c.gridTaxRecords([grid()])},dkey=s=>{const n=c.day(s);if(n===null)return 0;const d=new Date(n*86400000);return d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate();};
 const warning=new Function("window","dkey","dfmt",html.slice(a,b)+"return rateGridTaxWarning;")(window,dkey,String);
 const g=grid(),night=dkey(g.rows[4][2]);assert.equal(warning(g.room,g,night),"");
 window.__rcRateGrids[0].nights[4].tax=false;assert.match(warning(g.room,g,night),/TAX package missing/);
 assert.match(warning(g.room,g,dkey(g.rows[0][2])),/TAX package missing/,"a later missing package is visible now");
 assert.equal(warning("508",g,night),"");assert.equal(warning(g.room,{...g,name:"OTHER GUEST"},night),"");
 window.__rcRateGrids[0].room="507-08";window.__rcRateGrids[0].nights[4].room="507-08";assert.match(warning("507",{...g,adjoining:true,partner:"08"},night),/TAX package missing/);
 window.__rcRateGrids[0].room="507";window.__rcRateGrids[0].nights[4].room="507";
 window.__rcRateGrids[0].complete=false;assert.match(warning(g.room,g,night),/incomplete/);
});
console.log(JSON.stringify({suite:"rate-grid",passed:tests}));
