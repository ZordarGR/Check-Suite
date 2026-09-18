/* Cloud-only archive replay integration; all ingestion and persistence functions are
 * lifted from the shipped page. Synthetic captures, no hotel data or native helper. */
"use strict";
const fs=require('fs'),assert=require('assert/strict');
const source=fs.readFileSync('app/index.html','utf8');
function lift(name){
 const at=source.search(new RegExp('\\n(?:async )?function '+name+'\\('));assert(at>=0,name);
 let depth=0;for(let i=source.indexOf('{',at);i<source.length;i++){
  if(source[i]==='{')depth++;else if(source[i]==='}'&&!--depth)return source.slice(at+1,i+1);
 }throw Error('Unclosed '+name);
}
const CURSOR='reccheck_capture_cursor',LEDGER='reccheck_moves_v2',STATUS='reccheck_status_v1';
const BASE=new Date(2026,8,18,12).getTime(),copy=x=>JSON.parse(JSON.stringify(x));
class Clock extends Date{constructor(...args){super(...(args.length?args:[BASE+86400000]));}static now(){return BASE+86400000;}}
function env(captures=[],initial={}){
 const store={...initial},failures=new Set(),calls=[];
 const storage={getItem:k=>store[k]??null,setItem:(k,v)=>{if(failures.has(k))throw Error('Failed '+k);store[k]=String(v);},removeItem:k=>delete store[k]};
 const bridge={async listCaptures(after){calls.push(after);const remaining=captures.filter(c=>c.id>after);return {captures:remaining.slice(0,2),more:remaining.length>2};}};
 const functions=['captureIdParts','replayCapturedBatch','autoReadInhouse','heldOf','hhmm','dkey','dfmt','leadRoom','bnk','pillRoom','dateNum',
  'loadLedger','mvSameName','mvPrevNight','detectMoves','saveMoves','movesApplied','recordMoves','inhouseToRate','isInhouseTitle','inhouseDate','parseInhouse','parseTagged',
  'statusLoad','statusSave','stName','stRoom','stKey','stSameRoom','stDayKey','statusPrune','statusIngest','inhouseCheckedOut','consolidatedInhouseRows','consolidatedInhouseRate',
  'setLiveRate','taxCaptureRate','ingestCaptured','applyInhouse','applyReport','applyMoves','stayFromRow','reportToStays','censusNight','feedStays',
  'loadRooms','saveRooms','mergeRoomsFromDisk','liveNameOf','ingestLiveNames','saveAlerts','pruneAlerts','addAlert','dropAlert'];
 const flushStart=source.indexOf('window.__rcCaptureFlush = async function(){'),flushEnd=source.indexOf('function refreshNames(){',flushStart);
 const body=[
  ...['IH','AR','DP','MV'].map(name=>source.match(new RegExp('^const '+name+' = .*$', 'm'))[0]),
  'const MOVES_KEY="reccheck_moves_v2",MOVES_DONE_KEY="reccheck_moves_applied",STATUS_KEY="reccheck_status_v1",CAPTURE_CURSOR_KEY="reccheck_capture_cursor",ROOMS_KEY="reccheck_rooms";',
  'const STATUS_KEEP_DAYS=15,ALERTS_KEY="reccheck_alerts",ALERTS_DONE_KEY="reccheck_alerts_done",ALERTS_KEEP_NIGHTS=14,ALERTS_MAX=200,LIVE_TAGS=["IH","MV","AR","DP"];',
  'let STATUS_TICK=0,LEDGER_TICK=0,LIVE_AT={},LIVE_HELD={},LIVE_ROWS={},LIVE_ERR={},LIVE_SIG="",RPT_SIG={},RATE=null,TAX=null,MOVES_ROWS=null,MOVES_NIGHT=0,PAIR_OVERRIDE=null,ADJ_OPEN_OVERRIDE=null;',
  'let ROOMS={},ROOMS_DISK_READY=false,ROOMS_DISK_PENDING=null,MODEL=null,NAMES_STALE=false,ALERTS=[],ALERTS_DONE={},SCREEN="home",TAX_SCREEN="home",TAX_MOVES_STALE=false,LIVE_OK=true;',
  'const faults=[],elements={}; const window={reccheckShortcuts:bridge,__rcStorageFaultCount:0,__rcStorageFault:(where,error)=>{window.__rcStorageFaultCount++;faults.push([where,String(error)]);}};',
  'function el(id){return elements[id]||(elements[id]={textContent:""});} function t(k){return k;} function render(){} function paintHeld(){} function showMoveSave(){} function paintAlertsBtn(){} function renderAlerts(){} function bnKey(){return bnk();} function legacyOn(){return false;} function liveStop(){}',
  ...functions.map(lift),source.slice(flushStart,flushEnd),
  'loadRooms();window.__rcLiveNames=ingestLiveNames;window.__rcAlert=addAlert;window.__rcAlertDrop=dropAlert;',
  'return {replay:replayCapturedBatch,poll:autoReadInhouse,window,faults,load:statusLoad,ledger:loadLedger,getRate:()=>RATE,setRate:r=>{RATE=r;},held:()=>LIVE_HELD,rooms:()=>ROOMS,parseInhouse,parseTagged,statusIngest,flush:window.__rcCaptureFlush,applyReport};'
 ].join('\n');
 return {...new Function('localStorage','bridge','Date',body)(storage,bridge,Clock),store,failures,calls,bridge,captures};
}
function text(tag,rows,date='18/09/26',cut=false){
 const title={IH:'Guests inhouse: ',MV:'Perform Move for Date ',AR:'Arrival Report for ',DP:'Departure Report for '}[tag]+date;
 return ['TITLE\t'+title,...rows.map(r=>[tag,...r].join('\t')),['DONE',rows.length,rows.length,1,1,'unicode',cut?'cut-short':'complete'].join('\t')].join('\n');
}
function cap(seq,tag,rows,options={}){
 const at=options.at??BASE+seq*1000;
 return {id:String(seq).padStart(19,'0')+'-'+at+'-'+tag+'-'+'a'.repeat(32)+'.tsv',at,tag,text:text(tag,rows,options.date,options.cut)};
}
const ih=(room,name='ALPHA GUEST',dep='25/09/26')=>[name,room,'1/0/0/0/0','10/09/26',dep,'CI'];
const mv=(from,to,name='ALPHA GUEST',x='X')=>[from,'STD',to,'STD',name,x,'10/09/26','25/09/26'];
async function drain(e){for(let i=0;i<30;i++){if(await e.replay())return;}throw Error('Queue did not drain: '+JSON.stringify(e.faults));}
const cases=[];function test(name,fn){cases.push([name,fn]);}

