/* Adversarial integrity audit. Cloud only: never run on the hotel PC.
 * Every tested implementation is extracted from the shipped app/index.html.
 * Failures are intentional audit findings, not assertions of broken behavior.
 * Run: node test/audit-receipt-tax.js
 */
'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync('app/index.html', 'utf8');
const results = [];
function lift(name) {
  const re = new RegExp('\\n(?:async )?function ' + name + '\\('), m = re.exec(src);
  if (!m) throw new Error('Missing shipped function: ' + name);
  const start = m.index + 1;
  for (let end = src.indexOf('}', start); end !== -1; end = src.indexOf('}', end + 1)) {
    const code = src.slice(start, end + 1);
    try { new vm.Script(code); return code; } catch (_) {}
  }
  throw new Error('Cannot extract shipped function: ' + name);
}
function context(names, values = {}, setup = '') {
  const c = vm.createContext(Object.assign({console}, values));
  vm.runInContext(setup + '\n' + names.map(lift).join('\n'), c);
  return c;
}
function memory(initial = {}) {
  const data = Object.assign({}, initial);
  return {data, getItem(k) { return data[k] === undefined ? null : data[k]; },
    setItem(k,v) { data[k] = String(v); }, removeItem(k) { delete data[k]; }};
}
async function check(id, label, fn) {
  try { await fn(); results.push({id, label, pass:true}); console.log('PASS ' + id + ' ' + label); }
  catch (e) { results.push({id, label, pass:false, error:e.message}); console.log('FAIL ' + id + ' ' + label + '\n  ' + e.message); }
}
const parser = vm.createContext({module:{exports:{}}});
vm.runInContext(src.match(/<script id="parser">([\s\S]*?)<\/script>/)[1], parser);
const {buildModel} = parser.module.exports;
const row = extra => Object.assign({time:'20:00',user:'IFC',room:'205',guest:'ALPHA TEST',qty:1,amount:10,sn:'1001',text:'Rec: 1001'},extra);
function model(rows, extraSections = {}) {
  return buildModel({reportDate:'18/09/2026',sections:Object.assign({'BAR 24%':{rows,reported:null}},extraSections)});
}
function receiptContext(m, state) {
  return context(['receiptStateValid','receiptStorageFault','rKey','receiptFingerprint','rState','setRState','saveState','effSN','effRoom','corrHasValues','effRates','effTotal','statusOf','checkableList','extraTotal','activeExtras','extrasOf','extrasSum'],
    {STATE_BLOCKED_SOURCES:[],MODEL:m, STATE:state || {date:'18/09/2026',receipts:{},extras:[]}, localStorage:memory(), stateKey:'reccheck_18/09/2026'});
}
const ihRow = (room,name,arr='17/09/26',dep='21/09/26',status='CI') => [name,'',room,'','2',arr,dep,'','','','',status];
function taxContext() {
  const els = {};
  return context(['dkey','pillRoom','inhouseToRate','isInhouseTitle','inhouseDate','applyInhouse','taxRoomKeys','taxCaptureRate','setLiveRate','taxAccountBounds','rateGridTaxWarning','crossReference','decidePairing','deriveStatus'],
    {IH:{NAME:0,ROOM:2,OCC:4,ARR:5,DEP:6,STATUS:11},RATE:null,TAX:null,PAIR_OVERRIDE:null,ADJ_OPEN_OVERRIDE:null,
      LIVE_SIG:'',LEDGER_TICK:0,MOVES_ROWS:null, window:{},
      t:x=>x,el:id=>(els[id] || (els[id]={})),saveMoves:()=>({res:0}),showMoveSave:()=>{},render:()=>{},statusLoad:()=>({})});
}
function savedTaxContext(){
  const c=taxContext();Object.assign(c,{localStorage:memory(),STATUS_KEY:'reccheck_status_v1',STATUS_TICK:0,statusPrune:()=>{}});
  vm.runInContext(['leadRoom','stName','stRoom','stKey','stSameRoom','statusLoad','statusSave','statusIngest','inhouseCheckedOut','consolidatedInhouseRows','consolidatedInhouseRate'].map(lift).join('\n'),c);
  return c;
}
const capture = rows => ({title:'Guests inhouse: 18/09/26',rows,done:{got:rows.length,rows:rows.length,cut:false}});
const charges = rooms => ({kind:'tax',fileDate:'18/09/26',dateKey:20260918,totalRooms:Object.keys(rooms).length,rooms});
function memContext(storage = memory()) {
  return context(['dkey','dnum','taxStoreValid','taxStoreRead','taxStoreWrite','loadMem','saveMem','pruneRoom','ingestTax','roomBalance','recentDates','deriveStatus'],
    {localStorage:storage,MEM_KEY:'ta_check_memory_v2',t:x=>x});
}
function taxParser() {
  return context(['dkey','leadRoom','taIsAuto','parseTax'],{},
    'const RE_ROOM=/^\\d{2,4}(-\\d{1,4})?$/; const TA_MARK="ΑΝΘΕΚΤΙΚ"; const ARR_MARK="Arrangement";');
}
function deferred() { let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}; }

