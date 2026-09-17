require("./fresh.js")();
const {chromium}=require("playwright-core"),path=require("path"),assert=require("assert");
(async()=>{
 const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
 try{
 for(const locale of ["en-US","en-GB"]){
 const p=await b.newPage({viewport:{width:1280,height:800},locale});
 const errors=[];p.on("pageerror",e=>errors.push(e.message));
 await p.addInitScript(()=>{
  localStorage.setItem("reccheck_moves_v2",JSON.stringify({"101":{"20260901":{d:20260918,n:"SYNTHETIC ALPHA/LONGNAME/WRAPPING/COMPANION/SECOND/GUEST/THIRD/GUEST <TEST> & FAMILY",seen:20260917}},"102":{"20260903":{d:20260919,n:"SYNTHETIC BETA",seen:20260917}}}));
  localStorage.setItem("reccheck_moves_v2",JSON.stringify({...JSON.parse(localStorage.getItem("reccheck_moves_v2")),"163":{"20260910":{d:20260918,n:"SYNTHETIC DUPLICATE",seen:20260917},"20260911":{d:20260918,n:"SYNTHETIC DUPLICATE",seen:20260917}}}));
  localStorage.setItem("reccheck_receipts_v1",JSON.stringify({"20260905":[["101","SYNTHETIC ALPHA/LONGNAME/WRAPPING/COMPANION/SECOND/GUEST/THIRD/GUEST <TEST> & FAMILY"]]}));
  window.print=()=>{window.dispatchEvent(new Event("beforeprint"));window.dispatchEvent(new Event("beforeprint"));window.dispatchEvent(new Event("afterprint"));};
 });
 await p.goto("file://"+path.resolve(__dirname,"h-sweep.html"));
 await p.waitForFunction(()=>!!window.__t);
 await p.evaluate(()=>window.__t.showScreen("reports"));
 await p.click("#departureReportBtn");
 await p.fill("#drFrom","18/09/2026");await p.fill("#drTo","19/09/2026");await p.click("#drBuild");
 assert.equal(await p.locator("#drResults tbody tr").count(),3);
 assert.equal(await p.locator("#drFrom").inputValue(),"18/09/2026");
 assert((await p.locator("#drResults tbody tr").first().locator("td").nth(1).innerText()).endsWith("<TEST> & FAMILY"));
 assert.equal(await p.locator("#drFrom").getAttribute("type"),"text");
 assert((await p.locator("#drResults").innerText()).includes("Yes"));
 assert(!await p.locator("#drPrint").isDisabled());
 await p.click("#drPrint");
 const printed=await p.locator("#printSheet").innerText();
 assert(printed.includes("01/09/2026")&&printed.includes("18/09/2026"));
 assert(printed.includes("SYNTHETIC ALPHA/LONGNAME/WRAPPING/COMPANION/SECOND/GUEST/THIRD/GUEST <TEST> & FAMILY"));assert.equal(await p.locator("#printSheet th").count(),5);
 assert.equal(await p.locator("#printSheet test").count(),0);
 assert(printed.includes("Conflicting saved dates")&&printed.includes("10/09/2026")&&printed.includes("11/09/2026"));
 assert.equal(await p.locator("#printSheet tbody tr").filter({hasText:"SYNTHETIC DUPLICATE"}).count(),1);
 assert.equal(await p.locator("#printSheet tbody tr").count(),3);
 await p.emulateMedia({media:"print"});
 assert(await p.locator("#printSheet").isVisible());
 assert(await p.locator("#printSheet td").nth(1).evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await p.pdf({path:"departure-report-"+locale+".pdf",format:"A4",printBackground:true});
 await p.emulateMedia({media:"screen"});
 await p.click("#departureReportBtn");
 await p.fill("#drFrom","09/18/2026");await p.click("#drBuild");assert(await p.locator("#drPrint").isDisabled());
 await p.fill("#drFrom","31/09/2026");await p.click("#drBuild");assert(await p.locator("#drPrint").isDisabled());
 await p.fill("#drFrom","20/09/2026");await p.fill("#drTo","19/09/2026");await p.click("#drBuild");
 assert(await p.locator("#drPrint").isDisabled());assert((await p.locator("#drNote").innerText()).includes("valid"));
 await p.fill("#drTo","21/09/2026");await p.click("#drBuild");
 assert.equal(await p.locator("#drResults tbody tr").count(),0);assert(await p.locator("#drPrint").isDisabled());
 await p.fill("#drFrom","18/09/2026");await p.fill("#drTo","19/09/2026");await p.click("#drBuild");
 assert(!await p.locator("#drPrint").isDisabled());await p.fill("#drFrom","1");assert(await p.locator("#drPrint").isDisabled());
 assert.deepEqual(errors,[]);await p.close();
 }
 console.log("Departure report browser: preview, date filters, empty/invalid input, five print columns with full wrapped escaped names in en-US/en-GB, European input, repeated print event and PDF PASS");
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
