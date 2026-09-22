require('./fresh.js')();
const {chromium}=require('playwright-core'),assert=require('assert'),path=require('path');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 try{
  const p=await b.newPage({viewport:{width:1400,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{
   window.failSetting=false;window.settingCalls=0;
   window.reccheckArrangement={get:async()=>({ok:true,enabled:localStorage.getItem('test-arr-setting')!=='off'}),set:async on=>{
    window.settingCalls++;await new Promise(r=>setTimeout(r,60));
    if(window.failSetting)return {ok:false};localStorage.setItem('test-arr-setting',on?'on':'off');return {ok:true,enabled:on};
   }};
  });
  const open=async()=>{await p.evaluate(()=>window.rcShowAudit());await p.waitForFunction(()=>!document.querySelector('#arrangementToggle').disabled);};
  await p.goto('file://'+path.resolve(__dirname,'h-sweep.html'));await p.waitForFunction(()=>!!window.rcShowAudit);await open();
  assert(await p.locator('#arrangementToggle').isChecked());
  for(const width of [1400,1920]){
   await p.setViewportSize({width,height:900});
   const r=await p.evaluate(()=>({option:document.querySelector('#aDept').getBoundingClientRect().toJSON(),control:document.querySelector('.arrangementControl').getBoundingClientRect().toJSON()}));
   assert(r.control.left>r.option.right&&r.control.right<=width);assert(Math.abs((r.option.left+r.option.right)/2-width/2)<3,'audit options stay centred');
  }
  await p.screenshot({path:path.resolve(__dirname,'arrangement-toggle-desktop.png')});
  await p.locator('#arrangementToggle').click();await p.waitForFunction(()=>!document.querySelector('#arrangementToggle').disabled);
  assert(!await p.locator('#arrangementToggle').isChecked());
  await p.reload();await p.waitForFunction(()=>!!window.rcShowAudit);await open();assert(!await p.locator('#arrangementToggle').isChecked());
  await p.evaluate(()=>window.failSetting=true);await p.locator('#arrangementToggle').click();await p.waitForFunction(()=>!document.querySelector('#arrangementToggle').disabled);
  assert(!await p.locator('#arrangementToggle').isChecked());assert.match(await p.locator('#arrangementStatus').innerText(),/Could not save|Δεν αποθηκεύτηκε/);
  await p.evaluate(()=>window.failSetting=false);await p.locator('#arrangementToggle').focus();await p.keyboard.press('Space');await p.waitForFunction(()=>!document.querySelector('#arrangementToggle').disabled);assert(await p.locator('#arrangementToggle').isChecked());
  await p.setViewportSize({width:800,height:900});const r=await p.evaluate(()=>({nav:document.querySelector('#auditScreen .mNav').getBoundingClientRect().toJSON(),control:document.querySelector('.arrangementControl').getBoundingClientRect().toJSON(),wide:document.documentElement.scrollWidth>innerWidth}));
  assert(r.control.top>=r.nav.bottom&&!r.wide);await p.screenshot({path:path.resolve(__dirname,'arrangement-toggle-narrow.png')});
  assert.deepEqual(errors,[]);console.log('PASS Audit arrangement switch: placement, centred options, persistence, save failure, keyboard and narrow layout');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