test('closed-app captures preserve every room through filters and move order',async()=>{
 const captures=[cap(1,'IH',[ih('101'),ih('150','OTHER GUEST')]),cap(2,'MV',[mv('101','102')]),cap(3,'IH',[ih('102')])];
 const e=env(captures);await drain(e);
 assert.equal(e.store[CURSOR],JSON.stringify(captures[2].id));assert.equal(e.ledger()['101']['20260910'].mv,20260918);
 assert.equal(e.ledger()['102']['20260910'].from,'101');assert.equal(e.ledger()['150']['20260910'].n,'OTHER GUEST');
 assert(e.load().IH.rows.some(r=>r.room==='150'));assert.equal(e.load().MV['20260918'].rows[Object.keys(e.load().MV['20260918'].rows)[0]].first,captures[1].at);
 assert.equal(e.calls[1],captures[1].id,'next batch starts at the durable cursor');
});
test('restart resumes after committed capture without reapplying it',async()=>{
 const captures=[cap(1,'IH',[ih('101')]),cap(2,'IH',[ih('102','BETA GUEST')]),cap(3,'IH',[ih('103','GAMMA GUEST')])],first=env(captures);
 assert.equal(await first.replay(),false);const next=env(captures,copy(first.store));await drain(next);
 assert.equal(next.calls[0],captures[1].id);assert.deepEqual(Object.keys(next.ledger()).sort(),['101','102','103']);
});
test('failed status save keeps cursor and retries the same capture',async()=>{
 const captures=[cap(1,'IH',[ih('101')])],e=env(captures);e.failures.add(STATUS);
 assert.equal(await e.replay(),false);assert.equal(e.store[CURSOR],undefined);e.failures.clear();await drain(e);assert.equal(e.ledger()['101']['20260910'].n,'ALPHA GUEST');
});
test('partial application and unchanged room names retry their failed persistence',async()=>{
 const captures=[cap(1,'IH',[ih('101')])],e=env(captures);e.failures.add('reccheck_rooms');
 assert.equal(await e.replay(),false);assert(e.store[STATUS]);assert(e.store[LEDGER]);assert.equal(e.store[CURSOR],undefined);
 e.failures.clear();await drain(e);assert.equal(JSON.parse(e.store.reccheck_rooms)['101'].guest,'ALPHA GUEST');assert.equal(e.store[CURSOR],JSON.stringify(captures[0].id));
});
test('failed cursor commit is idempotent across a renderer restart',async()=>{
 const captures=[cap(1,'IH',[ih('101')]),cap(2,'MV',[mv('101','102')]),cap(3,'IH',[ih('102')])],first=env(captures);first.failures.add(CURSOR);
 assert.equal(await first.replay(),false);assert.equal(first.store[CURSOR],undefined);const next=env(captures,copy(first.store));await drain(next);
 assert.equal(next.ledger()['101']['20260910'].mv,20260918);assert.equal(next.ledger()['102']['20260910'].from,'101');assert.equal(next.load().IH.rows.filter(r=>r.room==='101').length,1);
});
test('corrupt cursor bytes are retained and prevent queue or latest reads',async()=>{
 for(const raw of ['{broken','null','42','"../capture.tsv"']){
  const e=env([cap(1,'IH',[ih('101')])],{[CURSOR]:raw});let latest=0;e.bridge.listFile=async()=>{latest++;return null;};
  await e.poll();assert.equal(e.store[CURSOR],raw);assert.equal(e.calls.length,0);assert.equal(latest,0);assert(e.faults.length);
 }
});
test('incomplete archived capture blocks acknowledgement without discarding later evidence',async()=>{
 const captures=[cap(1,'IH',[ih('101')],{cut:true}),cap(2,'IH',[ih('102')])],e=env(captures);
 assert.equal(await e.replay(),false);assert.equal(e.store[CURSOR],undefined);assert.equal(e.store[STATUS],undefined);assert.equal(e.captures.length,2);
});
test('historical same-day captures add missing rooms without replacing current Tax dates',async()=>{
 const old=cap(1,'IH',[ih('101','ALPHA GUEST','20/09/26'),ih('150','OTHER GUEST')]),fresh=cap(9,'IH',[ih('101','ALPHA GUEST','25/09/26')]),e=env([old]);
 e.statusIngest('IH',e.parseInhouse(fresh.text),fresh.at);e.store[LEDGER]=JSON.stringify({'101':{'20260910':{n:'ALPHA GUEST',d:20260925,seen:20260918}}});
 const current={live:true,dateKey:20260918,rooms:{'101':{name:'ALPHA GUEST',arr:'10/09/26',dep:'25/09/26'}},all:{'101':[{room:'101',name:'ALPHA GUEST',arr:'10/09/26',dep:'25/09/26'}]}};e.setRate(current);
 await drain(e);assert.equal(e.ledger()['101']['20260910'].d,20260925);assert.equal(e.getRate().rooms['101'].dep,'25/09/26');assert(e.load().IH.rows.some(r=>r.room==='150'));assert.equal(e.load().IH.at,fresh.at);
});
test('future report date does not stamp its history into the future',async()=>{
 const capture=cap(1,'DP',[['ALPHA GUEST','101','1/0/0/0/0','10/09/26','CO']],{date:'25/09/26'}),e=env([capture]);await drain(e);
 assert.equal(e.ledger()['101']['20260910'].d,20260925);assert.equal(e.ledger()['101']['20260910'].seen,20260918);assert.equal(e.load().DP['20260925'].at,capture.at);
});
test('complete empty filter is acknowledged and does not remove known guests',async()=>{
 const captures=[cap(1,'IH',[ih('101')]),cap(2,'IH',[])],e=env(captures);await drain(e);
 assert.equal(e.ledger()['101']['20260910'].n,'ALPHA GUEST');assert.equal(e.load().IH.rows.length,1);assert.equal(e.store[CURSOR],JSON.stringify(captures[1].id));
});
test('monotonic IDs consume captures even when their wall clock moves backwards',async()=>{
 const captures=[cap(1,'IH',[ih('101')]),cap(2,'IH',[ih('150','OTHER GUEST')],{at:BASE-1000})],e=env(captures);await drain(e);
 assert.equal(e.store[CURSOR],JSON.stringify(captures[1].id));assert(e.ledger()['101']);assert(e.ledger()['150']);assert.equal(e.load().IH.at,captures[0].at);
});
test('import block pauses replay before reads and before acknowledging an in-flight read',async()=>{
 const e=env([cap(1,'IH',[ih('101')])]);e.window.__rcImportBlocked=true;assert.equal(await e.replay(),false);assert.equal(e.calls.length,0);
 e.window.__rcImportBlocked=false;let finish;e.bridge.listCaptures=()=>new Promise(r=>{finish=r;});const pending=e.replay();e.window.__rcImportBlocked=true;
 finish({captures:e.captures,more:false});assert.equal(await pending,false);assert.equal(e.store[CURSOR],undefined);assert.equal(e.store[STATUS],undefined);
});
test('latest polling waits for all archive batches and cannot overlap itself',async()=>{
 const captures=[cap(1,'IH',[ih('101')]),cap(2,'IH',[ih('102','BETA GUEST')]),cap(3,'IH',[ih('103','GAMMA GUEST')])],e=env(captures);let latest=0;
 e.bridge.listFile=async()=>{latest++;return null;};await e.poll();assert.equal(latest,0);await e.poll();assert.equal(latest,4);
 let finish;e.bridge.listCaptures=()=>new Promise(r=>{finish=r;});const pending=e.poll();await e.poll();finish({captures:[],more:false});await pending;assert.equal(latest,8);
});
test('flush failure holds cursor and retries without losing resolved move alerts',async()=>{
 const captures=[cap(1,'MV',[mv('101','102','ALPHA GUEST','')])],e=env(captures);e.failures.add('reccheck_alerts');
 assert.equal(await e.replay(),false);assert.equal(e.store[CURSOR],undefined);e.failures.clear();await drain(e);
 assert.equal(JSON.parse(e.store.reccheck_alerts).length,1);assert.equal(e.store[CURSOR],JSON.stringify(captures[0].id));
});
(async()=>{let failed=0;for(const [name,fn]of cases){try{await fn();console.log('PASS '+name);}catch(e){failed++;console.log('FAIL '+name+'\n  '+e.stack);}}console.log(JSON.stringify({suite:'capture-replay',total:cases.length,passed:cases.length-failed,failed}));process.exitCode=failed?1:0;})();
