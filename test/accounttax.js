/* Guest-account nights do not create physical-room tax obligations.
   Exercise the shipped comparison, including wrong-guest and ambiguous-history guards. */
const fs = require("fs"), assert = require("assert");
const src = fs.readFileSync("app/index.html", "utf8");
const lift = n => {
  const at = src.indexOf("\nfunction " + n + "(");
  if(at < 0) throw new Error("missing " + n);
  const start = src.indexOf("{", at); let depth = 0;
  for(let i = start; i < src.length; i++){
    if(src[i] === "{") depth++;
    else if(src[i] === "}" && --depth === 0) return src.slice(at + 1, i + 1);
  }
  throw new Error("unclosed " + n);
};
let stored = "{}", writes = 0, count = 0;
const storage = {getItem: () => stored, setItem: () => { writes++; }};
const compare = new Function("localStorage", 'const STATUS_KEY="reccheck_status_v1";\n' +
  ["dkey", "pillRoom", "statusLoad", "taxAccountBounds", "taxRoomKeys", "rateGridTaxWarning", "crossReference"].map(lift).join("\n") +
  "\nreturn crossReference;")(storage);
const stay = () => ({name:"MORGAN/TAYLOR ALICE/ROBERT",arr:"02/09/26",dep:"10/09/26"});
const rate = room => ({live:true,rooms:{[room || "205"]:stay()}});
const move = extra => Object.assign({from:"9017",to:"205",name:"MORGAN/TAYLOR",x:"X",arr:"02/09/26",dep:"10/09/26"},extra);
const days = entries => {
  const MV = {};
  entries.forEach(([day,row], i) => {
    const d = MV[day] = MV[day] || {rows:{}};
    d.rows[i] = row;
  });
  return MV;
};
const run = (night, entries, rr, charges) => {
  stored = JSON.stringify({MV:days(entries)});
  return compare(rr || rate(), {dateKey:night,rooms:charges || {}}, night);
};
const check = (label, f) => { f(); count++; console.log("  ok    " + label); };
const missing = x => x.totalFail.length + x.autoMiss.length;
const incoming = [[20260904,move()]];
check("account nights, including the original arrival, are not missing tax", () => {
  for(const n of [20260902,20260903]) {
    const x = run(n,incoming); assert.equal(missing(x),0); assert.equal(x.notOwed,1);
  }
});
check("tax starts on the incoming move date and continues afterwards", () => {
  for(const n of [20260904,20260905,20260909]) assert.equal(run(n,incoming).totalFail.length,1);
});
check("the ordinary departure remains exclusive", () => assert.equal(missing(run(20260910,incoming)),0));
check("a correctly posted physical night still passes", () => assert.equal(run(20260904,incoming,null,{"205":{arr:1,auto:1,man:0}}).okCount,1));
check("a real missing automatic charge still warns after the move", () => assert.equal(run(20260904,incoming,null,{"205":{arr:1,auto:0,man:0}}).autoMiss.length,1));
const outgoing = [[20260906,move({from:"205",to:"9017"})]];
check("physical nights before an outgoing move still require tax", () => {
  for(const n of [20260902,20260905]) assert.equal(run(n,outgoing).totalFail.length,1);
});
check("tax stops on the outgoing move date", () => {
  for(const n of [20260906,20260909]) assert.equal(missing(run(n,outgoing)),0);
});
for(const [label,extra] of [
  ["another guest",{name:"STONE MAYA"}], ["a different original arrival",{arr:"01/09/26"}],
  ["a different departure",{dep:"11/09/26"}], ["an unmarked move",{x:""}],
  ["an unrecognised mark",{x:"?"}], ["no guest name",{name:""}],
  ["room 9000",{from:"9000"}], ["an unrelated physical room",{to:"206"}],
  ["a five-digit account",{from:"99017"}], ["a four-digit non-9xxx account",{from:"1001"}]
]) check(label + " cannot exempt this guest", () => assert.equal(run(20260903,[[20260904,move(extra)]]).totalFail.length,1));
check("house account names cannot create a tax boundary", () => {
  const rr=rate(); rr.rooms["205"].name="IRIS";
  assert.equal(run(20260903,[[20260904,move({name:"IRIS"})]],rr).totalFail.length,1);
});
check("a move outside the captured stay cannot exempt it", () => {
  for(const n of [20260901,20260911]) assert.equal(run(20260903,[[n,move()]]).totalFail.length,1);
});
check("a missing or malformed status store retains the ordinary comparison", () => {
  for(const value of ["{}", "{", "[]"]) {
    stored=value; assert.equal(compare(rate(),{rooms:{},dateKey:20260903}).totalFail.length,1);
  }
});
check("duplicate records of the same transition are counted once", () => assert.equal(missing(run(20260903,[...incoming,...incoming])),0));
check("two different account transitions are ambiguous and supply no exemption", () => {
  assert.equal(run(20260903,[...incoming,[20260905,move({from:"205",to:"9017"})]]).totalFail.length,1);
});
check("a later physical-room move preserves the captured account boundary", () => {
  const chain=[...incoming,[20260905,move({from:"205",to:"206"})]];
  assert.equal(missing(run(20260903,chain,rate("206"))),0);
  assert.equal(run(20260905,chain,rate("206")).totalFail.length,1);
});
check("a disconnected same-name transition does not change this room", () => {
  const unrelated=[...incoming,[20260905,move({from:"9018",to:"207"})]];
  assert.equal(missing(run(20260903,unrelated)),0);
});
check("legacy Rate Check comparisons retain their existing behavior", () => {
  const rr=rate(); rr.live=false;
  assert.equal(run(20260903,incoming,rr).totalFail.length,1);
});
check("comparison changes neither reservation dates nor captured facts", () => {
  const rr=rate(), before=JSON.stringify(rr), entries=JSON.stringify(incoming);
  run(20260903,incoming,rr);
  assert.equal(JSON.stringify(rr),before); assert.equal(JSON.stringify(incoming),entries); assert.equal(writes,0);
});

check("9xxx accounts cannot enter the tax census, even through a legacy rate list", () => {
  const rr={live:false,rooms:{"9017":stay(),"9000":stay(),"205":stay()}};
  assert.deepEqual(run(20260903,[],rr).totalFail.map(x=>x.room),["205"]);
});
check("account tax postings do not create paired overcharge warnings", () => {
  const x=run(20260903,[],null,{"9017":{arr:1,auto:2,man:0},"205":{arr:1,auto:2,man:0}});
  assert.deepEqual(x.overcharge.map(x=>x.room),["205"]);
});
check("the tax history view excludes accounts without erasing captured charges", () => {
  const raw={"9017":{"03/09/26":{arr:1,auto:0,man:0}},
             "9605":{"04/09/26":{arr:1,auto:0,man:0}},
             "205":{"03/09/26":{arr:1,auto:0,man:0}},
             "901":{"03/09/26":{arr:1,auto:0,man:0}}};
  const before=JSON.stringify(raw);
  const view=new Function("loadMem",lift("taxRoomKeys")+"\n"+lift("taxMemory")+"\nreturn taxMemory();")(()=>raw);
  assert.deepEqual(Object.keys(view).sort(),["205","901"]);
  assert.equal(JSON.stringify(raw),before);
  assert.strictEqual(view["205"],raw["205"]);
});
console.log(count + " account-tax checks passed");
