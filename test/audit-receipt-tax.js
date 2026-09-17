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
  return context(['rKey','receiptFingerprint','rState','setRState','saveState','effSN','effRoom','corrHasValues','effRates','effTotal','statusOf','checkableList','extraTotal','activeExtras','extrasOf','extrasSum'],
    {MODEL:m, STATE:state || {date:'18/09/2026',receipts:{},extras:[]}, localStorage:memory(), stateKey:'reccheck_18/09/2026'});
}
const ihRow = (room,name,arr='17/09/26',dep='21/09/26',status='CI') => [name,'',room,'','2',arr,dep,'','','','',status];
function taxContext() {
  const els = {};
  return context(['dkey','pillRoom','inhouseToRate','isInhouseTitle','inhouseDate','applyInhouse','taxRoomKeys','taxCaptureRate','taxAccountBounds','crossReference','decidePairing','deriveStatus'],
    {IH:{NAME:0,ROOM:2,OCC:4,ARR:5,DEP:6,STATUS:11},RATE:null,TAX:null,PAIR_OVERRIDE:null,ADJ_OPEN_OVERRIDE:null,
      LIVE_SIG:'',LEDGER_TICK:0,MOVES_ROWS:null, window:{},
      t:x=>x,el:id=>(els[id] || (els[id]={})),saveMoves:()=>({res:0}),showMoveSave:()=>{},render:()=>{},statusLoad:()=>({})});
}
const capture = rows => ({title:'Guests inhouse: 18/09/26',rows,done:{got:rows.length,rows:rows.length,cut:false}});
const charges = rooms => ({kind:'tax',fileDate:'18/09/26',dateKey:20260918,totalRooms:Object.keys(rooms).length,rooms});
function memContext(storage = memory()) {
  return context(['dkey','dnum','loadMem','saveMem','pruneRoom','ingestTax','roomBalance','recentDates','deriveStatus'],
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
    const c=context(['blankState','loadState'],{localStorage:s,stateKey:''});
    const loaded=c.loadState('08/09/2026');assert.equal(loaded.receipts['BAR|1001|205']?.status,'ok');
  });
  await check('receipt-cross-dept-primary','Changing department shares cannot silently lose a saved room correction',()=>{
    const c=receiptContext(model([row({amount:12})],{'RESTAURANT 24%':{rows:[row({amount:8})],reported:null}}));
    c.setRState(c.MODEL.receipts[0],{status:'corrected',corr:{room:'210'}});
    c.MODEL=model([row({amount:8})],{'RESTAURANT 24%':{rows:[row({amount:12})],reported:null}});
    assert.equal(c.effRoom(c.MODEL.receipts[0]),'210');
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
    assert.ok(t.uncertain || t.rooms['205'].auto!==2,'reversal counted as second positive tax');
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
    const els={},old=charges({'205':{arr:1,auto:1,man:0}});
    const c=context(['loadTax'],{TAX_LOAD_EPOCH:0,TAX:old,PAIR_OVERRIDE:null,ADJ_OPEN_OVERRIDE:null,EXPANDED:new Set(),clearErr:()=>{},
      el:id=>els[id]||(els[id]={classList:{add(){}}}),readOxps:async()=>{throw new Error('corrupt');},showErr:()=>{},t:x=>x});
    await c.loadTax({name:'broken.oxps'});assert.ok(c.TAX!==old || els['fn-tax'].textContent!=='broken.oxps','previous data still active under failed file name');
  });
  console.log('\nAUDIT_RECEIPT_TAX_RESULT '+JSON.stringify({total:results.length,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results}));
  process.exitCode=results.some(x=>!x.pass)?1:0;
})().catch(e=>{console.error(e);process.exitCode=2;});
