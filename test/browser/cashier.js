/* Exercise the shipped page with synthetic cash, including a real browser restart. */
const {chromium}=require('playwright-core'),assert=require('assert/strict'),fs=require('fs'),path=require('path'),http=require('http'),os=require('os');
(async()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../../app/index.html'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'cashier-test-')),errors=[];
 let context;
 const launch=async()=>chromium.launchPersistentContext(profile,{executablePath:process.env.PW_BROWSER||'/usr/bin/chromium',headless:true,args:['--no-sandbox'],viewport:{width:1280,height:900}});
 const url='http://127.0.0.1:'+server.address().port;
 const open=async()=>{
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.locator('#cashierBtn').click();return page;
 };
 try{
  context=await launch();let page=await open();
  const base=()=>page.locator('#cashierBase'),result=()=>page.locator('#cashierResult').getAttribute('data-verdict');
  const count=i=>page.locator('#cashierCounts input').nth(i);
  const amount=(i,v)=>page.locator('#cashierAmount'+i).fill(v);
  assert.equal(await page.locator('.cashierAmounts input').count(),2);
  assert.equal(await page.locator('[data-cashier=amount1]').textContent(),'deposit cash (€)');
  assert.equal(await page.locator('[data-cashier=amount2]').textContent(),'cash payment (€)');
  assert.equal(await base().inputValue(),'500');assert.equal(await result(),'required');
  await page.locator('#cashierCounts input').evaluateAll(nodes=>nodes.forEach(n=>{n.value='1';n.dispatchEvent(new Event('input',{bubbles:true}));}));
  assert.equal(await page.locator('#cashierCounted').textContent(),'888.88 €');
  await page.locator('#cashierReset').click();
  await base().fill('612.34');assert.equal(await page.evaluate(()=>localStorage.getItem('reccheck_cashier_base_v1')),'61234');
  await count(0).fill('4');await count(4).fill('4');await count(7).fill('6');await count(14).fill('1'); // 512.84
  await amount(1,'-100');await amount(2,'0.50');
  assert.equal(await result(),'ok');assert.equal(await page.locator('#cashierCounted').textContent(),'512.84 €');
  await amount(2,'0.51');assert.equal(await result(),'short');assert((await page.locator('#cashierResult').textContent()).includes('0.01'));
  await amount(2,'0.49');assert.equal(await result(),'over');
  await count(0).fill('1.5');assert.equal(await result(),'required');
  await count(0).fill('-1');assert.equal(await result(),'required');
  await count(0).fill('4');await amount(2,'0.001');assert.equal(await result(),'required');
  await amount(2,'0.50');await base().fill('9007199254740992');assert.equal(await result(),'required');
  await base().fill('90071992547409.91');await amount(1,'0.01');await amount(2,'-90071992547409.91');
  assert.equal(await result(),'required','overflowing intermediate sums cannot become a valid rounded result');
  await amount(1,'-100');await amount(2,'0.50');
  await base().fill('612.34');await count(0).focus();await page.keyboard.press('Enter');assert(await count(1).evaluate(n=>n===document.activeElement));
  await page.locator('#cashierBack').click();assert(await page.locator('#cashierScreen').isHidden());
  assert(await page.locator('#cashierCounts input, .cashierAmounts input').evaluateAll(nodes=>nodes.every(n=>n.value==='')),'Back resets fields immediately');
  await page.locator('#auditBtn').click();assert(await page.locator('#auditScreen').isVisible());
  await page.locator('#aBack').click();await page.locator('#cashierBtn').click();assert.equal(await base().inputValue(),'612.34');
  assert(await page.locator('#cashierCounts input, .cashierAmounts input').evaluateAll(nodes=>nodes.every(n=>n.value==='')),'returning home clears counts and both payments');
  assert.equal(await page.locator('#cashierCounted').textContent(),'0.00 €');assert.equal(await result(),'required');
  for(const logo of ['#homeLogo','#hdrLogo']){
   await count(0).fill('7');await amount(1,'1');await amount(2,'2');
   await page.locator(logo).click();await page.locator('#cashierBtn').click();
   assert(await page.locator('#cashierCounts input, .cashierAmounts input').evaluateAll(nodes=>nodes.every(n=>n.value==='')),'logo home navigation also resets');
   assert.equal(await base().inputValue(),'612.34');
  }
  await page.locator('#cashierReset').click();assert.equal(await base().inputValue(),'612.34');assert.equal(await result(),'required');
  await context.close();context=await launch();page=await open();assert.equal(await base().inputValue(),'612.34');
  assert.equal(await count(0).inputValue(),'');assert.equal(await page.locator('#cashierAmount1').inputValue(),'');
  await page.setViewportSize({width:1180,height:860});
  assert(await page.locator('.cashierTable').evaluate(n=>n.scrollWidth<=n.clientWidth),'all denominations fit the desktop default window');
  await page.screenshot({path:path.join(__dirname,'cashier-dark.png'),fullPage:true});
  await page.locator('#themeSelect').selectOption('light');
  await page.locator('#cashierBack').click();await page.locator('#mLang').evaluate(n=>n.click());await page.locator('#cashierBtn').click();
  assert((await page.locator('#cashierSaved').textContent()).includes('Αποθηκεύτηκε'));
  assert.equal(await page.locator('[data-cashier=amount1]').textContent(),'Προκαταβολή (€)');
  assert.equal(await page.locator('[data-cashier=amount2]').textContent(),'Πληρωμή με μετρητά (€)');
  for(const width of [1280,760,390]){
   await page.setViewportSize({width,height:900});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no page overflow at ${width}`);
  }
  await page.screenshot({path:path.join(__dirname,'cashier-light.png'),fullPage:true});
  await page.locator('#cashierResetAll').click();assert.equal(await base().inputValue(),'500.00');
  assert.equal(await page.evaluate(()=>localStorage.getItem('reccheck_cashier_base_v1')),'50000');
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k==='reccheck_cashier_base_v1')throw Error('synthetic quota');return original.call(this,k,v)};
  });
  await base().fill('600');assert((await page.locator('#cashierSaved').textContent()).includes('δεν αποθηκεύτηκε'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('reccheck_cashier_base_v1')),'50000');
  await page.reload();await page.locator('#cashierBtn').click();assert.equal(await base().inputValue(),'500.00');
  await page.evaluate(()=>localStorage.setItem('reccheck_cashier_base_v1','{"broken":true}'));
  await page.reload();await page.locator('#cashierBtn').click();assert.equal(await base().inputValue(),'');
  assert.equal(await page.evaluate(()=>localStorage.getItem('reccheck_cashier_base_v1')),'{"broken":true}');
  await base().fill('777.77');await page.reload();await page.locator('#cashierBtn').click();assert.equal(await base().inputValue(),'777.77');
  const backup=JSON.stringify({app:'reccheck',data:{reccheck_cashier_base_v1:'88888'}});
  await page.locator('#importFile').setInputFiles({name:'synthetic-backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await page.waitForFunction(()=>localStorage.getItem('reccheck_cashier_base_v1')==='88888');
  await page.waitForLoadState('load');await page.locator('#cashierBtn').click();assert.equal(await base().inputValue(),'888.88');
  await page.locator('#importFile').setInputFiles({name:'invalid-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({app:'reccheck',data:{reccheck_cashier_base_v1:'-1'}}))});
  await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Invalid saved data'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('reccheck_cashier_base_v1')),'88888');
  assert.deepEqual(errors,[]);
  console.log('PASS Cashier Check: exact cents, surplus/shortage, invalid/unsafe values, Enter, navigation, reset, full browser restart, Greek/light theme, viewport fit, failed and corrupt storage.');
 }finally{if(context)await context.close();server.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
