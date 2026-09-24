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
  const results=p.locator('#roomLookupResults');assert.deepEqual((await results.locator('.match').evaluateAll(rs=>rs.map(r=>r.dataset.key))).sort(),['101|101','200|101','201|102','300|101']);
  assert.equal(await results.locator('.match[data-key="100|101"]').count(),0,'source receipt is excluded');
  assert.equal(await results.locator('.match[data-dept="RESTAURANT"]').count(),1,'another receipt in the source department is included');
  assert.equal(await results.locator('button,input').count(),0,'lookup does not offer edits or recursive searches');
  assert.equal(await results.locator('img').count(),0,'guest names remain text');assert((await results.innerText()).includes('<img src=x onerror=alert(1)> DIFFERENT GUEST'));
  assert.match(await results.innerText(),/VOID|ΑΚΥΡΗ/);assert.equal(await snapshot(),before,'lookup leaves source and stored audit data unchanged');
  for(const width of [1500,760,420]){
   await p.setViewportSize({width,height:900});const box=await p.locator('#modal').boundingBox();assert(Math.abs(box.x+box.width/2-width/2)<3,'modal is centred');assert(box.x>=0&&box.x+box.width<=width);
   assert(await p.locator('#modal').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'results wrap without horizontal clipping');
  }
  await p.setViewportSize({width:1500,height:1000});await p.screenshot({path:path.resolve(__dirname,'room-lookup.png')});
  await p.locator('#roomLookupClose').click();assert.equal(await root.locator('.receiptSort').inputValue(),'name');assert.equal(await p.locator('.acc[data-dept="BAR"] .roomSearch').inputValue(),'1010');
  await root.locator('.rrow[data-key="102|999"] .roomLookupBtn').click();assert.equal(await results.locator('.match').count(),0);assert.match(await results.innerText(),/No other receipts/);await p.keyboard.press('Escape');
  await root.locator('.rrow[data-key="100|101"] .sn').click();await button.focus();await p.keyboard.press('Enter');assert.equal(await results.locator('.match').count(),4);await p.locator('#roomLookupClose').click();
  assert(!await root.locator('.rrow[data-key="100|101"] .rowck').isChecked(),'keyboard lookup cannot confirm a highlighted receipt');
  await root.locator('.rrow[data-key="101|101"] .roomLookupBtn').click();
  assert.deepEqual((await results.locator('.match').evaluateAll(rs=>rs.map(r=>r.dataset.key))).sort(),['100|101','200|101','201|102','300|101'],'lookup from the other receipt includes its same-department peer and excludes itself');await p.locator('#roomLookupClose').click();
  await p.locator('.acc[data-dept="CAFETERIA"] .rrow[data-key="201|102"] .roomLookupBtn').click();assert.match(await p.locator('#roomLookupTitle').innerText(),/Room 101/);
  assert.equal(await results.locator('.match').count(),4,'source lookup follows its corrected room');assert.equal(await results.locator('.match[data-dept="CAFETERIA"]').count(),0);await p.locator('#roomLookupClose').click();
  await p.evaluate(()=>{const r=window.__t.getModel().receipts[0];document.querySelector('#matches').replaceChildren(window.__t.matchCard(r));document.querySelector('#searchWrap').style.display='block';});
  await p.locator('#matches .roomLookupBtn').click();assert.equal(await results.locator('.match').count(),4);await p.locator('#roomLookupClose').click();
  assert(await p.locator('.rrow[data-key="700|"] .roomLookupBtn').isDisabled());assert.deepEqual(errors,[]);
  await p.evaluate(()=>{document.querySelector('main').style.minHeight='3000px';document.querySelector('.acc').classList.add('done');});
  for(const width of [1500,960,560]){
   await p.setViewportSize({width,height:800});
   for(const padding of ['10px 18px','19px 18px']){
    await p.evaluate(padding=>{document.querySelector('body > header').style.padding=padding;window.scrollTo(0,650);},padding);
    await p.waitForFunction(()=>Math.abs(document.querySelector('#searchWrap').getBoundingClientRect().top-document.querySelector('body > header').getBoundingClientRect().bottom)<0.5);
    const geometry=await p.evaluate(()=>{
     const header=document.querySelector('body > header'),search=document.querySelector('#searchWrap'),acc=document.querySelector('.acc');
     const h=header.getBoundingClientRect(),s=search.getBoundingClientRect(),a=acc.getBoundingClientRect();
     return {gap:s.top-h.bottom,header:getComputedStyle(header).backgroundColor,search:getComputedStyle(search).backgroundColor,searchLeft:s.left,searchRight:s.right,accLeft:a.left,accRight:a.right};
    });
    assert(Math.abs(geometry.gap)<0.5,'no strip between header and sticky search');
    assert.equal(geometry.header,'rgb(10, 14, 20)');assert.equal(geometry.search,'rgb(10, 14, 20)','completed green header cannot bleed through');
    assert(geometry.searchLeft<=geometry.accLeft+0.5&&geometry.searchRight>=geometry.accRight-0.5,'search covers the accordion width');
   }
  }
  await p.screenshot({path:path.resolve(__dirname,'sticky-search.png')});assert.deepEqual(errors,[]);
  console.log('PASS sticky search: no header gap, opaque coverage, responsive widths and changing header height');
  console.log('PASS Same-room lookup: current report, same and other departments, source exclusion, exact/effective room, different names, filters, void/cancel/manual handling, escaped names, no writes, empty state, keyboard, search cards and centred responsive modal');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
