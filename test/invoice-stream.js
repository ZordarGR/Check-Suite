const fs=require("fs"), assert=require("assert");
const messages=fs.readFileSync(process.argv[2],"utf8").trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s));
const stable=messages.filter(m=>m.kind==="invoice"&&m.complete);
assert(stable.some(m=>m.data.fields[0]==="TEST GUEST"),"first reservation was read completely");
assert(stable.some(m=>m.data.fields[0]==="SECOND TEST GUEST"&&m.data.rows[1].amount==="-750,00"),"reused Invoice refreshes guest and payments");
assert(stable.every(m=>m.data.rows.length===2&&!JSON.stringify(m).includes("IRRELEVANT A")),"reads B only");
assert(stable.some(m=>m.data.rows[1].label==="UNFAMILIAR PAYMENT"),"any payment label is captured");
const geometry=messages.filter(m=>m.kind==="geometry");
const {layout}=require("../app/arrangement-live");
for(const m of geometry){
 const l=layout(m,r=>r);assert(l,"real native geometry must be usable by the overlay");
 assert.equal(l.grid.x,m.grid.x-m.rect.x);assert.equal(l.grid.y,m.grid.y-m.rect.y);
 assert.equal(l.grid.width,m.grid.width);assert.equal(l.grid.height,m.grid.height);
}
assert(new Set(geometry.map(m=>JSON.stringify(m.rect))).size>=3,"move/maximise/restore changes are followed");
const expectedGrid=fs.readFileSync(process.argv[2]+".grid","utf8").trim().split(/\r?\n/).map(s=>JSON.parse(s));
assert.equal(expectedGrid.length,4,"fixture recorded initial, moved, maximised and restored B grid");
for(const q of expectedGrid){
 assert(geometry.some(m=>m.grid&&["x","y","width","height"].every(k=>m.grid[k]===q[k])),"stream must contain the exact B grid bounds measured independently by the fixture: "+JSON.stringify(q));
}
assert(geometry.every(m=>m.grid&&m.grid.width>0&&m.grid.height>0),"every geometry packet identifies B grid");
console.log("Exact B grid bounds followed across move/maximise/restore");
assert(messages.some(m=>m.kind==="hide"),"minimised invoice hides overlay");
console.log("Real Windows ListView capture, B isolation, geometry and reused guest passed");

const list=fs.readFileSync(process.argv[2]+".list","utf8");
assert(list.includes("IH\tTEST GUEST\t101\t2/0/0/0\t14/09/26\t21/09/26\tCI"),"existing IH columns unchanged: "+JSON.stringify(list));
assert(list.includes("RATE\tIH\tTEST GUEST\t101\t14/09/26\t21/09/26\t150,00\tWEBHOTELIER\tEUR\tCI"),"daily Price and agency reach tagged capture");
console.log("Real Windows IH Price/agency capture passed");
