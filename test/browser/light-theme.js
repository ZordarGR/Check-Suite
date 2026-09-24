require("./fresh.js")();
const {chromium}=require("playwright-core"),assert=require("assert"),path=require("path");
(async()=>{
 const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("file://"+path.resolve(__dirname,"h-sweep.html"));await page.waitForFunction(()=>window.__t);
  const theme=()=>page.evaluate(()=>document.documentElement.dataset.theme);
  assert.equal(await theme(),"dark");assert.equal(await page.locator("#themeSelect").inputValue(),"dark");
  await page.locator("#themeSelect").selectOption("light");assert.equal(await theme(),"light");
  assert.equal(await page.evaluate(()=>localStorage.getItem("reccheck_theme")),"light");
  assert.equal(await page.locator("body").evaluate(n=>getComputedStyle(n).backgroundColor),"rgb(255, 255, 255)");
  // Existing controls animate colours for 150ms: wait for their settled light palette.
  await page.waitForFunction(()=>[...document.querySelectorAll("#menuScreen > .mItem")].every(n=>getComputedStyle(n).backgroundColor==="rgb(255, 206, 50)") && ["mcOptionsBtn","mcEditBtn"].every(id=>getComputedStyle(document.getElementById(id)).color==="rgb(17, 17, 17)"));
  for(const s of ["#auditBtn .mLabel","#auditBtn .mSub","#mcOptionsBtn","#mcEditBtn"]){
   assert.equal(await page.locator(s).evaluate(n=>getComputedStyle(n).color),"rgb(17, 17, 17)",s);
  }
  await page.screenshot({path:path.resolve(__dirname,"theme-home.png")});
  await page.reload();await page.waitForFunction(()=>window.__t);assert.equal(await theme(),"light");
  await page.evaluate(()=>{
   const mk=(sn,room,dept)=>({sn,serial:sn,roomMain:room,room,guest:"SYNTHETIC GUEST "+sn,dept,total:12,rates:{"24%":12},entries:[],time:"21:00",cancelled:false,voided:false});
   const receipts=[mk("100","101","RESTAURANT"),mk("101","101","RESTAURANT"),mk("200","202","BAR")],depts={};
   for(const d of ["RESTAURANT","CAFETERIA","TAVERNAKI","KAFENIO","BAR"])depts[d]={list:receipts.filter(r=>r.dept===d),other:[],stillOpen:false};
   const state={date:"24/9/2026",receipts:{},extras:[]};
   for(const r of receipts.filter(r=>r.dept==="RESTAURANT"))state.receipts[window.__t.rKey(r)]={status:"ok",source:window.__t.receiptFingerprint(r)};
   window.__t.setModel({reportDate:"24/9/2026",receipts,depts,validation:[]});window.__t.setState(state);window.__t.setStateKey("reccheck_24/9/2026");
   window.__t.showScreen("app");window.__t.renderAccordions();document.querySelectorAll(".acc").forEach(n=>n.classList.add("open"));document.querySelector("#searchWrap").style.display="block";
  });
  const snapshot=()=>page.evaluate(()=>JSON.stringify({model:window.__t.getModel(),state:window.__t.getState(),storage:Object.fromEntries(Object.entries(localStorage).filter(([k])=>k!=="reccheck_theme"))}));
  const before=await snapshot(),done=page.locator('.acc[data-dept="RESTAURANT"] > .head');
  assert.equal(await done.evaluate(n=>getComputedStyle(n).backgroundColor),"rgb(74, 222, 128)");
  await done.hover();assert.equal(await done.evaluate(n=>getComputedStyle(n).backgroundColor),"rgb(74, 222, 128)");
  for(const s of ['.rrow .room','.rrow .sn','.rrow .amt','.rrow .name','.acc.done > .head .name','#searchHint']){
   assert.equal(await page.locator(s).first().evaluate(n=>getComputedStyle(n).color),"rgb(17, 17, 17)",s);
  }
  await page.screenshot({path:path.resolve(__dirname,"theme-audit.png")});
  await page.locator('.rrow[data-key="100|101"] .roomLookupBtn').click();
  assert.equal(await page.locator("#modal").evaluate(n=>getComputedStyle(n).backgroundColor),"rgb(255, 255, 255)");
  assert.equal(await page.locator("#roomLookupResults .match").count(),1);
  assert.equal(await page.locator("#roomLookupResults .name").evaluate(n=>getComputedStyle(n).color),"rgb(17, 17, 17)");
  await page.screenshot({path:path.resolve(__dirname,"theme-lookup.png")});await page.locator("#roomLookupClose").click();
  assert.equal(await snapshot(),before,"theme/lookup preserve all audit and stored data");
  for(const width of [1440,960,560]){
   await page.setViewportSize({width,height:900});
   const b=await page.locator("#themeSelect").boundingBox();assert(b.x>=0&&b.x+b.width<=width,"theme switch stays visible");
   await page.locator("#themeSelect").selectOption("dark");assert.equal(await theme(),"dark");
   await page.locator("#themeSelect").selectOption("light");assert.equal(await theme(),"light");
  }
  assert.equal(await snapshot(),before);
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.__t.showScreen("tax"));
  assert.equal(await page.locator("#taxScreen").evaluate(n=>getComputedStyle(n).backgroundColor),"rgb(255, 255, 255)");
  assert.equal(await page.locator("#taxScreen header h1").evaluate(n=>getComputedStyle(n).color),"rgb(17, 17, 17)");
  await page.screenshot({path:path.resolve(__dirname,"theme-tax.png")});
  await page.evaluate(()=>window.__t.showScreen("app"));
  await page.emulateMedia({media:"print"});
  assert.equal(await page.locator("body").evaluate(n=>getComputedStyle(n).backgroundColor),"rgb(255, 255, 255)");
  assert.equal(await page.locator("header").first().isVisible(),false,"theme switch does not enter printed reports");
  await page.emulateMedia({media:"screen"});
  await page.evaluate(()=>{window.__originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="reccheck_theme")throw Error("quota");return window.__originalSet.call(this,k,v);};});
  await page.locator("#themeSelect").selectOption("dark");assert.equal(await theme(),"light");assert.equal(await page.locator("#themeSelect").inputValue(),"light");
  assert.match(await page.locator("#toast").innerText(),/could not be saved/);
  await page.evaluate(()=>{Storage.prototype.setItem=window.__originalSet;window.__rcImportBlocked=true;});
  await page.locator("#themeSelect").selectOption("dark");assert.equal(await theme(),"light");
  await page.evaluate(()=>{window.__rcImportBlocked=false;});
  await page.locator("#themeSelect").selectOption("dark");await page.reload();await page.waitForFunction(()=>window.__t);assert.equal(await theme(),"dark");
  assert.deepEqual(errors,[]);
  console.log("PASS optional light theme: dark default, persistence, white/yellow/black UI, completed green and hover, receipt names and lookup, tax, responsive switch, print isolation, write failure and import lock; audit facts unchanged");
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
