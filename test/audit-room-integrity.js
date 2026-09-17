/* Adversarial preservation audit. Run in cloud from the repository root:
 *   node test/audit-room-integrity.js
 * Tests lift production functions, use synthetic guests, and never touch hotel data.
 * FAIL means a safety invariant is violated. These are intentionally not assertions
 * that the currently observed bug must keep occurring. No local execution was used
 * while preparing this harness (CLAUDE.md cloud-only execution rule).
 */
const fs = require('fs');
const assert = require('assert/strict');
const src = fs.readFileSync('app/index.html', 'utf8');
const lift = name => {
  const at = src.indexOf('\nfunction ' + name + '(');
  if (at < 0) throw new Error('Missing shipped function: ' + name);
  const start = src.indexOf('{', at);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at + 1, i + 1);
  }
  throw new Error('Unclosed shipped function: ' + name);
};
const declaration = name => {
  const line = src.match(new RegExp('^const ' + name + ' = .*$', 'm'));
  if (!line) throw new Error('Missing constant: ' + name);
  return line[0];
};
const KEY = 'reccheck_moves_v2';
const DONE = 'reccheck_moves_applied';
const STATUS = 'reccheck_status_v1';
const copy = value => JSON.parse(JSON.stringify(value));
const RealDate = Date;
const PIN = new RealDate(2026, 8, 18, 12).getTime();
class AuditDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [PIN])); }
  static now() { return PIN; }
}
function makeEnv(seed = {}) {
  const store = Object.create(null);
  for (const [key, value] of Object.entries(seed)) store[key] = typeof value === 'string' ? value : JSON.stringify(value);
  const failures = new Set();
  const localStorage = {
    getItem: key => Object.hasOwn(store, key) ? store[key] : null,
    setItem: (key, value) => {
      if (failures.has(key)) throw new Error('Synthetic quota/write failure: ' + key);
      store[key] = String(value);
    },
    removeItem: key => { delete store[key]; }
  };
  const functions = [
    'dkey', 'dfmt', 'leadRoom', 'bnk', 'hhmm', 'pillRoom', 'loadLedger',
    'mvSameName', 'mvPrevNight', 'detectMoves', 'saveMoves', 'movesApplied', 'recordMoves',
    'inhouseToRate', 'isInhouseTitle', 'inhouseDate', 'parseInhouse', 'parseTagged',
    'statusLoad', 'statusSave', 'stName', 'stRoom', 'stKey', 'stSameRoom', 'stDayKey',
    'statusPrune', 'statusIngest', 'ihFind', 'statusMark', 'liveNameOf', 'ingestLiveNames',
    'feedStays', 'applyInhouse', 'dateNum', 'sameName', 'isCutOf', 'prevNightKey', 'syncRooms'
  ];
  const body = [
    ...['IH', 'AR', 'DP', 'MV'].map(declaration),
    `const MOVES_KEY=${JSON.stringify(KEY)}, MOVES_DONE_KEY=${JSON.stringify(DONE)}, STATUS_KEY=${JSON.stringify(STATUS)};`,
    'const STATUS_KEEP_DAYS=15; let STATUS_TICK=0, LEDGER_TICK=0, LIVE_HELD={};',
    'let LIVE_SIG="", RATE=null, MOVES_ROWS=null, MOVES_NIGHT=0, PAIR_OVERRIDE=null, ADJ_OPEN_OVERRIDE=null;',
    'let ROOMS={}, MODEL={receipts:[],reportDate:"18/9/2026"}, WATCH=[];',
    'const elements={}; function el(id){ return elements[id] || (elements[id]={textContent:""}); }',
    'function t(key,...rest){return key+"("+rest.join(",")+")";} function render(){} function saveRooms(){}',
    'function showMoveSave(){} function toast(){} function setTimeout(){} function openWatchChangePrompt(){}',
    'const window={};',
    ...functions.map(lift),
    'return {saveMoves,recordMoves,inhouseToRate,applyInhouse,parseInhouse,parseTagged,statusIngest,statusMark,',
    'feedStays,ingestLiveNames,readLedger:loadLedger,readStatus:statusLoad,',
    'setRooms:r=>{ROOMS=r;},getRooms:()=>ROOMS,getRate:()=>RATE,',
    'sync:(r,model)=>{ROOMS=r;MODEL=model;syncRooms();return ROOMS;}};'
  ].join('\n');
  const api = new Function('localStorage', 'Date', body)(localStorage, AuditDate);
  return { ...api, store, failures, put: (key, value) => { store[key] = JSON.stringify(value); } };
}
const entry = (name = 'ALPHA GUEST', seen = 20260917, extra = {}) => ({d:20260925,n:name,seen,...extra});
const rate = (rows, date = '18/09/26') => {
  const all = {}, rooms = {};
  for (const r of rows) { rooms[r.room] = r; (all[r.room] || (all[r.room] = [])).push(r); }
  const [d,m,y] = date.split('/').map(Number);
  return {all, rooms, dateKey:(y < 100 ? y + 2000 : y) * 10000 + m * 100 + d,bizDate:date,dateSure:true,live:true,count:Object.keys(rooms).length};
};
const row = (room, name = 'ALPHA GUEST', arr = '10/09/26', dep = '25/09/26', status = 'CI') => ({room,name,arr,dep,status});
const move = (name = 'ALPHA GUEST', mark = 'X') => ['101','STD','102','STD',name,mark,'10/09/26','25/09/26'];
const ihText = (rows, options = {}) => {
  const lines = ['TITLE\tGuests inhouse: ' + (options.date || '18/09/26')];
  for (const r of rows) lines.push(['IH',r.name,r.room,'1/0/0/0/0',r.arr,r.dep,r.status].join('\t'));
  if (options.err) lines.push('ERR\t' + options.err);
  if (!options.noDone) lines.push(['DONE',rows.length,options.total || rows.length,10,5,'unicode',options.cut ? 'cut-short' : 'complete'].join('\t'));
  return lines.join('\n');
};
const results = [];
function test(name, fn) {
  try { fn(); results.push({name,passed:true}); console.log('PASS ' + name); }
  catch (error) { results.push({name,passed:false,error:String(error.message || error)}); console.log('FAIL ' + name + '\n  ' + String(error.message || error)); }
}

