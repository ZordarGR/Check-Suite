/* Synthetic XPS glyph fixtures only. Cloud-only regression of posting vs print dates. */
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync('app/index.html','utf8');
function lift(name){
 const m=new RegExp('\\n(?:async )?function '+name+'\\(').exec(src);assert(m,name);
 for(let end=src.indexOf('}',m.index);end!==-1;end=src.indexOf('}',end+1)){
  const s=src.slice(m.index+1,end+1);try{new vm.Script(s);return s;}catch(e){}
 }throw Error(name);
}
const c=vm.createContext({});
vm.runInContext('const RE_ROOM=/^\\d{2,4}(-\\d{1,4})?$/;const TA_MARK="ΑΝΘΕΚΤΙΚ",ARR_MARK="Arrangement";\n'+
 ['toRows','pagesToTokens','taxPageTokens','dkey','leadRoom','taIsAuto','parseTax'].map(lift).join('\n'),c);
const glyph=(x,y,t)=>({x,y,t});
const head=(room,day='25/9/2026')=>[glyph(184,97.6,day),glyph(40,145.6,room),glyph(52.8,164,'Date'),glyph(104,164,'Time'),glyph(136,164,'Department & Comments'),glyph(412,164,'Guest Name'),glyph(656,164,'Total Amount')];
function charge(y,day,text,joined=false,amount='10,00'){
 return [glyph(42.56,y,day+(joined?'02:04'+amount+'SYNTHETIC':'')),glyph(178.08,y-.6,text),glyph(412,y-.6,'SYNTHETIC GUEST'),...joined?[]:[glyph(104,y-.6,'02:04'),glyph(693,y,amount)]];
}
const page=(room,day='24/09/26',joined=false,printed='25/9/2026')=>[
 ...head(room,printed),...charge(181.6,day,'*Arrangement',joined),...charge(196.64,day,'*ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ',joined)];
const parse=pages=>c.parseTax(c.pagesToTokens(pages,true));
const pages=[page('101'),page('102','24/09/26',true)];
assert(c.parseTax(c.pagesToTokens(pages)).ambiguous,'original flattening reproduces next-page print-date rejection');
let r=parse(pages);
assert(!r.uncertain);assert.equal(r.dateKey,20260924);assert.equal(r.totalRooms,2);assert.equal(r.totalArrangements,2);
for(const room of ['101','102'])assert.deepEqual(JSON.parse(JSON.stringify(r.rooms[room])),{arr:1,auto:1,man:0});
assert(parse([page('101'),page('102','23/09/26',true)]).uncertain,'joined rows on another posting night still reject');
assert(parse([page('101','31/09/26')]).uncertain,'invalid calendar date rejects');
assert(parse([page('101'),page('102','??',true)]).uncertain,'unreadable tax row date cannot borrow another room date');
assert(parse([page('101').filter(g=>g.x!==42.56)]).uncertain,'missing posting date cannot fall back to print date');
for(const joined of [false,true]){
 r=parse([[...head('101'),...charge(181.6,'24/09/26','*Arrangement',joined),...charge(196.64,'24/09/26','*ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ',joined,'-10,00')]]);
 assert(!r.uncertain,'reversals must not reject the whole report');assert(r.rooms['101'].reversal&&r.rooms['101'].uncertain);
}
r=parse([page('101','24/09/2026',true)]);assert.equal(r.dateKey,20260924);assert(!r.uncertain,'four-digit year before joined time');
r=parse([page('101','24/9/26',true)]);assert.equal(r.dateKey,20260924);assert(!r.uncertain,'single digit month inside report');
r=parse([page('101'),[glyph(184,97.6,'26/9/2026'),...charge(181.6,'24/09/26','*ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ',true)]]);
assert(!r.uncertain);assert.equal(r.rooms['101'].auto,2,'continuation pages preserve their current room');
r=parse([page('101').map(g=>g.x===412&&g.y>170?{...g,t:'23/09/26'}:g)]);assert(!r.uncertain,'a date in the guest column is not a posting date');
r=parse([page('101'),page('101','24/09/26',true)]);assert.equal(r.rooms['101'].arr,2);assert.equal(r.rooms['101'].auto,2);
assert.equal(c.pagesToTokens([[glyph(1,1,'25/9/2026')]])[0],'25/9/2026','non-tax flattening unchanged');
for(const room of ['9000','9010','9999','8999','999']){
 r=parse([[...head(room),...charge(181.6,'24/09/26','*Arrangement',true,'-100,00')],page('102')]);
 assert(!r.uncertain);assert(r.rooms[room].reversal&&r.rooms[room].uncertain);
 assert(!r.rooms['102'].uncertain,'another room is unaffected by a reversal');
}
console.log('PASS tax posting columns: next-day page headers, joined date/time/amount, all rooms and counts, mixed/invalid/missing dates, room-specific reversal flags, continuation pages, guest-column dates and default flattening');
