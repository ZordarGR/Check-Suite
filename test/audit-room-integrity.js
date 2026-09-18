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
    'statusLoad', 'loadStatus', 'statusSave', 'stName', 'stRoom', 'stKey', 'stSameRoom', 'stDayKey',
    'statusPrune', 'statusIngest', 'ihFind', 'statusMark', 'inhouseCheckedOut',
    'consolidatedInhouseRows', 'consolidatedInhouseRate', 'setLiveRate', 'liveNameOf', 'ingestLiveNames',
    'feedStays', 'taxCaptureRate', 'applyInhouse', 'dateNum', 'sameName', 'isCutOf', 'prevNightKey', 'syncRooms'
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
    'const storageFaults=[]; const window={__rcStorageFault:(where,error)=>storageFaults.push({where,message:String(error)})};',
    ...functions.map(lift),
    'return {saveMoves,recordMoves,inhouseToRate,applyInhouse,parseInhouse,parseTagged,statusIngest,statusMark,',
    'feedStays,ingestLiveNames,readLedger:loadLedger,readStatus:statusLoad,active:()=>consolidatedInhouseRows(statusLoad()),',
    'setRooms:r=>{ROOMS=r;},getRooms:()=>ROOMS,getRate:()=>RATE,storageFaults,',
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
test('R14 failed cells cannot erase the saved in-house departure', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101')])),1000);
  e.statusIngest('IH',e.parseInhouse(ihText([row('101','ALPHA GUEST','10/09/26','','')])),2000);
  const saved=e.readStatus().IH.rows.find(r=>r.room==='101');
  assert.equal(saved.dep,'25/09/26');
});
test('R15 late delivery of an older report cannot revert its newer status row', () => {
  const e=makeEnv();
  const report=status=>({title:'Departure Report for 18/09/26',rows:[['ALPHA GUEST','101','1/0/0/0/0','10/09/26',status]],done:{cut:false,got:1,rows:1}});
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
test('R22 repeated conflict observations deduplicate and update only that guest', () => {
  const e=makeEnv();
  e.saveMoves(rate([row('101','ALPHA GUEST'),row('101','BETA GUEST')]));
  e.saveMoves(rate([row('101','BETA GUEST','10/09/26','26/09/26')]));
  const saved=e.readLedger()['101']['20260910'];
  assert.equal(saved.n,'ALPHA GUEST');assert.equal(saved.d,20260925);
  assert.equal(saved.conflicts.length,1);assert.equal(saved.conflicts[0].n,'BETA GUEST');
  assert.equal(saved.conflicts[0].d,20260926);
});
test('R23 report-fed identity conflicts preserve both names and primary move history', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry('ALPHA GUEST',20260917,{from:'99'})}}});
  e.feedStays([{room:'101',name:'BETA GUEST',arr:'10/09/26',dep:'26/09/26'}],20260918);
  const saved=e.readLedger()['101']['20260910'];
  assert.equal(saved.n,'ALPHA GUEST');assert.equal(saved.from,'99');
  assert.equal(saved.conflicts[0].n,'BETA GUEST');
});
test('R24 equally ranked conflicting in-house names preserve current room identity', () => {
  const e=makeEnv();e.setRooms({'101':{guest:'KNOWN GUEST',liveKey:20260918}});
  e.ingestLiveNames(rate([row('101','ALPHA GUEST'),row('101','BETA GUEST')]));
  assert.equal(e.getRooms()['101'].guest,'KNOWN GUEST');
});
test('R25 a missing receipt is insufficient evidence to transfer a nickname', () => {
  const e=makeEnv(),rooms={'101':{guest:'ALPHA GUEST',seen:'17/9/2026',nick:'Label'}};
  e.sync(rooms,{reportDate:'18/9/2026',receipts:[{roomMain:'102',guest:'ALPHA GUEST'}]});
  assert.equal(rooms['101'].nick,'Label');assert.ok(!rooms['102'].nick);
});
test('CONTROL an explicit uniquely matched move still transfers the nickname', () => {
  const e=makeEnv({[STATUS]:{MV:{'20260918':{rows:{m:{from:'101',to:'102',name:'ALPHA GUEST',x:'X',arr:'10/09/26'}}}}}});
  const rooms={'101':{guest:'ALPHA GUEST',seen:'17/9/2026',nick:'Label'}};
  e.sync(rooms,{reportDate:'18/9/2026',receipts:[{roomMain:'102',guest:'ALPHA GUEST'}]});
  assert.equal(rooms['102'].nick,'Label');assert.ok(!rooms['101'].nick);
});
test('CONTROL explicit departure CO still confirms departure', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101','ALPHA GUEST','10/09/26','18/09/26','CI')])),1000);
  const departure={...row('101','ALPHA GUEST','10/09/26','18/09/26','CO'),last:2000};
  assert.equal(e.statusMark(e.readStatus(),'DP',departure,20260918).cls,'mOut');
});
test('R26 historical census does not replace newer captured status', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101')])),1000);
  e.statusIngest('IH',e.parseInhouse(ihText([row('101','PREVIOUS GUEST')],{date:'17/09/26'})),2000);
  assert.equal(e.readStatus().IH.key,20260918);assert.equal(e.readStatus().IH.rows[0].name,'ALPHA GUEST');
});
test('R27 wrong-caption report cannot populate the saved arrivals list', () => {
  const e=makeEnv();
  e.statusIngest('AR',{title:'Departure Report for 18/09/26',rows:[['ALPHA GUEST','101','','25/09/26','CI']],done:{got:1,rows:1,cut:false}},1000);
  assert.equal(e.readStatus().AR,undefined);
});
test('R28 imported partial rate reports cannot fabricate moves either', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry('FAMILY GUEST',20260917)}}});
  const capture=rate([row('102','FAMILY GUEST','18/09/26')]);capture.live=false;
  e.saveMoves(capture);
  assert.ok(!e.readLedger()['101']['20260910'].mv && !e.readLedger()['102']['20260918'].from);
});
test('R29 a same-name different stay cannot confirm this departure', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101','ALPHA GUEST','17/09/26','18/09/26','CO')])),1000);
  assert.notEqual(e.statusMark(e.readStatus(),'DP',row('101','ALPHA GUEST','10/09/26'),20260918).cls,'mOut');
});
test('R30 differing adjoining identifiers cannot confirm each other', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101-3','ALPHA GUEST','10/09/26','18/09/26','CO')])),1000);
  assert.notEqual(e.statusMark(e.readStatus(),'DP',row('101-2'),20260918).cls,'mOut');
});
test('R31 ambiguous base-room matches cannot select one of two statuses', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101-2','ALPHA GUEST','10/09/26','18/09/26','CO'),row('101-3')])),1000);
  assert.equal(e.statusMark(e.readStatus(),'DP',row('101'),20260918).cls,'mNone');
});
test('R32 conflicting move provenance cannot partly vacate another source', () => {
  const e=makeEnv({[KEY]:{'101':{'20260910':entry()},'102':{'20260910':entry('ALPHA GUEST',20260918,{from:'99'})}}});
  const before=copy(e.readLedger());e.recordMoves([move()],20260918);
  assert.deepEqual(e.readLedger(),before);
});
test('R33 a departure without a verified arrival cannot match a different stay', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101','ALPHA GUEST','17/09/26','18/09/26','CO')])),1000);
  assert.notEqual(e.statusMark(e.readStatus(),'DP',row('101','ALPHA GUEST',''),20260918).cls,'mOut');
});
test('R34 every ledger writer preserves malformed stored bytes and surfaces the failure', () => {
  const invalid=['{broken','[]','null','{"101":[]}','{"101":{"20260910":null}}',
    '{"101":{"20260910":{"n":"ALPHA GUEST","d":"20260925"}}}',
    '{"101":{"20260910":{"n":"ALPHA GUEST","conflicts":{}}}}'];
  for(const raw of invalid)for(const writer of ['census','report','move']){
    const e=makeEnv({[KEY]:raw});
    if(writer==='census')assert.equal(e.saveMoves(rate([row('101')])),null);
    else if(writer==='report')assert.equal(e.feedStays([row('101')],20260918).failed,true);
    else assert.equal(e.recordMoves([move()],20260918),0);
    assert.equal(e.store[KEY],raw,writer+' must not replace invalid source '+raw);
    assert.ok(e.storageFaults.length,writer+' must surface unreadable saved data');
  }
});
test('R35 invalid legacy storage cannot silently be superseded by a new empty ledger', () => {
  const e=makeEnv({'reccheck_moves_v1':'[]'});
  assert.equal(e.saveMoves(rate([row('101')])),null);
  assert.equal(e.store.reccheck_moves_v1,'[]');assert.equal(e.store[KEY],undefined);
});
test('CONTROL valid legacy migration preserves conflicting guest observations', () => {
  const e=makeEnv({'reccheck_moves_v1':{'20260917':{'101':[{a:20260910,d:20260925,n:'ALPHA GUEST'}]},
    '20260918':{'101':[{a:20260910,d:20260926,n:'BETA GUEST'}]}}});
  const saved=e.readLedger()['101']['20260910'];
  assert.equal(saved.n,'ALPHA GUEST');assert.equal(saved.conflicts[0].n,'BETA GUEST');
});
test('R36 deterministic event permutations retain every stay, date, and recorded move', () => {
  for(let seed=1;seed<=24;seed++){
    let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
    const ledger={},all=[],moved=new Set();
    for(let i=0;i<8;i++)for(const room of [String(101+i),String(201+i)]){
      ledger[room]={'20260910':entry('GUEST '+i)};all.push(row(room,'GUEST '+i));
    }
    const e=makeEnv({[KEY]:ledger});
    e.statusIngest('IH',e.parseInhouse(ihText(all)),1);
    for(let step=0;step<80;step++){
      const choice=random()%6,i=random()%8,from=String(101+i),to=String(201+i),name='GUEST '+i;
      if(choice===0){
        const subset=all.filter(()=>random()%3===0);if(subset.length)e.saveMoves(rate(subset));
      }else if(choice===1){
        e.recordMoves([[from,'STD',to,'STD',name,'X','10/09/26','25/09/26']],20260918);moved.add(i);
      }else if(choice===2)e.feedStays([row(to,name,'10/09/26',random()%2?'':'25/09/26')],20260918);
      else if(choice===3)e.recordMoves([[from,'STD',to,'STD','UNRELATED GUEST','X','10/09/26','25/09/26']],20260918);
      else if(choice===4){
        const before=e.store[KEY];e.failures.add(KEY);e.saveMoves(rate([row(to,name)]));e.failures.delete(KEY);
        assert.equal(e.store[KEY],before,'failed write seed '+seed+' step '+step);
      }else{
        const subset=all.filter(()=>random()%4===0);
        e.statusIngest('IH',e.parseInhouse(ihText(subset,{cut:true,total:100})),step+2);
      }
      const now=e.readLedger();
      for(let j=0;j<8;j++)for(const room of [String(101+j),String(201+j)]){
        assert.equal(now[room]['20260910'].n,'GUEST '+j,'identity seed '+seed+' step '+step);
        assert.equal(now[room]['20260910'].d,20260925,'date seed '+seed+' step '+step);
      }
      for(const j of moved){assert.equal(now[String(101+j)]['20260910'].mv,20260918);assert.equal(now[String(201+j)]['20260910'].from,String(101+j));}
      assert.equal(e.readStatus().IH.rows.length,16,'union seed '+seed+' step '+step);
    }
  }
});
test('R37 a complete captured removal of X clears a prior move approval', () => {
  const e=makeEnv();
  const capture=x=>({title:'Perform Move for Date 18/09/26',rows:[move('ALPHA GUEST',x)],done:{got:1,rows:1,cut:false}});
  e.statusIngest('MV',capture('X'),1000);e.statusIngest('MV',capture(''),2000);
  assert.equal(Object.values(e.readStatus().MV['20260918'].rows)[0].x,'');
});

