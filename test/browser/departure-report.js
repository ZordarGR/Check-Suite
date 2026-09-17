require("./fresh.js")();
const {chromium}=require("playwright-core"),path=require("path"),assert=require("assert");
(async()=>{
 const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
 try{
 const p=await b.newPage({viewport:{width:1280,height:800}});
 const errors=[];p.on("pageerror",e=>errors.push(e.message));
 await p.addInitScript(()=>{
  localStorage.setItem("reccheck_moves_v2",JSON.stringify({"101":{"20260901":{d:20260918,n:"SYNTHETIC ALPHA",seen:20260917}},"102":{"20260903":{d:20260919,n:"SYNTHETIC BETA",seen:20260917}}}));
  localStorage.setItem("reccheck_receipts_v1",JSON.stringify({"20260905":[["101","SYNTHETIC ALPHA"]]}));
  window.print=()=>{window.dispatchEvent(new Event("beforeprint"));window.dispatchEvent(new Event("beforeprint"));window.dispatchEvent(new Event("afterprint"));};
 });
 await p.goto("file://"+path.resolve(__dirname,"h-sweep.html"));
 await p.waitForFunction(()=>!!window.__t);
 await p.evaluate(()=>window.__t.showScreen("reports"));
 await p.click("#departureReportBtn");
 await p.fill("#drFrom","2026-09-18");await p.fill("#drTo","2026-09-19");await p.click("#drBuild");
 assert.equal(await p.locator("#drResults tbody tr").count(),2);
 assert((await p.locator("#drResults").innerText()).includes("Yes"));
 assert(!await p.locator("#drPrint").isDisabled());
 await p.click("#drPrint");
 const printed=await p.locator("#printSheet").innerText();
 assert(printed.includes("01/09/2026")&&printed.includes("18/09/2026"));
 assert(!printed.includes("SYNTHETIC"));assert.equal(await p.locator("#printSheet th").count(),4);
 assert.equal(await p.locator("#printSheet tbody tr").count(),2);
 await p.emulateMedia({media:"print"});
 assert(await p.locator("#printSheet").isVisible());
 await p.pdf({path:"departure-report-smoke.pdf",format:"A4",printBackground:true});
 await p.emulateMedia({media:"screen"});
 await p.click("#departureReportBtn");
 await p.fill("#drFrom","2026-09-20");await p.fill("#drTo","2026-09-19");await p.click("#drBuild");
 assert(await p.locator("#drPrint").isDisabled());assert((await p.locator("#drNote").innerText()).includes("valid"));
 await p.fill("#drTo","2026-09-21");await p.click("#drBuild");
 assert.equal(await p.locator("#drResults tbody tr").count(),0);assert(await p.locator("#drPrint").isDisabled());
 assert.deepEqual(errors,[]);
 console.log("Departure report browser: preview, date filters, empty/invalid input, four print columns, repeated print event and PDF PASS");
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
