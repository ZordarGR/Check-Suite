require('./fresh.js')();
const {chromium}=require('playwright-core'),assert=require('assert'),path=require('path');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const context=await b.newContext({viewport:{width:1500,height:1000}});
 try{
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('file://'+path.resolve(__dirname,'h-sweep.html'));await p.waitForFunction(()=>window.__t);
  const setup=async(night=20260924,name='ALPHA GUEST',from='9010')=>p.evaluate(({night,name,from})=>{
   const rows=a=>Object.fromEntries(a.map((r,i)=>[i,r]));
   const st={DP:{[night]:{rows:rows([{room:'82',name,arr:'20/09/26',last:500}])}},
    MV:{[night]:{rows:rows([{from,to:'82',name,arr:'20/09/26',dep:'24/09/26',x:'X'}])}},
    AR:{[night]:{rows:rows([{room:'90',name:'OTHER GUEST',arr:'24/09/26',dep:'30/09/26'}])}}};
   localStorage.setItem('reccheck_legacy','0');localStorage.setItem('reccheck_status_v1',JSON.stringify(st));
   localStorage.setItem('reccheck_receipts_v1',JSON.stringify({'20260923':[[from,name,{id:'80001|'+from,live:true,uncertain:false}]]}));
   const depts={};for(const d of ['RESTAURANT','CAFETERIA','TAVERNAKI','KAFENIO','BAR'])depts[d]={list:[],other:[]};
   window.__t.setModel({reportDate:String(night).slice(6)+'/09/2026',depts,receipts:[],validation:[]});
   window.__t.setState({date:'24/09/2026',receipts:{},extras:[]});window.__t.showScreen('app');window.__rcMovesChanged();
  },{night,name,from});
  const dep=()=>p.locator('#moves .mvPill.mv-dep'),move=()=>p.locator('#moves .mvPill.mv-move');
  await setup();assert.equal(await dep().getAttribute('role'),null);
  await dep().click();assert.equal(await p.evaluate(()=>localStorage.getItem('reccheck_pill_audit_v1')),null);
  await p.evaluate(()=>window.__t.openDebug());assert.equal(await p.locator('#dbgPillAudit').isChecked(),false);
  await p.locator('#dbgPillAudit').check();await p.locator('#dbgOk').click();
  assert.equal(await p.locator('#moves .mvPill.mv-arr').getAttribute('role'),null);
  assert.equal(await dep().getAttribute('aria-checked'),'false');
  const source=()=>p.evaluate(()=>JSON.stringify({st:localStorage.getItem('reccheck_status_v1'),history:localStorage.getItem('reccheck_receipts_v1'),model:window.__t.getModel(),checks:window.__t.getState()}));
  const before=await source();await dep().click();assert.equal(await dep().getAttribute('aria-checked'),'true');
  await move().focus();await p.keyboard.press('Space');assert.equal(await move().getAttribute('aria-checked'),'true');
  assert.equal(await source(),before,'manual observations cannot modify receipts, source lists or checks');
  let report=await p.evaluate(()=>window.reccheckPillAudit());assert.equal(Object.keys(report.days['20260924']).length,2);
  assert(report.visible.every(r=>r.dot&&r.checked));assert(report.visible.every(r=>r.night===20260924));
  // Same identity drawn in a second panel is updated, without changing its automatic dot.
  await p.evaluate(()=>{const box=document.createElement('div');box.id='syntheticStatus';document.body.append(box);window.__t.renderMovesFor(box,20260924);});
  assert.equal(await p.locator('#syntheticStatus .mv-dep.mvPill').getAttribute('aria-checked'),'true');
  await dep().focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#syntheticStatus .mv-dep.mvPill').getAttribute('aria-checked'),'false');
  await dep().click();
  await p.evaluate(()=>window.__t.openDebug());await p.locator('#scMoves').click();
  assert.match(await p.locator('#scDiag').innerText(),/MANUAL PILL OBSERVATIONS/);
  assert.match(await p.locator('#scDiag').innerText(),/"checked": true/);
  await p.locator('#dbgPillAudit').uncheck();await p.locator('#dbgOk').click();
  const saved=await p.evaluate(()=>localStorage.getItem('reccheck_pill_audit_v1'));await dep().click();
  assert.equal(await p.evaluate(()=>localStorage.getItem('reccheck_pill_audit_v1')),saved);
  assert.equal(await dep().getAttribute('role'),null);
  await p.reload();await p.waitForFunction(()=>window.__t);await setup();
  await p.evaluate(()=>window.__t.openDebug());await p.locator('#dbgPillAudit').check();await p.locator('#dbgOk').click();
  assert.equal(await dep().getAttribute('aria-checked'),'true','saved across reload');
  await setup(20260925);assert.equal(await dep().getAttribute('aria-checked'),'false','different audit date');
  await setup(20260924,'NEXT GUEST');assert.equal(await dep().getAttribute('aria-checked'),'false','different guest');
  await setup(20260924,'ALPHA GUEST','9011');assert.equal(await move().getAttribute('aria-checked'),'false','different old room');
  await setup();assert.equal(await dep().getAttribute('aria-checked'),'true');
  await p.evaluate(()=>{localStorage.setItem('reccheck_receipts_v1','{}');window.__rcMovesChanged();});
  report=await p.evaluate(()=>window.reccheckPillAudit());assert(report.visible.every(r=>!r.dot&&r.checked),'manual ticks do not force dots');
  assert(Object.values(report.days['20260924']).every(r=>r.events[0].dot),'original dot-at-click retained');
  await p.screenshot({path:'pill-audit-dark.png'});
  await p.evaluate(()=>document.documentElement.dataset.theme='light');await p.screenshot({path:'pill-audit-light.png'});
  // Failed writes must neither paint a false tick nor discard stored evidence.
  await p.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='reccheck_pill_audit_v1')throw Error('disk full');return window.originalSet.call(this,k,v);};});
  await dep().click();assert.equal(await dep().getAttribute('aria-checked'),'true');
  await p.evaluate(()=>Storage.prototype.setItem=window.originalSet);
  await p.evaluate(()=>{localStorage.setItem('reccheck_pill_audit_v1','{broken');window.__rcMovesChanged();});
  assert.equal(await dep().getAttribute('role'),null);await p.evaluate(()=>window.__t.openDebug());
  assert(await p.locator('#dbgPillAudit').isDisabled());
  assert.equal(await p.evaluate(()=>localStorage.getItem('reccheck_pill_audit_v1')),'{broken');
  assert.deepEqual(errors,[]);
  console.log('PASS manual pill audit: default off, toggle, keyboard, independent dots, persisted dates/guests/moves, report, cross-panel state, failed/corrupt storage, dark/light');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