test('R38 repeated names in a room preserve each explicitly captured original arrival', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101','ALPHA GUEST','10/09/26')])),1000);
  e.statusIngest('IH',e.parseInhouse(ihText([row('101','ALPHA GUEST','17/09/26')])),2000);
  assert.deepEqual(e.readStatus().IH.rows.map(r=>r.arr).sort(),['10/09/26','17/09/26']);
  const capture=arr=>({title:'Departure Report for 18/09/26',rows:[['ALPHA GUEST','101','1/0/0/0/0',arr,'CI']],done:{got:1,rows:1,cut:false}});
  e.statusIngest('DP',capture('10/09/26'),1000);e.statusIngest('DP',capture('17/09/26'),2000);
  assert.deepEqual(Object.values(e.readStatus().DP['20260918'].rows).map(r=>r.arr).sort(),['10/09/26','17/09/26']);
});

test('R39 a base-room checkout cannot retire two distinct adjoining identifiers', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101-2','ALPHA GUEST','10/09/26','18/09/26'),row('101-3','ALPHA GUEST','10/09/26','18/09/26')])),1000);
  e.statusIngest('DP',{title:'Departure Report for 18/09/26',rows:[['ALPHA GUEST','101','1/0/0/0/0','10/09/26','CO']],done:{got:1,rows:1,cut:false}},2000);
  assert.equal(e.active().length,2);
});

