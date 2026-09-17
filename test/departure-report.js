const fs=require("fs"),assert=require("assert");
const src=fs.readFileSync("app/index.html","utf8");
function lift(n){const at=src.indexOf("\nfunction "+n+"(");assert(at>=0,n);let d=0,b=src.indexOf("{",at);for(let j=b;j<src.length;j++){if(src[j]==="{")d++;if(src[j]==="}"&&!--d)return src.slice(at+1,j+1);}}
const api=new Function(["dateNum2","pillRoom","sameName","nameWordSet","nameLike","nameHit","statusRows","depReportKey","depReportDate","depReportRows"].map(lift).join("\n")+";return {key:depReportKey,rows:depReportRows};")();
assert.equal(api.key("2026-09-18"),20260918);assert.equal(api.key("31/09/26"),0);
const ledger={
 "101":{"20260901":{d:20260918,n:"TEST ALPHA",seen:20260917,mv:true}},
 "102":{"20260901":{d:20260918,n:"TEST ALPHA",seen:20260917,from:"101"}},
 "201":{"20260912":{d:20260919,n:"BETA PERSON",seen:20260917}},
 "301":{"20260910":{d:20260920,n:"GAMMA PERSON",seen:20260917}},
 "403":{"20260904":{d:20260918,n:"DELTA PERSON",seen:20260917}},
 "9000":{"20260901":{d:20260918,n:"HOUSE"}},
 "9017":{"20260901":{d:20260918,n:"EPSILON GUEST"}}};
const status={IH:{key:20260917,rows:[{room:"403-2",arr:"04/09/26",dep:"18/09/26",name:"DELTA PERSON"}]},
 MV:{"20260914":{rows:{a:{from:"101",to:"102",name:"TEST ALPHA",arr:"01/09/26",dep:"18/09/26",x:"X"}}}}};
const history={"20260902":[["101","TEST ALPHA"]],"20260917":[["403-2","DELTA PERSON"],["201","WRONG GUEST"]],"20260920":[["201","BETA PERSON"]]};
const snapshot=JSON.stringify({ledger,status,history});
let rows=api.rows(ledger,status,history,20260918,20260919);
assert.deepEqual(rows.map(r=>r.room),["102","403-2","9017","201"]);
assert.deepEqual(rows.map(r=>r.name),["TEST ALPHA","DELTA PERSON","EPSILON GUEST","BETA PERSON"]);
assert.deepEqual(rows.map(r=>r.extras),[true,true,false,false]);
assert.equal(JSON.stringify({ledger,status,history}),snapshot);
assert.equal(api.rows(ledger,status,history,20260921,20260922).length,0);
// Checkout-day extras count; room alone cannot make another guest's receipt match.
history["20260919"]=[["201","BETA PERSON"]];
assert(api.rows(ledger,status,history,20260919,20260919)[0].extras);
assert(!api.rows(ledger,status,{"20260918":[["201","OTHER NAME"]]},20260919,20260919)[0].extras);
// Follow two completed moves, even when the latest ledger links only one earlier room.
ledger["103"]={"20260901":{d:20260918,n:"TEST ALPHA",seen:20260917,from:"102"}};
ledger["102"]["20260901"].mv=true;
status.MV["20260916"]={rows:{b:{from:"102",to:"103",name:"TEST ALPHA",arr:"01/09/26",dep:"18/09/26",x:"X"}}};
assert(api.rows(ledger,status,history,20260918,20260918).find(r=>r.room==="103").extras);
console.log("Departure report: date boundaries, full-stay receipts, move chains, adjoining rooms, exclusions and read-only data PASS");

// Same room, exact guest, same departure: historical arrival-date variants.
const versions={"162":{"20260910":{d:20260917,n:"SYNTHETIC GUEST",seen:20260915},"20260911":{d:20260917,n:"SYNTHETIC GUEST",seen:20260916}}};
const receipts={"20260912":[["162","SYNTHETIC GUEST"]]};
const take=(st={},hist=receipts)=>api.rows(versions,st,hist,20260917,20260917);
const before=JSON.stringify(versions);
let v=take();assert.equal(v.length,1);assert.equal(v[0].arr,20260911);assert(v[0].extras);
// Latest capture can correct an arrival BACKWARDS; never prefer later arrival automatically.
versions["162"]["20260910"].seen=20260917;
v=take();assert.equal(v[0].arr,20260910);assert(v[0].extras);
versions["162"]["20260911"].seen=20260917;
v=take();assert.equal(v.length,1);assert.deepEqual(v[0].arrivals,[20260910,20260911]);assert(v[0].extras);
const ih={IH:{key:20260917,rows:[{room:"162",name:"SYNTHETIC GUEST",arr:"11/09/26",dep:"17/09/26"}]}};
v=take(ih);assert.equal(v.length,1);assert.deepEqual(v[0].arrivals,[20260911]);assert(v[0].extras);
// Old census cannot beat a newer saved ledger capture.
ih.IH.key=20260916;v=take(ih);assert.deepEqual(v[0].arrivals,[20260910,20260911]);
// A receipt falling only within one unresolved arrival range is not asserted as certain.
v=take({},{"20260910":[["162","SYNTHETIC GUEST"]]});assert(!v[0].extras&&v[0].extrasUncertain);
const keep=JSON.stringify(versions);take();assert.equal(JSON.stringify(versions),keep);
// Distinct departure dates and merely shared-name words remain separate.
versions["162"]["20260909"]={d:20260918,n:"SYNTHETIC GUEST",seen:20260917};
versions["162"]["20260908"]={d:20260917,n:"ANOTHER GUEST",seen:20260917};
assert.equal(api.rows(versions,{},receipts,20260917,20260918).length,3);
console.log("PASS Offline arrival reconciliation: newer capture, backwards correction, census tie, unresolved conflict, extras uncertainty, distinct stays and no mutation");
