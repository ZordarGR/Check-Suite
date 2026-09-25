// Cloud only. Synthetic postings; no hotel records.
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('app/index.html','utf8');
const c=vm.createContext({module:{exports:{}}});
vm.runInContext(html.match(/<script id="parser">([\s\S]*?)<\/script>/)[1],c);
const {buildModel,parseReport}=c.module.exports;
const row=(amount,time,extra={})=>({date:'10/09/2026',time,amount,room:'201',guest:'EXAMPLE ALEX',
 user:'IFC',qty:1,sn:'81001',text:'Rec: 81001, Pos: 21, 23',...extra});
const sequence=()=>[row(-6,'20:00'),row(6,'20:30',{guest:'ALEX'}),row(-6,'21:00'),row(6,'21:00'),row(6,'20:00')];
const model=(rows,sections={})=>buildModel({reportDate:'10/09/2026',sections:{'RESTAURANT 24%':{rows,reported:null},...sections}});
const receipt=rows=>model(rows).receipts[0];
const yes=(rows,label)=>assert.equal(receipt(rows).cancelled,true,label);
const no=(rows,label)=>assert.equal(receipt(rows).cancelled,false,label);
const rows=sequence(),original=JSON.stringify(rows),m=model(rows),r=m.receipts[0];
assert.equal(r.cancelled,true);assert.equal(r.voided,false);assert.equal(r.total,6);
assert.equal(r.entries.length,5);assert.equal(m.validation[0].parsed,6);assert.equal(JSON.stringify(rows),original);
yes([...rows].reverse(),'page order cannot change cancellation');
yes(rows.map(x=>({...x,guest:'COMPLETELY DIFFERENT'})),'guest names do not define cancellation identity');
yes([row(6,'20:00'),row(6,'21:00'),row(-6,'21:00')],'single full cancellation with repeated original');
no([row(6,'20:00'),row(6,'21:00')],'repetition without reversal');
no([...rows,row(6,'21:10')],'a later explicit repost is not silently cancelled');
no(rows.map(x=>({...x,amount:x.amount<0?-3:x.amount})),'partial reversal');
no([...rows,row(4,'20:30')],'additional items in the receipt');
no(rows.map((x,i)=>i===0?{...x,user:'NIGHT'}:x),'human corrections are not POS void evidence');
no(rows.map((x,i)=>i===0?{...x,date:'09/09/2026'}:x),'different posting days');
no(rows.map((x,i)=>i===0?{...x,date:''}:x),'missing day');
no(rows.map((x,i)=>i===0?{...x,time:'?'}:x),'unreadable time');
no(rows.map((x,i)=>i===0?{...x,text:'Rec: 81001, Pos: 99'}:x),'different POS reference');
no(rows.map(x=>({...x,text:'Rec: 81001'})),'missing POS reference');
no([row(6,'20:00'),row(6,'20:00'),row(-6,'21:00')],'partial reversal of two same-time items');
const mixed=model(rows,{'RESTAURANT 13%':{rows:rows.map(x=>({...x,amount:x.amount<0?-4:4})),reported:null}});
assert(mixed.receipts[0].cancelled,'all VAT components fully reversed');
const partial=model(rows,{'RESTAURANT 13%':{rows:rows.filter(x=>x.amount>0).map(x=>({...x,amount:4})),reported:null}});
assert(!partial.receipts[0].cancelled,'unreversed VAT component stays active');
const other=model([...rows,row(24,'20:30',{sn:'81002'}),row(6,'21:10',{sn:'81003'}),row(6,'20:30',{room:'202'})]);
assert.deepEqual(Array.from(other.receipts.filter(x=>!x.cancelled),x=>x.sn+'|'+x.roomMain).sort(),['81001|202','81002|201','81003|201']);
const human=receipt([row(6,'20:00'),row(-6,'21:00',{user:'NIGHT'})]);assert(human.voided);assert(!human.cancelled);
yes([row(6,'20:00'),row(-6,'21:00')],'ordinary net-zero cancellation unchanged');
// Exercise date/amount/POS extraction through synthetic XPS glyph rows too.
const glyph=(x,y,text)=>'<Glyphs OriginX="'+x+'" OriginY="'+y+'" UnicodeString="'+text+'"/>';
const xml='<FixedPage>'+glyph(40,20,'RESTAURANT 24%')+rows.map((x,i)=>{
 const y=60+i*20;
 return [[40,x.date],[88,x.time],[120,x.user],[206,x.room],[240,x.guest],[409,'1'],[424,x.text],[715,x.amount<0?'-6,00':'6,00']].map(([px,t])=>glyph(px,y,t)).join('');
}).join('')+'</FixedPage>';
const parsed=parseReport([xml]);assert.equal(parsed.sections['RESTAURANT 24%'].rows.length,5);
assert(buildModel(parsed).receipts[0].cancelled,'real parser supplies cancellation metadata');
console.log('PASS repeated POS cancellation: names, order, split VAT, partials, reposts, identities, source preservation and XPS parser');
