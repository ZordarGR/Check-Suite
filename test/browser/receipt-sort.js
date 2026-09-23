require('./fresh.js')();
const {chromium}=require('playwright-core'),assert=require('assert'),path=require('path');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 try{
  const p=await b.newPage({viewport:{width:1500,height:1000}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('reccheck_lang','en');localStorage.setItem('reccheck_rooms',JSON.stringify({'10':{guest:'OTHER ROOM GUEST',nick:'AAA ROOM ALIAS',seen:'24/9/2026',liveKey:20260924}}));});
  await p.goto('file://'+path.resolve(__dirname,'h-sweep.html'));await p.waitForFunction(()=>!!window.__t);
  await p.evaluate(()=>{
   const mk=(sn,room,guest,dept='RESTAURANT')=>({sn,serial:sn,roomMain:room,room,guest,dept,total:10,rates:{'24%':10},entries:[],time:'21:00',cancelled:false,voided:false});
   const list=[mk('10','10','ZED PRINTED'),mk('20','20','bob'),mk('30','30','alice'),mk('30','40','ALICE'),mk('50','50','Éclair'),mk('60','60','ΓΑΜΜΑ'),mk('70','70',''),{...mk('80','80','CANCELLED'),cancelled:true},{...mk('90','90','Delta'),voided:true,posRates:{'24%':10},posTotal:10,paidBy:['CASH']}];
   const bar=[mk('11','1','Zulu','BAR'),mk('12','2','Alpha','BAR')],depts={};
   for(const d of ['RESTAURANT','CAFETERIA','TAVERNAKI','KAFENIO','BAR'])depts[d]={list:d==='RESTAURANT'?list:d==='BAR'?bar:[],other:[],stillOpen:false};
   depts.RESTAURANT.other=[{room:'900',guest:'OTHER POSTING',time:'21:00',rate:'base',amount:4}];
   window.__t.setModel({reportDate:'24/9/2026',receipts:[...list,...bar],depts,validation:[]});
   window.__t.setState({date:'24/9/2026',receipts:{},extras:[{dept:'RESTAURANT',sn:'manual',room:'100',guest:'Adam',v24:5,v13:0},{dept:'UNKNOWN',sn:'extra',guest:'No room guest',v24:2,v13:0}]});
   window.__t.setStateKey('reccheck_24/9/2026');window.__t.showScreen('app');window.__t.renderAccordions();
   document.querySelectorAll('.acc').forEach(a=>a.classList.add('open'));
  });
  const root=p.locator('.acc[data-dept="RESTAURANT"]'),sort=root.locator('.receiptSort');
  const rows=()=>root.locator(':scope > .body > .rrow').evaluateAll(rs=>rs.map(r=>({key:r.dataset.key||'manual',name:r.dataset.receiptName,room:r.dataset.room,hidden:r.style.display==='none'})));
  const snapshot=()=>p.evaluate(()=>JSON.stringify({model:window.__t.getModel(),state:window.__t.getState(),storage:Object.fromEntries(Object.entries(localStorage))}));
  const original=await rows(),before=await snapshot();assert.equal(await sort.inputValue(),'room');assert.equal(original.length,9);
  await sort.selectOption('name');const ordered=await rows();assert.deepEqual(ordered.slice(0,5).map(r=>r.name),['Adam','alice','ALICE','bob','Delta']);assert.equal(ordered.at(-1).name,'');
  assert.equal(await snapshot(),before,'sorting changes no source facts or stored checks');
  assert(await root.locator('.sortReceiptName').isVisible());assert.match(await root.locator('.sortReceiptName').innerText(),/ZED PRINTED/);
  assert.equal(await p.locator('.acc[data-dept="BAR"] .receiptSort').inputValue(),'room','department order is independent');
  assert.equal(await root.locator('.otherPost .rrow').count(),1,'other postings stay separate');
  const room=root.locator('.roomSearch');await room.fill('30');assert.deepEqual((await rows()).filter(r=>!r.hidden).map(r=>r.room),['30']);
  await sort.selectOption('room');assert.equal(await room.inputValue(),'30');assert.deepEqual((await rows()).map(r=>r.key),original.map(r=>r.key));assert(!await root.locator('.sortReceiptName').isVisible());await room.fill('');
  await sort.selectOption('name');await room.focus();await p.keyboard.press('ArrowDown');
  assert.equal(await root.locator('.khl').getAttribute('data-room'),'30','keyboard follows alphabetical order');await p.keyboard.press('Enter');
  assert.equal(await sort.inputValue(),'name','checking retains the chosen order');
  assert(await root.locator('.rrow[data-room="30"] .rowck').isChecked());assert(!await root.locator('.rrow[data-room="40"] .rowck').isChecked(),'duplicate serial in another room stays untouched');
  const state=await p.evaluate(()=>window.__t.getState());assert.equal(state.receipts['RESTAURANT|30|30'].status,'ok');assert.equal(state.extras.length,2);
  await root.locator('.head').click();await root.locator('.head').click();assert.equal(await sort.inputValue(),'name');
  await p.locator('.extraAcc .receiptSort').selectOption('name');assert.match(await p.locator('.extraAcc .name').last().innerText(),/No room guest/);
  await p.screenshot({path:path.resolve(__dirname,'receipt-sort.png')});
  await p.setViewportSize({width:760,height:800});const bounds=await sort.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=760,'sort control fits narrow window');
  assert.deepEqual(errors,[]);console.log('PASS Receipt name sort: original names, aliases, accents, ties, blank names, cancelled/void/manual rows, isolated departments, room filters, keyboard, confirmation identity, no data writes and responsive control');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
