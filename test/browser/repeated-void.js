require('./fresh.js')();
const {chromium}=require('playwright-core'),assert=require('assert'),path=require('path'),fs=require('fs'),vm=require('vm');
(async()=>{
 const c=vm.createContext({module:{exports:{}}});vm.runInContext(fs.readFileSync('app/index.html','utf8').match(/<script id="parser">([\s\S]*?)<\/script>/)[1],c);
 const row=(amount,time,extra={})=>({date:'10/09/2026',time,amount,user:'IFC',room:'201',guest:'EXAMPLE ALEX',qty:1,sn:'81001',text:'Rec: 81001, Pos: 21, 23',...extra});
 const rows=[row(-6,'20:00'),row(6,'20:30',{guest:'ALEX'}),row(-6,'21:00'),row(6,'21:00'),row(6,'20:00'),row(24,'20:30',{sn:'81002'}),row(6,'21:10',{sn:'81003'})];
 const model=c.module.exports.buildModel({reportDate:'10/09/2026',sections:{'RESTAURANT 24%':{rows,reported:36}}});
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 try{
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('file://'+path.resolve(__dirname,'h-sweep.html'));await p.waitForFunction(()=>!!window.__t);
  await p.evaluate(model=>{
   const t=window.__t;t.setModel(model);t.setState({date:model.reportDate,receipts:{},extras:[]});t.setStateKey('void-test');t.showScreen('app');t.renderAccordions();
   document.querySelectorAll('.acc').forEach(a=>a.classList.add('open'));
  },JSON.parse(JSON.stringify(model)));
  const list=p.locator('.acc[data-dept="RESTAURANT"] > .body > .rrow');
  assert.equal(await list.count(),2);const keys=await list.evaluateAll(rs=>rs.map(r=>r.dataset.key).sort());
  assert.deepEqual(keys,['81002|201','81003|201']);
  assert.equal((await p.evaluate(()=>window.__t.getModel().receipts.find(r=>r.sn==='81001'))).entries.length,5);
  assert.deepEqual(errors,[]);
  console.log('PASS cancelled repeated receipt absent from active accordion; independent receipts retained; evidence intact');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