test('CONTROL unrelated rooms survive a smaller ledger update', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry()},'150':{'20260910':entry('OTHER GUEST')}}});
  e.saveMoves(rate([row('101')]));
  assert.equal(e.readLedger()['150']['20260910'].n,'OTHER GUEST');
});
test('CONTROL an older business date cannot shorten a newer ledger departure', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry('ALPHA GUEST',20260918)}}});
  e.saveMoves(rate([row('101','ALPHA GUEST','10/09/26','20/09/26')],'17/09/26'));
  assert.equal(e.readLedger()['101']['20260910'].d,20260925);
});
test('R01 repeated census preserves a recorded destination move link', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry()},'102':{'20260910':entry()}}});
  e.recordMoves([move()],20260918);
  e.saveMoves(rate([row('102')]));
  e.recordMoves([move()],20260918);
  assert.equal(e.readLedger()['102']['20260910'].from,'101');
});
test('R02 repeated census preserves the source move-out marker', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry('ALPHA GUEST',20260918,{mv:20260918})}}});
  e.saveMoves(rate([row('101')]));
  assert.equal(e.readLedger()['101']['20260910'].mv,20260918);
});
test('R03 a blank departure read cannot erase a known departure', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry()}}});
  e.saveMoves(rate([row('101','ALPHA GUEST','10/09/26','')]));
  assert.equal(e.readLedger()['101']['20260910'].d,20260925);
});
test('R04 a half-read in-house row cannot erase the stored guest', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry()}}});
  e.applyInhouse(e.parseInhouse(ihText([row('101','','10/09/26','25/09/26','')])),true);
  assert.equal(e.readLedger()['101']['20260910'].n,'ALPHA GUEST');
});
test('R05 filtered same-name family rooms cannot fabricate a move', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry('FAMILY GUEST',20260917)}}});
  // Room 101 still holds this family; the user opens a room-102-only filtered list.
  e.applyInhouse(e.parseInhouse(ihText([row('102','FAMILY GUEST','18/09/26')])),true);
  const ledger=e.readLedger();
  assert.ok(!ledger['101']['20260910'].mv && !ledger['102']['20260918'].from,'Missing from a filtered list is not move evidence');
});
test('R06 explicit moves cannot mark unrelated same-arrival guests', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry('BETA GUEST')},'102':{'20260910':entry('GAMMA GUEST')}}});
  const before=copy(e.readLedger());
  e.recordMoves([move('ALPHA GUEST')],20260918);
  assert.deepEqual(e.readLedger(),before);
});
test('R07 explicit moves require X rather than any nonempty mark', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry()},'102':{'20260910':entry()}}});
  const before=copy(e.readLedger());
  e.recordMoves([move('ALPHA GUEST','?')],20260918);
  assert.deepEqual(e.readLedger(),before);
});
test('R08 a one-sided move retries when its second endpoint arrives', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry()}}});
  e.recordMoves([move()],20260918);
  const ledger=e.readLedger(); ledger['102']={'20260910':entry()}; e.put(KEY,ledger);
  e.recordMoves([move()],20260918);
  assert.equal(e.readLedger()['102']['20260910'].from,'101');
});
test('R09 failed ledger persistence must not consume a move retry', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry()},'102':{'20260910':entry()}}});
  e.failures.add(KEY); e.recordMoves([move()],20260918); e.failures.delete(KEY);
  e.recordMoves([move()],20260918);
  assert.equal(e.readLedger()['102']['20260910'].from,'101');
});
test('R10 filtered capture preserves an omitted known in-house guest without claiming checkout', () => {
  const e=makeEnv();
  const a=row('101'), b=row('102','BETA GUEST');
  e.statusIngest('IH',e.parseInhouse(ihText([a,b])),1000);
  e.statusIngest('IH',e.parseInhouse(ihText([b])),2000);
  assert.ok(e.readStatus().IH.rows.some(r=>r.room==='101'),'The capture union must retain the row');
  assert.notEqual(e.statusMark(e.readStatus(),'DP',a,20260918).cls,'mOut','A complete read of a filtered list is not a complete hotel census');
});
test('R11 a capture with ERR cannot replace the trusted in-house snapshot', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101')])),1000);
  const before=copy(e.readStatus());
  e.statusIngest('IH',e.parseInhouse(ihText([row('102','BETA GUEST')],{err:'window changed'})),2000);
  assert.deepEqual(e.readStatus(),before);
});
test('R12 a capture without DONE cannot prove an omitted guest checked out', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('102','BETA GUEST')],{noDone:true})),2000);
  assert.notEqual(e.statusMark(e.readStatus(),'DP',row('101'),20260918).cls,'mOut');
});
test('R13 got fewer rows than total cannot create a complete census', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('102','BETA GUEST')],{total:600})),2000);
  assert.notEqual(e.statusMark(e.readStatus(),'DP',row('101'),20260918).cls,'mOut');
});
test('R14 a nameless failed cell cannot erase the saved in-house departure', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101')])),1000);
  e.statusIngest('IH',e.parseInhouse(ihText([row('101','ALPHA GUEST','10/09/26','','')])),2000);
  const saved=e.readStatus().IH.rows.find(r=>r.room==='101');
  assert.equal(saved.dep,'25/09/26');
});
test('R15 late delivery of an older report cannot revert its newer status row', () => {
  const e=makeEnv();
  const report=status=>({title:'Departure Report for 18/09/26',rows:[['ALPHA GUEST','101','1/0/0/0/0','10/09/26',status]],done:{cut:false}});
  e.statusIngest('DP',report('CO'),2000);
  e.statusIngest('DP',report('CI'),1000);
  const day=e.readStatus().DP['20260918'];
  assert.equal(day.at,2000);
  assert.equal(Object.values(day.rows)[0].status,'CO');
});
test('R16 an old business-date census cannot overwrite the current room guest', () => {
  const e=makeEnv();
  e.setRooms({'101':{guest:'CURRENT GUEST',liveKey:20260918,seen:'18/9/2026',nick:'current label'}});
  e.ingestLiveNames(rate([row('101','PREVIOUS GUEST')],'17/09/26'));
  assert.equal(e.getRooms()['101'].guest,'CURRENT GUEST');
  assert.equal(e.getRooms()['101'].liveKey,20260918);
});
test('R17 a failed census save retries the identical capture after storage recovers', () => {
  const e=makeEnv(); const capture=e.parseInhouse(ihText([row('101')]));
  e.failures.add(KEY); e.applyInhouse(capture,true); e.failures.delete(KEY);
  e.applyInhouse(capture,true);
  assert.ok(e.readLedger()['101'],'The unchanged-signature fast path must not suppress a failed save');
});
test('R18 a capture without DONE cannot write live stays', () => {
  const e=makeEnv();
  e.applyInhouse(e.parseInhouse(ihText([row('101')],{noDone:true})),true);
  assert.equal(Object.keys(e.readLedger()).length,0);
});
test('R19 invalid calendar dates cannot become ledger keys', () => {
  const e=makeEnv();
  e.applyInhouse(e.parseInhouse(ihText([row('101','ALPHA GUEST','31/02/26')])),true);
  assert.equal(Object.keys(e.readLedger()).length,0);
});
test('R20 same-arrival distinct guests cannot silently overwrite one another', () => {
  const e=makeEnv();
  e.saveMoves(rate([row('101','ALPHA GUEST'),row('101','BETA GUEST')]));
  const saved=JSON.stringify(e.readLedger());
  assert.ok(saved.includes('ALPHA GUEST') && saved.includes('BETA GUEST'),'Room + arrival is not a unique reservation identity');
});
test('R21 one nickname cannot be consumed by two ambiguous destination rooms', () => {
  const e=makeEnv();
  const rooms={'101':{guest:'FAMILY GUEST',seen:'17/9/2026',nick:'Family label'}};
  const model={reportDate:'18/9/2026',receipts:[{roomMain:'102',guest:'FAMILY GUEST'},{roomMain:'103',guest:'FAMILY GUEST'}]};
  e.sync(rooms,model);
  assert.equal(rooms['101'].nick,'Family label','Two possible destinations must leave the source label in place');
  assert.ok(!rooms['102'].nick && !rooms['103'].nick);
});

const failed=results.filter(r=>!r.passed);
const summary={suite:'room-integrity',total:results.length,passed:results.length-failed.length,failed:failed.length,results};
if(process.env.AUDIT_JSON) fs.writeFileSync(process.env.AUDIT_JSON,JSON.stringify(summary,null,2)+'\n');
console.log('\nROOM INTEGRITY '+JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed}));
process.exitCode=failed.length ? 1 : 0;
