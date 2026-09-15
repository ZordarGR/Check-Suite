const fs=require("fs"), assert=require("assert");
const messages=fs.readFileSync(process.argv[2],"utf8").trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s));
const stable=messages.filter(m=>m.kind==="invoice"&&m.complete);
assert(stable.some(m=>m.data.fields[0]==="TEST GUEST"),"first reservation was read completely");
assert(stable.some(m=>m.data.fields[0]==="SECOND TEST GUEST"&&m.data.rows[1].amount==="-750,00"),"reused Invoice refreshes guest and payments");
assert(stable.every(m=>m.data.rows.length===2&&!JSON.stringify(m).includes("IRRELEVANT A")),"reads B only");
assert(stable.some(m=>m.data.rows[1].label==="UNFAMILIAR PAYMENT"),"any payment label is captured");
const geometry=messages.filter(m=>m.kind==="geometry");
assert(new Set(geometry.map(m=>JSON.stringify(m.rect))).size>=3,"move/maximise/restore changes are followed");
assert(messages.some(m=>m.kind==="hide"),"minimised invoice hides overlay");
console.log("Real Windows ListView capture, B isolation, geometry and reused guest passed");

const list=fs.readFileSync(process.argv[2]+".list","utf8");
assert(list.includes("IH\tTEST GUEST\t101\t2/0/0/0\t14/09/26\t21/09/26\tCI"),"existing IH columns unchanged: "+JSON.stringify(list));
assert(list.includes("RATE\tIH\tTEST GUEST\t101\t14/09/26\t21/09/26\t150,00\tWEBHOTELIER\tEUR\tCI"),"daily Price and agency reach tagged capture");
console.log("Real Windows IH Price/agency capture passed");
