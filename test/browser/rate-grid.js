require("./fresh.js")();
const {chromium}=require("playwright-core"),assert=require("assert"),path=require("path");
(async()=>{
 const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
 try{
  const p=await b.newPage(),errors=[];p.on("pageerror",e=>errors.push(e.message));
  await p.goto("file://"+path.resolve(__dirname,"h-sweep.html"));await p.waitForFunction(()=>window.__tx);
  await p.evaluate(()=>{
   window.__t.showScreen("tax");
   const rooms={"101":{room:"101",name:"SYNTHETIC FULL GUEST",arr:"01/09/26",dep:"01/11/26",adjoining:false}};
   window.__fixtureRate={dateKey:20260925,bizDate:"25/09/26",rooms,count:1};
   window.__rcRateGrids=[{...rooms["101"],at:1,complete:true,nights:[{date:"25/09/26",room:"101",tax:false}]}];
   window.__tx.setRate(window.__fixtureRate);
  });
  assert.match(await p.locator("#results").innerText(),/TAX package missing/,"roster warns before Tax report");
  await p.evaluate(()=>window.__tx.setTax({dateKey:20260925,fileDate:"25/09/26",rooms:{"101":{arr:1,auto:1,man:0}}},20260925));
  assert.match(await p.locator("#results").innerText(),/TAX package missing/,"posting does not conceal package problem");
  await p.evaluate(()=>{window.__rcRateGrids[0].nights[0].tax=true;window.__tx.setRate(window.__fixtureRate);});
  assert.match(await p.locator("#results .legend").innerText(),/1 occupied rooms posted correctly/);
  await p.evaluate(()=>{window.__rcRateGrids[0].complete=false;window.__tx.setRate(window.__fixtureRate);});
  assert.match(await p.locator("#results").innerText(),/Rate by Day Grid incomplete/);
  await p.evaluate(()=>window.__tx.setTax({dateKey:20261101,fileDate:"01/11/26",rooms:{}},20261101));
  assert(!/Rate by Day Grid incomplete/.test(await p.locator("#results").innerText()),"departure night exempt");
  await p.evaluate(()=>{window.__rcRateGrids[0].name="DIFFERENT GUEST";window.__tx.setTax({dateKey:20260925,fileDate:"25/09/26",rooms:{"101":{arr:1,auto:1,man:0}}},20260925);});
  assert.match(await p.locator("#results .legend").innerText(),/1 occupied rooms posted correctly/);
  await p.screenshot({path:"test/browser/rate-grid.png",fullPage:true});
  assert.deepEqual(errors,[]);console.log("PASS Rate by Day Grid package warnings, roster, posted tax, incomplete capture, identity and departure boundary");
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
