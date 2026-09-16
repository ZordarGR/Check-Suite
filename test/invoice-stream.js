const fs=require("fs"), assert=require("assert");
const messages=fs.readFileSync(process.argv[2],"utf8").trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s));
console.log("Native scope snapshots: "+JSON.stringify(messages.filter(m=>m.kind==="metadata"||m.kind==="invoice")));
const stable=messages.filter(m=>m.kind==="invoice"&&m.complete);
assert(stable.some(m=>m.data.fields[0]==="TEST GUEST"),"first reservation was read completely");
assert(stable.some(m=>m.data.fields[0]==="SECOND TEST GUEST"&&m.data.rows[1].amount==="-750,00"),"reused Invoice refreshes guest and payments");
assert(stable.every(m=>m.data.rows.length===(m.data.fields[0]==="LONG TEST GUEST"?400:2)&&!JSON.stringify(m).includes("IRRELEVANT A")),"reads B only");
assert(stable.some(m=>m.data.rows[1].label==="UNFAMILIAR PAYMENT"),"any payment label is captured");
const geometry=messages.filter(m=>m.kind==="geometry");
const {layout}=require("../app/arrangement-live");
// Native bounds are separate reads. Invalid snapshots are hidden by layout(),
// while every settled fixture state must produce usable, exact grid geometry.
const usable=geometry.filter(m=>layout(m,r=>r));
for(const m of usable){
 const l=layout(m,r=>r);
 assert.equal(l.grid.x,m.grid.x-m.rect.x);assert.equal(l.grid.y,m.grid.y-m.rect.y);
 assert.equal(l.grid.width,m.grid.width);assert.equal(l.grid.height,m.grid.height);
}
console.log("Geometry accepted: "+usable.length+"; rejected by bounds guard: "+(geometry.length-usable.length));
assert(new Set(geometry.map(m=>JSON.stringify(m.rect))).size>=3,"move/maximise/restore changes are followed");
const expectedGrid=fs.readFileSync(process.argv[2]+".grid","utf8").trim().split(/\r?\n/).map(s=>JSON.parse(s));
assert.equal(expectedGrid.length,4,"fixture recorded initial, moved, maximised and restored B grid");
for(const q of expectedGrid){
 assert(usable.some(m=>m.grid&&["x","y","width","height"].every(k=>m.grid[k]===q[k])),"stream must contain the exact B grid bounds measured independently by the fixture: "+JSON.stringify(q));
}
assert(geometry.every(m=>m.grid&&m.grid.width>0&&m.grid.height>0),"every geometry packet identifies B grid");
console.log("Exact B grid bounds followed across move/maximise/restore");
assert(messages.some(m=>m.kind==="hide"),"minimised invoice hides overlay");
console.log("Real Windows ListView capture, B isolation, geometry and reused guest passed");

const list=fs.readFileSync(process.argv[2]+".list","utf8");
assert(list.includes("IH\tTEST GUEST\t101\t2/0/0/0\t14/09/26\t21/09/26\tCI"),"existing IH columns unchanged: "+JSON.stringify(list));
assert(list.includes("RATE\tIH\tTEST GUEST\t101\t14/09/26\t21/09/26\t150,00\tWEBHOTELIER\tEUR\tCI"),"daily Price and agency reach tagged capture");
console.log("Real Windows IH Price/agency capture passed");


const metadata=messages.filter(m=>m.kind==="metadata");
assert(metadata.length>=4,"metadata precedes row scanning and updates during checkout");
for(const m of stable){
 const index=messages.indexOf(m);
 assert(messages.slice(0,index).some(x=>x.kind==="metadata"&&x.id===m.id&&x.epoch===m.epoch&&JSON.stringify(x.fields)===JSON.stringify(m.data.fields)),
  "stable rows require matching earlier metadata");
}
const scope=JSON.parse(fs.readFileSync(process.argv[2]+".scope","utf8"));
assert(scope.before>0&&scope.checkout===scope.before&&scope.stale===scope.before,"excluded B receives zero cell getters through checkout and a stale command");
assert(scope.resumed>scope.before,"fresh permission resumes B getters");
assert(stable.some(m=>m.epoch===scope.epoch&&m.data.rows[1].amount==="-800,00"),"resumed same-metadata invoice obtains fresh stable rows");
const outsideEpochs=metadata.filter(m=>m.fields[5]==="FICTIONAL AGENCY"&&m.epoch<scope.epoch).map(m=>m.epoch);
assert(outsideEpochs.length>0);
assert(!messages.some(m=>m.kind==="invoice"&&outsideEpochs.includes(m.epoch)),"confirmed excluded generations have no B snapshots");
assert(stable.some(m=>m.epoch>scope.epoch&&m.data.fields[5]==="INDIVIDUAL"),"restoring hidden B restarts metadata and reads");
console.log("Scope gate verified with actual getter counts: "+JSON.stringify(scope));

const recovery=JSON.parse(fs.readFileSync(process.argv[2]+".recovery","utf8"));
assert.equal(recovery.delays,1,"fixture exercised one getter beyond the deadline");
assert.equal(recovery.rapid,8,"fixture switched through eight guests rapidly");
assert(stable.some(m=>m.data.fields[0]==="DELAYED TEST GUEST"&&m.data.rows[1].amount==="-650,00"),
 "a timed-out B getter must recover without reopening Invoice or restarting the reader");
assert(stable.some(m=>m.data.fields[0]==="FINAL TEST GUEST"&&m.data.rows[1].amount==="-600,00"),
 "rapid switching must settle on the final guest and fresh payment");
assert(!stable.some(m=>m.data.fields[0]==="FINAL TEST GUEST"&&m.data.rows[1].amount!=="-600,00"),
 "final guest must never inherit a previous payment");
console.log("Timeout recovery and rapid switching passed: "+JSON.stringify(recovery));

assert(stable.some(m=>m.data.fields[0]==="LONG TEST GUEST"&&m.data.rows.length===400),
 "the maximum 400-entry invoice must complete within the existing read budget");
console.log("Maximum-length invoice passed within the unchanged read budget");
