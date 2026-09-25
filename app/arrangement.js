"use strict";
/* Accommodation only. Integer cents, original dates, and explicitly identified payments.
   List metadata is separate from the tax/department ledger: it never changes stay dates. */
const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g," ");
const guest = s => norm(s).replace(/[^\p{L}\p{N}]+/gu," ").trim().split(/\s+/).sort().join(" ");
function cents(s){
  s = String(s ?? "").trim().replace(/\u00a0/g," ");
  if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(s)) return null;
  const n = Number(s.replace(/\./g,"").replace(",",""));
  return Number.isSafeInteger(n) && Math.abs(n) <= 1000000000 ? n : null;
}
function day(s){
  const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(String(s || "").trim());
  if(!m) return null;
  const y = +m[3] + (m[3].length === 2 ? 2000 : 0), mo=+m[2]-1, d=+m[1];
  const t=Date.UTC(y,mo,d), a=new Date(t);
  return a.getUTCFullYear()===y && a.getUTCMonth()===mo && a.getUTCDate()===d ? t/86400000 : null;
}
const money = n => (Math.abs(n)/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2});
const unsure = reason => ({state:"unknown",icon:"🤔",text:reason,tint:false});
function allocation(s){
  return norm(s).replace(/\/R\.NR\.\d+\(\d+\)$/,"").trim();
}

// RG records contain the complete native grid, kept apart from guest-list agencies.
function gridIdentity(header){
  const m=/^(.+?)\s*,\s*room\s+(\d{1,4}(?:-\d{1,4})?)\s*,\s*(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))\s*-\s*(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))\s*$/i.exec(header||"");
  return m?{name:m[1].trim(),room:m[2],arr:m[3],dep:m[4]}:null;
}
function validGrid(g){
  if(!g||g.tag!=="RG"||!["name","room","arr","dep","currency"].every(k=>typeof g[k]==="string")||
     !guest(g.name)||!/^\d{1,4}(?:-\d{1,4})?$/.test(g.room)||!g.currency.trim()||
     !Number.isFinite(g.at)||g.at<0||typeof g.complete!=="boolean"||!Array.isArray(g.rows))return false;
  const a=day(g.arr),d=day(g.dep);
  if(a===null||d===null||d<=a||d-a>20000)return false;
  if(!g.complete)return g.rows.length===0;
  if(g.rows.length!==d-a&&g.rows.length!==d-a+1)return false;
  const dates=new Set();
  for(const row of g.rows){
    if(!Array.isArray(row)||row.length!==16||!row.every(c=>typeof c==="string"))return false;
    const date=day(row[2]),price=cents(row[14]);
    if(date===null||date<a||date>d||dates.has(date)||price===null||price<0||!/^\d{1,4}(?:-\d{1,4})?$/.test(row[3]))return false;
    dates.add(date);
  }
  for(let n=a;n<d;n++)if(!dates.has(n))return false;
  return true;
}
function captureGrid(txt,at){
  const lines=String(txt).trimEnd().split(/\r?\n/).map(s=>s.split("\t"));
  if(lines.some(c=>!["TITLE","GRID","RG","DONE"].includes(c[0])))return [];
  const titles=lines.filter(c=>c[0]==="TITLE"),meta=lines.filter(c=>c[0]==="GRID"),ends=lines.filter(c=>c[0]==="DONE");
  if(titles.length!==1||titles[0].length!==2||titles[0][1]!=="Rate by Day Grid"||meta.length!==1||meta[0].length!==3||ends.length!==1)return [];
  const id=gridIdentity(meta[0][1]),done=ends[0],rows=lines.filter(c=>c[0]==="RG").map(c=>c.slice(1));
  if(!id||done.length!==7||!["pending","complete"].includes(done[6])||!Number.isSafeInteger(+done[1])||!Number.isSafeInteger(+done[2])||+done[1]!==rows.length||+done[2]<1||+done[2]>20001)return [];
  const complete=done[6]==="complete";
  if(complete&&+done[1]!==+done[2])return [];
  const g={tag:"RG",...id,currency:meta[0][2],at,complete,rows};
  return validGrid(g)?[g]:[];
}
function gridReference(inv,refs){
  const found=(refs||[]).filter(r=>r.tag==="RG"&&r.room===inv.room&&guest(r.name)===guest(inv.name)&&day(r.arr)===day(inv.arr)&&day(r.dep)===day(inv.dep));
  if(!found.length)return null;
  const at=Math.max(...found.map(r=>r.at)),top=found.filter(r=>r.at===at);
  if(top.some(r=>!validGrid(r)||!r.complete))return {complete:false};
  const signature=r=>JSON.stringify([norm(r.currency),r.rows.slice().sort((a,b)=>day(a[2])-day(b[2]))]);
  if(new Set(top.map(signature)).size!==1)return {complete:false};
  return top[0];
}
function gridTaxRecords(refs){
  return refs.filter(r=>r.tag==="RG").map(r=>({name:r.name,room:r.room,arr:r.arr,dep:r.dep,at:r.at,complete:r.complete,
    nights:r.complete?r.rows.filter(row=>day(row[2])<day(r.dep)).map(row=>({date:row[2],room:row[3],tax:row[13].split(/[,;\s]+/).some(p=>norm(p)==="TAX")})):[]}));
}

