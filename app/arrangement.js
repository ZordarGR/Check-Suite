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
function reference(inv, refs){
  const a=day(inv.arr), d=day(inv.dep), n=guest(inv.name);
  if(a===null || d===null || !n) return null;
  const found = refs.filter(r=>r.room===inv.room && guest(r.name)===n && day(r.arr)===a && day(r.dep)===d);
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
  if(a===null || d===null || d<=a || d-a>366) return unsure("Stay dates could not be verified");
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
  if(norm(r.currency)!=="EUR") reason="List currency could not be verified";
  else if(missing>0 && !(rate>0)) reason="List price needed for "+missing+" unposted nights";
  if(dates.size!==charges.length) reason="Multiple Arrangement entries on one date";
  if(charges.some(c=>c.date<a || c.date>=d)) reason="Arrangement dates differ from the stay";
  const noPayment=payments===0 && paid===0;
  if(reason){
    // A readable unpaid account remains red even if Price=0; no amount is invented.
    return noPayment ? {state:"unpaid",icon:"✕",text:"No accommodation payment · "+reason,tint:true} : unsure(reason);
  }
  const posted=charges.reduce((sum,c)=>sum+c.amount,0);
  const expected=posted+(missing?missing*rate:0), diff=paid-expected;
  if(!Number.isSafeInteger(expected))return unsure("Accommodation total could not be verified");
  // The established first-night double remains descriptive only: its full amount
  // is already in posted, so it must not add a second charge to the total.
  const first=charges[0], later=charges.slice(1);
  const extra=first && first.date===a && rate>0 && first.amount===rate*2
    && later.every(c=>c.amount===rate) ? 1 : 0;
  const nights=d-a+extra, warnings=[];
  const ordinary=later.length && later.every(c=>c.amount===later[0].amount)
    ? later[0].amount : !later.length && rate>0 ? rate : null;
  if(!extra && first && first.date===a && ordinary>0 && first.amount!==ordinary){
    warnings.push("First night €"+money(first.amount-ordinary)+(first.amount>ordinary?" above ":" below ")
      +(later.length?"later nights":"the list rate"));
  }
  const detail=(extra?" · +1 late-arrival night":"")+(warnings.length?" · "+warnings.join(" · "):"");
  const amounts={paid,expected,nights,rate,diff,posted,missing,warnings};
  if(noPayment) return {state:"unpaid",icon:"✕",text:"No accommodation payment · under €"+money(expected)+detail,tint:true,...amounts};
  if(diff===0) return {state:warnings.length?"warning":"paid",icon:warnings.length?"⚠":"✓",text:"€"+money(paid)+" paid · "+nights+" nights"+detail,tint:false,...amounts};
  return {state:"difference",icon:"✕",text:(diff>0?"Over":"Under")+" €"+money(diff)+detail,tint:false,...amounts};
}
function capture(txt, tag, at){
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
    if(!r || !["IH","AR","DP"].includes(r.tag) || !Number.isFinite(r.at) || day(r.dep)===null || day(r.dep)<now/86400000-60) continue;
    const k=key(r), prev=m.get(k)||[];
    if(!prev.some(x=>JSON.stringify(x)===JSON.stringify(r)))prev.push(r);
    m.set(k,prev);
  }
  const kept=[];
  for(const records of m.values()){
    const latest=Math.max(...records.map(r=>r.at)),top=records.filter(r=>r.at===latest);
    kept.push(...top);
    if(top.some(r=>cents(r.price)===0)){
      const prior=records.filter(r=>r.at<latest&&norm(r.currency)==="EUR"&&cents(r.price)>0);
      const at=Math.max(...prior.map(r=>r.at));
      kept.push(...prior.filter(r=>r.at===at));
    }
  }
  return kept.sort((a,b)=>b.at-a.at).slice(0,10000);
}
module.exports={norm,guest,cents,day,allocation,reference,eligible,evaluate,capture,mergeRefs};