test('R40 interrupted captures preserve the last complete row and its original read time', () => {
  const e=makeEnv();
  e.statusIngest('IH',e.parseInhouse(ihText([row('101')])),1000);
  e.statusIngest('IH',e.parseInhouse(ihText([row('101','ALPHA GUEST','10/09/26','19/09/26','CO')],{cut:true,total:100})),2000);
  const held=e.readStatus().IH.rows[0];
  assert.equal(held.dep,'25/09/26');assert.equal(held.status,'CI');assert.equal(held.readAt,1000);assert.equal(held.cells[6],'25/09/26');
});

test('R41 a cut-short blank move cell cannot revoke previously captured X', () => {
  const e=makeEnv();
  e.statusIngest('MV',{title:'Perform Move for Date 18/09/26',rows:[move()],done:{got:1,rows:1,cut:false}},1000);
  e.statusIngest('MV',{title:'Perform Move for Date 18/09/26',rows:[move('ALPHA GUEST','')],done:{got:1,rows:100,cut:true}},2000);
  assert.equal(Object.values(e.readStatus().MV['20260918'].rows)[0].x,'X');
});

test('R42 malformed saved status blocks ingestion and preserves the original bytes', () => {
  for(const raw of ['{broken','[]','null','{"IH":{"rows":{}}}','{"DP":{"20260918":{"rows":[]}}}','{"IH":{"rows":[null]}}']){
    const e=makeEnv({[STATUS]:raw});
    assert.throws(()=>e.statusIngest('IH',e.parseInhouse(ihText([row('101')])),1000));
    assert.equal(e.store[STATUS],raw);assert.ok(e.storageFaults.length);
  }
});

test('R43 a checkout without a capture time cannot retire a saved reservation', () => {
  const saved={IH:{at:1000,key:20260918,rows:[{...row('101','ALPHA GUEST','10/09/26','18/09/26'),readAt:1000}]},
    DP:{'20260918':{rows:{a:{...row('101','ALPHA GUEST','10/09/26','18/09/26','CO')}}}}};
  const e=makeEnv({[STATUS]:saved});assert.equal(e.active().length,1);
});

const failed=results.filter(r=>!r.passed);
const summary={suite:'room-integrity',total:results.length,passed:results.length-failed.length,failed:failed.length,results};
if(process.env.AUDIT_JSON) fs.writeFileSync(process.env.AUDIT_JSON,JSON.stringify(summary,null,2)+'\n');
console.log('\nROOM INTEGRITY '+JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed}));
process.exitCode=failed.length ? 1 : 0;