function reference(inv, refs){
  const a=day(inv.arr), d=day(inv.dep), n=guest(inv.name);
  if(a===null || d===null || !n) return null;
  const found = refs.filter(r=>r.tag!=="RG" && r.room===inv.room && guest(r.name)===n && day(r.arr)===a && day(r.dep)===d);
  if(!found.length) return null;
  const latest=Math.max(...found.map(r=>r.at));
  const same=found.filter(r=>r.at===latest);
  if(new Set(same.map(r=>JSON.stringify([r.price,norm(r.agency),r.currency]))).size!==1) return null;
  const result={...same[0]};
  // Checkout may explicitly reset Price to zero. Keep the most recent earlier
  // positive price as evidence; a lone doubled B posting is not a daily rate.
  if(cents(result.price)===0){
    const prior=found.filter(r=>r.at<latest&&norm(r.currency)==="EUR"&&cents(r.price)>0);
    const at=Math.max(...prior.map(r=>r.at));
    const prices=[...new Set(prior.filter(r=>r.at===at).map(r=>cents(r.price)))];
    if(prices.length===1)result.priorRate=prices[0];
  }
  return result;
}
function eligible(inv, ref){
  // The list identifies the reservation's agency. B's allocation/title may be
  // deliberately different and must neither qualify nor exclude that reservation.
  const agency=ref&&norm(ref.agency);
  if(!agency)return null;
  return ["INDIVIDUAL","BOOKING.COM","EXPEDIA","EXPEDIA LODGING PARTNER SERVICES SARL","WEBHOTELIER"].includes(agency);
}
function evaluate(inv, refs){
  if(!inv) return unsure("Reading accommodation entries");
  const r=reference(inv,refs || []), scope=eligible(inv,r);
  if(scope===false) return {state:"outside",tint:false};
  if(scope===null) return unsure("Open this reservation’s guest list to check the agency");
  if(!inv.complete) return unsure("Reading accommodation entries");
  if(norm(inv.currency)!=="EUR") return unsure("Currency could not be verified");
  const a=day(inv.arr), d=day(inv.dep);
  if(a===null || d===null || d<=a || d-a>20000) return unsure("Stay dates could not be verified");
  const grid=gridReference(inv,refs);
  if(grid&&!grid.complete)return unsure("Reopen Rate by Day Grid to finish reading every night");
  if(grid&&norm(grid.currency)!=="EUR")return unsure("Grid currency could not be verified");
  let paid=0, payments=0;
  const charges=[];
  for(const row of inv.rows || []){
    const n=cents(row.amount), label=norm(row.label), date=day(String(row.date || "").trim());
    if(n===null || norm(row.currency)!=="EUR" || date===null) return unsure("An entry could not be read");
    if(label==="*ARRANGEMENT" || label==="ARRANGEMENT"){
      if(n<=0) return unsure("Arrangement adjustment needs checking");
      charges.push({amount:n,date});
    }else if(label && !label.includes("ARRANGEMENT")){
      // Signed postings: negative = money received, positive = reversal/refund.
      paid-=n; if(n<0) payments++;
    }else{
      return unsure("Accommodation adjustment needs checking: "+row.label);
    }
    if(!Number.isSafeInteger(paid)) return unsure("Payment total could not be verified");
  }
  if(paid<0) return unsure("Refunds exceed the recorded payments");
  charges.sort((x,y)=>x.date-y.date);
  let rate=r && norm(r.currency)==="EUR" ? cents(r.price) : null;
  let reason="";
  // A checkout reset may retain an earlier explicit list price. Never infer the
  // price of an unposted night from the invoice's first/last/lowest charge.
  if(rate===0 && r.priorRate>0) rate=r.priorRate;
  const dates=new Set(charges.map(c=>c.date)), missing=d-a-dates.size;
  if(!grid&&norm(r.currency)!=="EUR") reason="List currency could not be verified";
  else if(!grid&&missing>0 && !(rate>0)) reason="List price needed for "+missing+" unposted nights";
  if(dates.size!==charges.length) reason="Multiple Arrangement entries on one date";
  if(charges.some(c=>c.date<a || c.date>=d)) reason="Arrangement dates differ from the stay";
  const noPayment=payments===0 && paid===0;
  if(reason){
    // A readable unpaid account remains red even if Price=0; no amount is invented.
    return noPayment ? {state:"unpaid",icon:"✕",text:"No accommodation payment · "+reason,tint:true} : unsure(reason);
  }
  const posted=charges.reduce((sum,c)=>sum+c.amount,0);
  const expected=grid?grid.rows.filter(row=>day(row[2])<d).reduce((sum,row)=>sum+cents(row[14]),0):posted+(missing?missing*rate:0), diff=paid-expected;
  if(!Number.isSafeInteger(expected))return unsure("Accommodation total could not be verified");
  const nights=d-a, amounts={paid,expected,nights,rate,diff,posted,missing,source:grid?"grid":"formula"};
  if(noPayment) return {state:"unpaid",icon:"✕",text:"No accommodation payment · under €"+money(expected)+(grid?" · Rate by Day Grid":""),tint:true,...amounts};
  if(diff===0) return {state:"paid",icon:"✓",text:"€"+money(paid)+" paid · "+nights+" nights"+(grid?" · Rate by Day Grid":""),tint:false,...amounts};
  return {state:"difference",icon:"✕",text:(diff>0?"Over":"Under")+" €"+money(diff)+(grid?" · Rate by Day Grid":""),tint:false,...amounts};
}
function capture(txt, tag, at){
  if(tag==="RG")return captureGrid(txt,at);
  const lines=String(txt).split(/\r?\n/).map(s=>s.split("\t"));
  const title=lines.find(c=>c[0]==="TITLE")?.[1] || "";
  const d=lines.find(c=>c[0]==="DONE");
  if(!d || d[6]!=="complete" || +d[1]!==+d[2] || lines.some(c=>c[0]==="ERR")) return [];
  const titleOK=tag==="IH" ? /in\s*-?\s*house/i.test(title) : tag==="AR" ? /arrival\s*report/i.test(title) : tag==="DP" && /departure\s*report/i.test(title);
  const reportDate=(title.match(/\b\d{2}\/\d{2}\/(?:\d{4}|\d{2})\b/)||[])[0];
  if(!titleOK || day(reportDate)===null) return [];
  const out=[];
  for(const c of lines){
    if(c[0]!=="RATE" || c[1]!==tag || c.length!==10) continue;
    const [, , name, room, first, second, price, agency, currency, status]=c;
    if(!name || !/^\d{2,4}(?:-\d{1,4})?$/.test(room) || !status || /void|reversal/i.test(status)) continue;
    const arr=tag==="AR"?reportDate:first, dep=tag==="DP"?reportDate:second;
    if(day(arr)===null || day(dep)===null) continue;
    out.push({tag,name,room,arr,dep,price,agency,currency,at});
  }
  return out;
}
function mergeRefs(old, fresh, now=Date.now()){
  const key=r=>JSON.stringify([r.tag,r.room,guest(r.name),day(r.arr),day(r.dep)]);
  const m=new Map();
  for(const r of old.concat(fresh)){
    if(!r || !["IH","AR","DP","RG"].includes(r.tag) || !Number.isFinite(r.at) || day(r.dep)===null || day(r.dep)<now/86400000-60) continue;
    const k=key(r), prev=m.get(k)||[];
    if(!prev.some(x=>JSON.stringify(x)===JSON.stringify(r)))prev.push(r);
    m.set(k,prev);
  }
  const kept=[];
  for(const records of m.values()){
    const latest=Math.max(...records.map(r=>r.at)),top=records.filter(r=>r.at===latest);
    kept.push(...top);
    if(top[0].tag==="RG"){
      const prior=records.filter(r=>r.at<latest&&r.complete);
      const at=Math.max(...prior.map(r=>r.at));
      kept.push(...prior.filter(r=>r.at===at));
    }
    if(top.some(r=>cents(r.price)===0)){
      const prior=records.filter(r=>r.at<latest&&norm(r.currency)==="EUR"&&cents(r.price)>0);
      const at=Math.max(...prior.map(r=>r.at));
      kept.push(...prior.filter(r=>r.at===at));
    }
  }
  return kept.sort((a,b)=>b.at-a.at);
}
module.exports={gridIdentity,validGrid,captureGrid,gridReference,gridTaxRecords,norm,guest,cents,day,allocation,reference,eligible,evaluate,capture,mergeRefs};