(async () => {
  await check('receipt-cent-sums','Cents sum exactly across rates and departments',()=>{
    const m=model([row({amount:0.1}),row({amount:0.2})],{'BAR 13%':{rows:[row({amount:0.3})],reported:null}});
    assert.equal(m.receipts.length,1); assert.equal(m.receipts[0].total,0.6);
  });
  await check('receipt-interface-reversal','Exact IFC positive/negative reversal is excluded',()=>{
    const m=model([row(),row({amount:-10})]); assert.equal(m.receipts[0].cancelled,true);
    assert.equal(receiptContext(m).checkableList().length,0);
  });
  await check('receipt-human-consolidation','Human exact consolidation is VOID, not a live receipt',()=>{
    const m=model([row(),row({amount:-10,user:'NIGHT'})]); assert.equal(m.receipts[0].voided,true);
    assert.equal(receiptContext(m).checkableList().length,0);
  });
  await check('receipt-room-identity','Identical serial in different rooms remains separately checkable',()=>{
    const m=model([row(),row({room:'206'})]); const c=receiptContext(m);
    assert.equal(m.receipts.length,2); c.setRState(m.receipts[0],{status:'ok',corr:null});
    assert.equal(c.rState(m.receipts[1]).status,'pending');
  });
  await check('receipt-changed-amount','A changed report amount invalidates its earlier checked status',()=>{
    const c=receiptContext(model([row()])); c.setRState(c.MODEL.receipts[0],{status:'ok',corr:null});
    c.MODEL=model([row({amount:99})]); assert.notEqual(c.rState(c.MODEL.receipts[0]).status,'ok');
  });
  await check('receipt-changed-guest','A different guest on the same serial/room cannot inherit confirmation',()=>{
    const c=receiptContext(model([row()])); c.setRState(c.MODEL.receipts[0],{status:'ok',corr:null});
    c.MODEL=model([row({guest:'BETA TEST'})]); assert.notEqual(c.rState(c.MODEL.receipts[0]).status,'ok');
  });
  await check('receipt-date-normalization','Equivalent report date formatting preserves the same saved checks',()=>{
    const state={date:'8/9/2026',receipts:{'BAR|1001|205':{status:'ok',corr:null}},extras:[]};
    const s=memory({'reccheck_8/9/2026':JSON.stringify(state)});
    const c=context(['blankState','receiptStateValid','receiptStorageFault','loadState'],{STATE_BLOCKED_SOURCES:[],localStorage:s,stateKey:''});
    const loaded=c.loadState('08/09/2026');assert.equal(loaded.receipts['BAR|1001|205']?.status,'ok');
  });
  await check('receipt-cross-dept-primary','Changing department shares cannot silently lose a saved room correction',()=>{
    const c=receiptContext(model([row({amount:12})],{'RESTAURANT 24%':{rows:[row({amount:8})],reported:null}}));
    c.setRState(c.MODEL.receipts[0],{status:'corrected',corr:{room:'210'}});
    c.MODEL=model([row({amount:8})],{'RESTAURANT 24%':{rows:[row({amount:12})],reported:null}});
    const st=c.rState(c.MODEL.receipts[0]);assert.equal((st.heldCorrection||st.corr).room,'210');
    assert.ok(st.sourceChanged);assert.equal(c.effRoom(c.MODEL.receipts[0]),'205');
  });
  await check('receipt-manual-then-posted','Later posted manual receipt cannot silently double count total',()=>{
    const c=receiptContext(model([row()])); c.STATE.extras=[{sn:'1001',room:'205',guest:'ALPHA TEST',dept:'BAR',v24:10,v13:0}];
    // Execute the shipped summary. Fake DOM records the numeric grand-total output.
    const values=[]; const node=()=>({style:{},append(){},classList:{add(){}}});
    c.$=()=>node();c.t=x=>x;c.TARGET_DEPTS=['BAR'];c.numToMoney=x=>String(x);
    c.el=(tag,cls,text)=>{if(cls==='val')values.push(text);return node();};
    vm.runInContext(lift('renderSummary'),c);c.renderSummary(); assert.equal(values[0],'10');
  });
  await check('receipt-correction-prefill','Reopening correction uses saved amounts and saved serial',()=>{
    const c=receiptContext(model([row()]));const r=c.MODEL.receipts[0];
    c.setRState(r,{status:'corrected',corr:{sn:'2002',v24:7,v13:3}});
    let modal=''; const els={}; c.openModal=s=>{modal=s;};c.$=id=>els[id]||(els[id]={addEventListener(){}});
    c.t=x=>x;c.closeModal=()=>{};c.setTimeout=()=>{};c.escapeHtml=s=>String(s);
    vm.runInContext(['moneyField','readMoney','openCorrectionModal'].map(lift).join('\n'),c);
    c.openCorrectionModal(r);
    assert.match(modal, /id="cV24"[^>]*value="7"/);assert.match(modal,/id="cV13"[^>]*value="3"/);
    assert.match(modal,/id="cSN"[^>]*value="2002"/);
  });
  await check('receipt-invalid-money','Missing parsed amount cannot be silently classified as cancellation',()=>{
    const toks=(pairs)=>({toks:pairs.map(([x,t])=>({x,t}))});
    const rows=[toks([[10,'BAR 24%']]),toks([[10,'18/09/2026'],[80,'20:00'],[120,'IFC'],[160,'205'],[240,'ALPHA TEST'],[410,'1'],[450,'Rec: 1001'],[710,'?']])];
    const c=context(['parseReport'],{pageRows:()=>rows,SEC_RE:/^[A-ZΑ-Ω0-9 %]+$/,MONEY_RE:/^-?\d{1,3}(?:\.\d{3})*,\d{2}$/,moneyToNum:parser.module.exports.moneyToNum});
    let p;try{p=c.parseReport(['fake']);}catch(_){return;}
    let r;try{r=buildModel(p).receipts[0];}catch(_){return;}
    assert.ok(!r || !r.cancelled,'unreadable amount became zero-valued cancelled receipt');
  });
  await check('receipt-history-filter','A smaller same-night report cannot erase previously captured guest extras',()=>{
    const s=memory(),c=context(['loadNightReceipts','saveNightReceipts','prevNightKey'],{localStorage:s,RECEIPTS_KEY:'reccheck_receipts_v1',RECEIPTS_KEEP:15});
    c.saveNightReceipts(20260918,[['205','ALPHA TEST'],['206','BETA TEST']]);
    c.saveNightReceipts(20260918,[['205','ALPHA TEST']]);
    assert.ok(c.loadNightReceipts()['20260918'].some(x=>x[0]==='206'));
  });
  await check('tax-full-census','Full census flags every occupied missing-tax room',()=>{
    const c=taxContext();c.applyInhouse(capture([ihRow('205','ALPHA TEST'),ihRow('206','BETA TEST')]),true);
    const x=c.crossReference(c.RATE,charges({}));assert.equal(x.totalFail.length,2);
  });
  await check('tax-filtered-census','Filtered IH capture cannot remove an occupied missing-tax room',()=>{
    const c=taxContext();c.applyInhouse(capture([ihRow('205','ALPHA TEST'),ihRow('206','BETA TEST')]),true);
    c.applyInhouse(capture([ihRow('205','ALPHA TEST')]),true);
    const x=c.crossReference(c.RATE,charges({}));assert.ok([...x.totalFail,...(x.uncertain||[])].some(x=>x.room==='206'));
  });
  await check('tax-cut-census','Explicit cut-short IH capture does not overwrite tax census',()=>{
    const c=taxContext();c.applyInhouse(capture([ihRow('205','ALPHA TEST'),ihRow('206','BETA TEST')]),true);
    const partial=capture([ihRow('205','ALPHA TEST')]);partial.done.cut=true;c.applyInhouse(partial,true);
    assert.equal(c.RATE.count,2);
  });
  await check('tax-turnover-order','Tax obligation survives CI arriving row followed by CO departure row',()=>{
    const c=taxContext();c.applyInhouse(capture([ihRow('205','NEW TEST','18/09/26','22/09/26','CI'),ihRow('205','OLD TEST','12/09/26','18/09/26','CO')]),true);
    assert.equal(c.crossReference(c.RATE,charges({})).totalFail.length,1);
  });
  await check('tax-turnover-other-order','Reverse turnover row order still detects occupancy',()=>{
    const c=taxContext();c.applyInhouse(capture([ihRow('205','OLD TEST','12/09/26','18/09/26','CO'),ihRow('205','NEW TEST','18/09/26','22/09/26','CI')]),true);
    assert.equal(c.crossReference(c.RATE,charges({})).totalFail.length,1);
  });
  await check('tax-no-departure','Unreadable departure cannot silently exclude an otherwise occupied CI room',()=>{
    const c=taxContext();c.applyInhouse(capture([ihRow('205','ALPHA TEST','17/09/26','','CI')]),true);
    const x=c.crossReference(c.RATE,charges({}));assert.ok(x.totalFail.length || x.uncertain?.length,'room silently classified not owed');
  });
  await check('tax-account-filter','Guest accounts do not pollute physical-room tax census',()=>{
    const c=taxContext();c.applyInhouse(capture([ihRow('205','ALPHA TEST'),ihRow('9017','BETA TEST')]),true);
    assert.equal(c.RATE.count,1);assert.equal(c.RATE.rooms['9017'],undefined);
  });
  await check('tax-pairing-new-day','New business-day census cannot inherit a pairing decision for a different census',()=>{
    const c=taxContext();c.applyInhouse(capture([ihRow('205','ALPHA TEST')]),true);
    c.TAX=charges({});c.PAIR_OVERRIDE={mode:'paired',night:20260918};
    const next=capture([ihRow('206','BETA TEST','19/09/26','22/09/26')]);next.title='Guests inhouse: 19/09/26';
    c.applyInhouse(next,true);assert.notEqual(c.decidePairing().state,'paired');
  });
  await check('tax-calendar-validation','Impossible source calendar date is rejected',()=>{
    const c=taxContext();assert.equal(c.dkey('31/02/26'),0);
  });
  await check('tax-memory-omitted-room','Loading a filtered tax file retains entirely omitted room memory',()=>{
    const c=memContext();c.ingestTax(charges({'205':{arr:1,auto:1,man:0},'206':{arr:1,auto:0,man:0}}));
    c.ingestTax(charges({'205':{arr:1,auto:1,man:0}}));assert.ok(c.loadMem()['206']);
  });
  await check('tax-memory-replay','Older same-night tax snapshot cannot erase later automatic posting without warning',()=>{
    const c=memContext();c.ingestTax(charges({'205':{arr:1,auto:1,man:0}}));
    c.ingestTax(charges({'205':{arr:1,auto:0,man:0}}));const e=c.loadMem()['205']['18/09/26'];
    assert.ok(e.auto===1||(e.uncertain&&e.versions.some(v=>v.auto===1)),'earlier automatic posting disappeared without preserved conflict evidence');
  });
  await check('tax-classification-changed-facts','No-arrangement checkout mark cannot hide subsequently posted missing-auto tax',()=>{
    const s=memory({'ta_check_memory_v2':JSON.stringify({'205':{'18/09/26':{arr:0,auto:0,man:1,manual:'checkout'}}})});
    const c=memContext(s);c.ingestTax(charges({'205':{arr:1,auto:0,man:1}}));
    assert.ok(['red','amber'].includes(c.deriveStatus(c.loadMem()['205']['18/09/26'])[0]));
  });
  await check('tax-memory-idempotence','Rereading same tax file does not duplicate charges',()=>{
    const c=memContext(),t=charges({'205':{arr:1,auto:1,man:0}});c.ingestTax(t);const before=JSON.stringify(c.loadMem());c.ingestTax(t);
    assert.equal(JSON.stringify(c.loadMem()),before);assert.equal(c.roomBalance(c.loadMem(),'205').bal,0);
  });
  await check('tax-date-separation','Tax report containing two posting dates does not combine both under one date',()=>{
    const c=taxParser(),t=c.parseTax(['205','Date','17/09/26','Arrangement','* ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ','18/09/26','Arrangement','* ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ']);
    assert.ok(t.ambiguous || t.byDate || t.rooms['205'].arr!==2,'two nights collapsed under '+t.fileDate);
  });
  await check('tax-missing-date','Undated tax file cannot enter saved memory under null',()=>{
    const c=taxParser(),m=memContext(),t=c.parseTax(['205','Date','Arrangement','* ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ']);m.ingestTax(t);
    assert.equal(m.loadMem()['205']?.null,undefined);
  });
  await check('tax-signed-reversal','Negative automatic-tax reversal cannot count as another positive posting',()=>{
    const c=taxParser(),t=c.parseTax(['205','Date','18/09/26','Arrangement','100,00','* ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ','10,00','* ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ','-10,00']);
    assert(!t.uncertain,'a reversal must not block unrelated rooms');assert(t.rooms['205'].uncertain&&t.rooms['205'].reversal,'reversal must not become a verified positive tax total');
  });
  await check('tax-room-reversal-history','Reversal warning survives reload, retains previous evidence and excludes 9xxx accounts',()=>{
    const p=taxParser(),m=memContext();
    const first=charges({'205':{arr:1,auto:1,man:0},'206':{arr:1,auto:1,man:0}});
    assert(m.ingestTax(first));
    const parsed=p.parseTax(['205','Date','18/09/26','Arrangement','100,00','* ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ','-10,00',
      '206','Date','18/09/26','Arrangement','100,00','* ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ','10,00',
      '9010','Date','18/09/26','Arrangement','-100,00']);
    assert(m.ingestTax(parsed));const saved=m.loadMem();
    assert(saved['205']['18/09/26'].reversal&&saved['205']['18/09/26'].uncertain);
    assert(saved['205']['18/09/26'].versions.some(v=>v.arr===1&&v.auto===1&&!v.reversal),'earlier verified snapshot retained even when counts match');
    assert(!saved['206']['18/09/26'].uncertain);assert(saved['9010']['18/09/26'].reversal,'account evidence retained');
    assert(m.roomBalance(saved,'205').uncertain);assert.match(m.deriveStatus(saved['205']['18/09/26'])[1],/Reversed charges/);
    const c=taxContext();c.applyInhouse(capture([ihRow('205','ALPHA TEST'),ihRow('206','BETA TEST'),ihRow('9010','ACCOUNT')]),true);
    const result=c.crossReference(c.RATE,parsed);
    assert.equal(result.okCount,1);assert.deepEqual(Array.from(result.uncertain,x=>x.room),['205']);
    assert.match(result.uncertain[0].reason,/Reversed charges/);assert.equal(result.overcharge.length,0);
    vm.runInContext(lift('taxUncertainties'),c);
    const warnings=c.taxUncertainties(saved);assert.deepEqual(Array.from(warnings,x=>x.room),['205']);assert.match(warnings[0].reason,/Reversed charges/);
    const before=JSON.stringify(saved);m.ingestTax(parsed);assert.equal(JSON.stringify(m.loadMem()),before,'same import does not grow versions');
    const clean=charges({'205':{arr:1,auto:1,man:0}});m.ingestTax(clean);
    assert(m.loadMem()['205']['18/09/26'].reversal,'a later filtered clean report cannot silently erase reversal evidence');
  });
  await check('tax-reversal-scope-repair','Scoped department-only reread repairs old broad warnings without deleting evidence or real conflicts',()=>{
    const m=memContext(),day='18/09/26',old={arr:1,auto:1,man:0,manual:'arrival',uncertain:true,reversal:true,versions:[]};
    const initial={};for(const room of ['205','206','207','208','209','210'])initial[room]={[day]:JSON.parse(JSON.stringify(old))};
    initial['206'][day].reversalScope='tax';
    initial['207'][day].versions=[{arr:2,auto:1,man:0}];
    initial['210'][day].versions=[{arr:1,auto:1,man:0,reversal:true,reversalScope:'tax'}];
    m.saveMem(initial);
    const rooms={};for(const room of Object.keys(initial))rooms[room]={arr:1,auto:1,man:0,reversalScope:'tax',otherReversal:true};
    rooms['208'].arr=2;delete rooms['209'].otherReversal;
    assert(m.ingestTax(charges(rooms)));let saved=m.loadMem();
    assert(!saved['205'][day].uncertain&&!saved['205'][day].reversal);
    assert.equal(saved['205'][day].manual,'arrival');
    assert(saved['205'][day].versions.some(v=>v.reversal&&!v.reversalScope),'original warning evidence retained');
    for(const room of ['206','207','208','209','210'])assert(saved[room][day].uncertain&&saved[room][day].reversal,room+' must retain genuine or unverified uncertainty');
    assert.equal(saved['206'][day].reversalScope,'tax');
    const before=JSON.stringify(saved);m.ingestTax(charges(rooms));assert.equal(JSON.stringify(m.loadMem()),before);
  });
  await check('tax-departure-coverage-order','Departure-day and historical-night checks precede missing-current-list warnings',()=>{
    const c=taxContext(),rooms={},taxRooms={};
    for(const room of ['101','102','103','104']){
      rooms[room]={room,name:'SYNTHETIC '+room,arr:'18/09/26',dep:'25/09/26',adjoining:false};
      taxRooms[room]={arr:1,auto:1,man:0};
    }
    const rate={dateKey:20260925,rooms,coverageMissing:Object.keys(rooms)},tax={dateKey:20260924,rooms:taxRooms};
    const before=JSON.stringify({rate,tax});
    let x=c.crossReference(rate,tax);assert.equal(x.okCount,4);assert.equal(x.uncertain.length,0);assert.equal(x.notOwed,0,'departure morning still owes the preceding night');
    x=c.crossReference(rate,{dateKey:20260925,rooms:{}});assert.equal(x.notOwed,4);assert.equal(x.uncertain.length,0);assert.equal(x.totalFail.length,0,'no charge on departure night');
    x=c.crossReference({...rate,dateKey:20260924},tax);assert.equal(x.uncertain.length,4,'same-night filtered list stays uncertain');
    x=c.crossReference({...rate,dateKey:20260923},tax);assert.equal(x.uncertain.length,4,'older missing evidence cannot certify a later night');
    x=c.crossReference(rate,{dateKey:20260924,rooms:{}});assert.equal(x.totalFail.length,4,'missing real charges on the preceding night still flagged');
    x=c.crossReference(rate,{dateKey:20260917,rooms:{}});assert.equal(x.notOwed,4,'not-yet-arrived night excluded');
    assert.equal(JSON.stringify({rate,tax}),before,'no stay/history facts changed');
    const incoming={room:'101',name:'NEXT SYNTHETIC',arr:'25/09/26',dep:'28/09/26'};
    x=c.crossReference({...rate,all:{'101':[rooms['101'],incoming]}},{dateKey:20260925,rooms:{}});
    assert.equal(x.notOwed,3);assert(x.uncertain.some(r=>r.room==='101'),'turnover incoming guest cannot inherit outgoing departure exemption');
    x=c.crossReference({...rate,rooms:{'101':{...rooms['101'],dep:''}}},{dateKey:20260925,rooms:{}});
    assert.equal(x.notOwed,0);assert.match(x.uncertain[0].reason,/Incomplete/,'unreadable stay dates still require verification');
  });
  await check('tax-load-latest-selection','Slow earlier file load cannot overwrite latest chosen tax file',async()=>{
    const one=deferred(),two=deferred(),els={};const a=charges({'205':{arr:1,auto:0,man:0}}),b=charges({'206':{arr:1,auto:1,man:0}});
    const c=context(['loadTax'],{TAX_LOAD_EPOCH:0,TAX:null,PAIR_OVERRIDE:null,ADJ_OPEN_OVERRIDE:null,EXPANDED:new Set(),clearErr:()=>{},
      el:id=>els[id]||(els[id]={classList:{add(){}}}),readOxps:f=>f.name==='first'?one.promise:two.promise,
      pagesToTokens:x=>x,parseTax:x=>x,showErr:()=>{},ingestTax:()=>true,render:()=>{},t:x=>x});
    const pending1=c.loadTax({name:'first'}),pending2=c.loadTax({name:'second'});two.resolve(b);await pending2;one.resolve(a);await pending1;
    assert.equal(c.TAX,b);
  });
  await check('tax-failed-load-identity','Failed replacement file is not labelled as if it owns previous tax data',async()=>{
    const els={'fn-tax':{textContent:'previous.oxps'}},old=charges({'205':{arr:1,auto:1,man:0}});
    const c=context(['loadTax'],{TAX_LOAD_EPOCH:0,TAX:old,PAIR_OVERRIDE:null,ADJ_OPEN_OVERRIDE:null,EXPANDED:new Set(),clearErr:()=>{},
      el:id=>els[id]||(els[id]={classList:{add(){}}}),readOxps:async()=>{throw new Error('corrupt');},showErr:()=>{},t:x=>x});
    await c.loadTax({name:'broken.oxps'});assert.equal(c.TAX,old);assert.equal(els['fn-tax'].textContent,'previous.oxps');
  });
  await check('receipt-save-failure','Failed persistence cannot leave a receipt visibly confirmed',()=>{
    const c=receiptContext(model([row()])),r=c.MODEL.receipts[0];
    c.localStorage.setItem=()=>{throw new Error('full');};
    assert.equal(c.setRState(r,{status:'ok',corr:null}),false);
    assert.notEqual(c.rState(r).status,'ok');
  });
  await check('receipt-unchanged-source','Unchanged receipt source retains its valid confirmation',()=>{
    const c=receiptContext(model([row()])),r=c.MODEL.receipts[0];
    assert.equal(c.setRState(r,{status:'ok',corr:null}),true);
    c.MODEL=model([row()]);assert.equal(c.rState(c.MODEL.receipts[0]).status,'ok');
  });
  await check('receipt-legacy-missing','Source verification does not erase a legacy missing-paper warning',()=>{
    const c=receiptContext(model([row()]));c.STATE.receipts['BAR|1001|205']={status:'missing',corr:null};
    assert.equal(c.rState(c.MODEL.receipts[0]).status,'missing');
  });
  await check('receipt-manual-different-room','Same serial in a different room cannot consume a manual entry',()=>{
    const c=receiptContext(model([row()]));c.STATE.extras=[{sn:'1001',room:'206',guest:'ALPHA TEST',dept:'BAR',v24:10,v13:0}];
    assert.equal(c.activeExtras().length,1);
  });
  await check('receipt-manual-retained','Reconciled manual evidence remains stored and reappears if its posting is absent',()=>{
    const c=receiptContext(model([row()]));c.STATE.extras=[{sn:'1001',room:'205',guest:'ALPHA TEST',dept:'BAR',v24:10,v13:0}];
    assert.equal(c.activeExtras().length,0);assert.equal(c.STATE.extras.length,1);
    c.MODEL=model([]);assert.equal(c.activeExtras().length,1);
  });
  await check('tax-historical-census','Opening an older IH list cannot overwrite a newer live tax census',()=>{
    const c=taxContext();c.applyInhouse(capture([ihRow('205','ALPHA TEST')]),true);
    const old=capture([ihRow('206','BETA TEST')]);old.title='Guests inhouse: 17/09/26';c.applyInhouse(old,true);
    assert.equal(c.RATE.dateKey,20260918);assert.ok(c.RATE.rooms['205']);
  });
  await check('tax-history-retained','Ninth loaded tax night preserves the earliest saved snapshot',()=>{
    const c=memContext();
    for(let d=1;d<=9;d++){const t=charges({'205':{arr:1,auto:1,man:0}});t.fileDate=String(d).padStart(2,'0')+'/09/26';t.dateKey=20260900+d;c.ingestTax(t);}
    assert.ok(c.loadMem()['205']['01/09/26']);
  });
  await check('tax-zero-snapshot-retained','A zero snapshot keeps its earlier nonzero evidence as a visible conflict',()=>{
    const c=memContext();c.ingestTax(charges({'205':{arr:1,auto:1,man:0}}));c.ingestTax(charges({'205':{arr:0,auto:0,man:0}}));
    const e=c.loadMem()['205']['18/09/26'];assert.ok(e.uncertain&&e.versions.some(x=>x.auto===1));
  });
  await check('tax-ack-source','New underlying tax nights with the same balance invalidate a prior dismissal',()=>{
    const c=context(['dkey','taxStoreValid','taxStoreRead','taxStoreWrite','loadMem','saveMem','loadAck','saveAck','taxAckSource','ackOf','toggleAck'],{localStorage:memory(),MEM_KEY:'ta_check_memory_v2',ACK_KEY:'ta_check_ack_v1'});
    c.saveMem({'205':{'17/09/26':{arr:1,auto:2,man:0}}});c.toggleAck('205',1);assert.equal(c.ackOf('205',1),true);
    c.saveMem({'205':{'17/09/26':{arr:1,auto:2,man:0},'18/09/26':{arr:1,auto:1,man:0}}});assert.equal(c.ackOf('205',1),false);
  });
  await check('tax-load-save-failure','Tax file cannot become active under a success label after failed persistence',async()=>{
    const els={},old=charges({'205':{arr:1,auto:1,man:0}}),next=charges({'206':{arr:1,auto:0,man:0}});
    const c=context(['loadTax'],{TAX_LOAD_EPOCH:0,TAX:old,PAIR_OVERRIDE:null,ADJ_OPEN_OVERRIDE:null,EXPANDED:new Set(),clearErr:()=>{},
      el:id=>els[id]||(els[id]={classList:{add(){}}}),readOxps:async()=>next,pagesToTokens:x=>x,parseTax:x=>x,
      ingestTax:()=>false,showErr:()=>{},t:x=>x});
    await c.loadTax({name:'next.oxps'});assert.equal(c.TAX,old);assert.notEqual(els['fn-tax']?.textContent,'next.oxps');
  });
  await check('rate-load-latest-selection','Slow earlier Rate file cannot overwrite the latest selection',async()=>{
    const one=deferred(),two=deferred(),els={},a={count:1,dateKey:20260917,dateSure:true},b={count:1,dateKey:20260918,dateSure:true};
    const c=context(['loadRate'],{RATE_LOAD_EPOCH:0,RATE:null,PAIR_OVERRIDE:null,ADJ_OPEN_OVERRIDE:null,clearErr:()=>{},
      el:id=>els[id]||(els[id]={classList:{add(){}}}),readOxps:f=>f.name==='first'?one.promise:two.promise,
      parseRate:x=>x,showErr:()=>{},saveMoves:()=>({res:1}),showMoveSave:()=>{},render:()=>{},t:x=>x});
    const p1=c.loadRate({name:'first'}),p2=c.loadRate({name:'second'});two.resolve(b);await p2;one.resolve(a);await p1;assert.equal(c.RATE,b);
  });
  await check('receipt-load-latest-selection','Slow earlier Department file cannot overwrite latest model or state date',async()=>{
    const one=deferred(),two=deferred(),els={},renders=[];
    const a=model([row({sn:'1'})]),b=model([row({sn:'2'})]);a.reportDate='17/09/2026';b.reportDate='18/09/2026';
    const c=context(['dateNum','blankState','receiptStateValid','receiptStorageFault','loadState','loadReport'],{STATE_BLOCKED_SOURCES:[],REPORT_LOAD_EPOCH:0,MODEL:null,STATE:null,stateKey:'',localStorage:memory(),
      $:id=>els[id]||(els[id]={style:{display:'none'}}),unzipFpages:buf=>buf==='a'?one.promise:two.promise,parseReport:x=>x,
      isCheckcharge:()=>true,buildModel:x=>x,loadWatch:()=>{},loadRooms:()=>{},mergeRoomsFromDisk:async()=>{},syncRooms:()=>{},
      renderAll:name=>renders.push(name),toast:()=>{},t:x=>x});
    const p1=c.loadReport('a','first'),p2=c.loadReport('b','second');two.resolve(b);await p2;one.resolve(a);await p1;
    assert.equal(c.MODEL,b);assert.equal(c.STATE.date,'18/09/2026');assert.deepEqual(renders,['second']);
  });
  await check('tax-corrupt-bytes-preserved','Unreadable tax memory cannot be silently replaced by a new empty database',()=>{
    const raw='{interrupted original bytes',s=memory({'ta_check_memory_v2':raw}),c=memContext(s);
    assert.equal(c.ingestTax(charges({'205':{arr:1,auto:1,man:0}})),false);
    assert.equal(s.getItem('ta_check_memory_v2'),raw);
  });
  await check('receipt-corrupt-bytes-preserved','Unreadable saved receipt state blocks edits and preserves original bytes',()=>{
    const raw='{"date":"18/09/2026","receipts":null,"extras":"broken"}',s=memory({'reccheck_18/9/2026':raw});
    const c=receiptContext(model([row()]));c.localStorage=s;
    vm.runInContext(['blankState','loadState'].map(lift).join('\n'),c);c.STATE=c.loadState('18/09/2026');
    assert.equal(c.setRState(c.MODEL.receipts[0],{status:'ok',corr:null}),false);
    assert.equal(s.getItem('reccheck_18/9/2026'),raw);
  });
  await check('receipt-date-alias-merge','Disjoint checks under equivalent date spellings remain available together',()=>{
    const s=memory({'reccheck_18/9/2026':JSON.stringify({date:'18/9/2026',receipts:{'1001|205':{status:'missing'}},extras:[]}),
      'reccheck_18/09/2026':JSON.stringify({date:'18/09/2026',receipts:{'1002|206':{status:'missing'}},extras:[]})});
    const c=context(['blankState','receiptStateValid','receiptStorageFault','loadState'],{STATE_BLOCKED_SOURCES:[],localStorage:s,stateKey:''});
    const state=c.loadState('18/09/2026');assert.ok(state.receipts['1001|205']);assert.ok(state.receipts['1002|206']);
    assert.ok(state.dateAliases['reccheck_18/09/2026']);
  });
  await check('receipt-changed-source-room-correction','Old room correction cannot reroute a changed guest receipt',()=>{
    const c=receiptContext(model([row()]));c.setRState(c.MODEL.receipts[0],{status:'corrected',corr:{room:'210',v24:7,v13:3}});
    c.MODEL=model([row({guest:'BETA TEST',amount:30})]);const r=c.MODEL.receipts[0],st=c.rState(r);
    assert.equal(c.effRoom(r),'205');assert.equal(c.effTotal(r),30);assert.equal(st.heldCorrection.room,'210');
    c.setRState(r,{status:'ok',corr:null});assert.equal(c.STATE.receiptHistory[c.rKey(r)][0].corr.room,'210');
  });
  await check('tax-uncertain-not-definitive-balance','Conflicting snapshots cannot produce a definite overcharge verdict',()=>{
    const c=memContext();vm.runInContext(['taxRoomKeys','taxMemory','taxUncertainties','overchargeFromMemory'].map(lift).join('\n'),c);c.pruneAck=()=>{};
    c.saveMem({'205':{'18/09/26':{arr:1,auto:2,man:0,uncertain:true,versions:[{arr:1,auto:1,man:0}]}}});
    assert.equal(c.roomBalance(c.loadMem(),'205').uncertain,true);assert.equal(c.overchargeFromMemory().length,0);
    assert.equal(c.taxUncertainties(c.loadMem())[0].room,'205');
  });
  await check('tax-retained-history-window','Retaining old evidence does not extend the existing seven-date balance window',()=>{
    const c=memContext();
    for(let d=1;d<=9;d++){const t=charges({'205':{arr:1,auto:d===1?2:1,man:0}});t.fileDate=String(d).padStart(2,'0')+'/09/26';t.dateKey=20260900+d;c.ingestTax(t);}
    assert.ok(c.loadMem()['205']['01/09/26']);assert.equal(c.roomBalance(c.loadMem(),'205').bal,0);
  });
  await check('tax-consolidated-explicit-retirement','Consolidated explicit checkout cannot resurrect a prior occupied room',()=>{
    const c=taxContext();c.applyInhouse(capture([ihRow('205','ALPHA TEST')]),true);
    c.setLiveRate({kind:'rate',live:true,dateKey:20260918,bizDate:'18/09/26',consolidated:true,coverageMissing:[],rooms:{},all:{},count:0});
    assert.equal(c.RATE.count,0);assert.equal(c.RATE.rooms['205'],undefined);
  });
  await check('receipt-reset-failure','Failed day reset preserves the current state and reports failure',()=>{
    const c=receiptContext(model([row()]));vm.runInContext(['blankState','resetReceiptState'].map(lift).join('\n'),c);
    c.setRState(c.MODEL.receipts[0],{status:'ok',corr:null});const previous=c.STATE,raw=c.localStorage.getItem(c.stateKey);
    c.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};
    assert.equal(c.resetReceiptState(),false);assert.equal(c.STATE,previous);assert.equal(c.localStorage.getItem(c.stateKey),raw);
  });
  await check('receipt-reset-alias','A successful reset cannot resurrect previously migrated date aliases',()=>{
    const c=receiptContext(model([row()]));vm.runInContext(['blankState','loadState','resetReceiptState'].map(lift).join('\n'),c);
    c.localStorage.setItem('reccheck_18/09/2026',JSON.stringify({date:'18/09/2026',receipts:{old:{status:'ok'}},extras:[]}));
    c.STATE=c.loadState('18/09/2026');assert(c.STATE.receipts.old);assert.equal(c.resetReceiptState(),true);
    assert.equal(Object.keys(c.loadState('18/09/2026').receipts).length,0);
  });
  await check('tax-incomplete-new-room','Unreadable identity fields are visible in Tax without creating confirmed stays',()=>{
    for(const field of [0,5,11]){
      const c=savedTaxContext(),r=ihRow('205','ALPHA TEST');r[field]='';const p=capture([r]);
      c.statusIngest('IH',p,1000);c.applyInhouse(p,true);
      assert.equal(c.statusLoad().IH.rows.length,0);assert.equal(c.RATE.rooms['205'],undefined);
      assert.equal(c.crossReference(c.RATE,charges({})).uncertain[0].room,'205');
    }
  });
  await check('tax-incomplete-room-filter','A smaller later list retains incomplete physical-room evidence',()=>{
    const c=savedTaxContext(),partial=ihRow('205','ALPHA TEST');partial[5]='';
    c.statusIngest('IH',capture([partial]),1000);
    const p=capture([ihRow('206','BETA TEST')]);c.statusIngest('IH',p,2000);c.applyInhouse(p,true);
    assert.equal(c.statusLoad().IH.incompleteRows[0].room,'205');
    assert(c.crossReference(c.RATE,charges({})).uncertain.some(r=>r.room==='205'));
  });
  await check('tax-incomplete-stay-resolution','Newer complete exact identity resolves uncertainty while preserving raw evidence',()=>{
    const c=savedTaxContext(),partial=ihRow('205','ALPHA TEST');partial[6]='';
    c.statusIngest('IH',capture([partial]),1000);c.applyInhouse(capture([partial]),true);
    assert.equal(c.crossReference(c.RATE,charges({})).uncertain.length,1);
    const p=capture([ihRow('205','ALPHA TEST')]);c.statusIngest('IH',p,2000);c.applyInhouse(p,true);
    assert.equal(c.crossReference(c.RATE,charges({})).uncertain.length,0);
    assert.equal(c.crossReference(c.RATE,charges({})).totalFail.length,1);
    assert.equal(c.statusLoad().IH.incompleteRows.length,1);
  });
  await check('tax-incomplete-schema','Malformed stored incomplete-room evidence cannot be silently replaced',()=>{
    const c=savedTaxContext(),raw=JSON.stringify({IH:{rows:[],incompleteRows:'damaged'}});
    c.localStorage.setItem(c.STATUS_KEY,raw);assert.throws(()=>c.statusLoad());
    assert.equal(c.localStorage.getItem(c.STATUS_KEY),raw);
  });
  console.log('\nAUDIT_RECEIPT_TAX_RESULT '+JSON.stringify({total:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results}));
  process.exitCode=results.some(x=>!x.pass)?1:0;
})().catch(e=>{console.error(e);process.exitCode=2;});
