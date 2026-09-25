require("./fresh.js")();
const {chromium}=require("playwright-core"),assert=require("assert"),path=require("path");
(async()=>{
 const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
 try{
  const p=await browser.newPage(),errors=[];p.on("pageerror",e=>errors.push(e.message));
  await p.goto("file://"+path.resolve(__dirname,"h-sweep.html"));await p.waitForFunction(()=>window.__tx);
  await p.evaluate(()=>{
   window.__t.showScreen('tax');const rooms={};
   for(const room of ['101','102','103','104'])rooms[room]={room,name:'SYNTHETIC '+room,arr:'18/09/26',dep:'25/09/26',adjoining:false};
   window.__fixtureRate={dateKey:20260925,bizDate:'25/09/26',count:4,rooms,coverageMissing:Object.keys(rooms)};
   window.__tx.setRate(window.__fixtureRate);
  });
  const show=(night,posted=true)=>p.evaluate(({night,posted})=>{
   const rooms={};if(posted)for(const room of ['101','102','103','104'])rooms[room]={arr:1,auto:1,man:0};
   window.__tx.setTax({dateKey:night,fileDate:night===20260924?'24/09/26':'25/09/26',rooms},night);
  },{night,posted});
  await show(20260924);assert.match(await p.locator('#results .legend').innerText(),/4 occupied rooms posted correctly.*0 not owed/);
  assert(!/Not present in the latest list/.test(await p.locator('#results').innerText()));
  await show(20260925,false);assert.match(await p.locator('#results .legend').innerText(),/0 occupied rooms posted correctly.*4 not owed/);
  assert(!/Not present in the latest list/.test(await p.locator('#results').innerText()));
  await p.evaluate(()=>window.__tx.setRate({...window.__fixtureRate,dateKey:20260924}));await show(20260924);
  assert.equal(await p.locator('#results .row').filter({hasText:'Not present in the latest list'}).count(),4);
  await p.evaluate(()=>window.__tx.setRate(window.__fixtureRate));await show(20260924,false);
  assert.equal(await p.locator('#results .row').count(),4,'missing prior-night charges still shown');
  assert.equal(await p.evaluate(()=>window.__tx.rate().rooms['101'].dep),'25/09/26');
  assert.deepEqual(errors,[]);console.log('PASS departure-night UI: last-night charges checked, departure-night exempt, later-list absence ignored, same-night filtered list protected, saved stay dates unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
