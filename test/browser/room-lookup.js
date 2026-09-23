require('./fresh.js')();
const {chromium}=require('playwright-core'),assert=require('assert'),path=require('path');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 try{
  const p=await b.newPage({viewport:{width:1500,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('reccheck_lang','en');localStorage.setItem('reccheck_rooms',JSON.stringify({'101':{guest:'ROOM GUEST',nick:'ROOM ALIAS',seen:'24/9/2026',liveKey:20260924}}));});
  await p.goto('file://'+path.resolve(__dirname,'h-sweep.html'));await p.waitForFunction(()=>!!window.__t);
  await p.evaluate(()=>{
   const mk=(sn,room,guest,dept)=>({sn,serial:sn,roomMain:room,room,guest,dept,total:10,rates:{'24%':10},entries:[],time:'21:00',cancelled:false,voided:false});
   const receipts=[mk('100','101','SOURCE GUEST','RESTAURANT'),mk('101','101','SAME DEPARTMENT','RESTAURANT'),mk('102','999','NO MATCH','RESTAURANT'),
    mk('200','101','<img src=x onerror=alert(1)> DIFFERENT GUEST','BAR'),mk('201','102','CORRECTED ROOM','CAFETERIA'),
    {...mk('300','101','CONSOLIDATED','TAVERNAKI'),voided:true,posRates:{'24%':10},posTotal:10,paidBy:['CASH']},
    {...mk('400','101','CANCELLED','KAFENIO'),cancelled:true},mk('500','1010','PREFIX ONLY','BAR'),mk('600','101','MOVED AWAY','BAR'),mk('700','','NO ROOM','BAR')];
   const depts={};for(const d of ['RESTAURANT','CAFETERIA','TAVERNAKI','KAFENIO','BAR'])depts[d]={list:receipts.filter(r=>r.dept===d),other:[],stillOpen:false};
   window.__t.setModel({reportDate:'24/9/2026',receipts,depts,validation:[]});
   const saved={date:'24/9/2026',receipts:{},extras:[{dept:'BAR',sn:'manual',room:'101',guest:'MANUAL NOT IN REPORT',v24:5,v13:0}]};
   for(const [sn,room] of [['201','101'],['600','103']]){const r=receipts.find(r=>r.sn===sn);saved.receipts[window.__t.rKey(r)]={status:'corrected',corr:{room},source:window.__t.receiptFingerprint(r)};}
   window.__t.setState(saved);window.__t.setStateKey('reccheck_24/9/2026');window.__t.showScreen('app');window.__t.renderAccordions();document.querySelectorAll('.acc').forEach(a=>a.classList.add('open'));
  });
  const root=p.locator('.acc[data-dept="RESTAURANT"]'),button=root.locator('.rrow[data-key="100|101"] .roomLookupBtn');
  await root.locator('.receiptSort').selectOption('name');await p.locator('.acc[data-dept="BAR"] .roomSearch').fill('1010');
  const snapshot=()=>p.evaluate(()=>JSON.stringify({model:window.__t.getModel(),state:window.__t.getState(),storage:Object.fromEntries(Object.entries(localStorage))}));
  const before=await snapshot();await button.click();
  assert(await p.locator('#modalBg').evaluate(n=>n.classList.contains('open')));assert.match(await p.locator('#roomLookupTitle').innerText(),/101/);
  const results=p.locator('#roomLookupResults');assert.deepEqual((await results.locator('.match').evaluateAll(rs=>rs.map(r=>r.dataset.key))).sort(),['200|101','201|102','300|101']);
  assert.equal(await results.locator('button,input').count(),0,'lookup does not offer edits or recursive searches');
  assert.equal(await results.locator('img').count(),0,'guest names remain text');assert((await results.innerText()).includes('<img src=x onerror=alert(1)> DIFFERENT GUEST'));
  assert.match(await results.innerText(),/VOID|ΑΚΥΡΗ/);assert.equal(await snapshot(),before,'lookup leaves source and stored audit data unchanged');
  for(const width of [1500,760,420]){
   await p.setViewportSize({width,height:900});const box=await p.locator('#modal').boundingBox();assert(Math.abs(box.x+box.width/2-width/2)<3,'modal is centred');assert(box.x>=0&&box.x+box.width<=width);
   assert(await p.locator('#modal').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'results wrap without horizontal clipping');
  }
  await p.setViewportSize({width:1500,height:1000});await p.screenshot({path:path.resolve(__dirname,'room-lookup.png')});
  await p.locator('#roomLookupClose').click();assert.equal(await root.locator('.receiptSort').inputValue(),'name');assert.equal(await p.locator('.acc[data-dept="BAR"] .roomSearch').inputValue(),'1010');
  await root.locator('.rrow[data-key="102|999"] .roomLookupBtn').click();assert.equal(await results.locator('.match').count(),0);assert.match(await results.innerText(),/No receipts/);await p.keyboard.press('Escape');
  await button.focus();await p.keyboard.press('Enter');assert.equal(await results.locator('.match').count(),3);await p.locator('#roomLookupClose').click();
  await p.evaluate(()=>{const r=window.__t.getModel().receipts[0];document.querySelector('#matches').replaceChildren(window.__t.matchCard(r));document.querySelector('#searchWrap').style.display='block';});
  await p.locator('#matches .roomLookupBtn').click();assert.equal(await results.locator('.match').count(),3);await p.locator('#roomLookupClose').click();
  assert(await p.locator('.rrow[data-key="700|"] .roomLookupBtn').isDisabled());assert.deepEqual(errors,[]);
  console.log('PASS Same-room lookup: current report, other departments, exact/effective room, different names, filters, void/cancel/manual handling, escaped names, no writes, empty state, keyboard, search cards and centred responsive modal');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
