/* Synthetic versions of the surname/given-name rotation reported by the user.
   Exercise the actual capture poll, visible cards/rows, and restart recovery. */
require("./fresh.js")();
const {chromium} = require("playwright-core"), path = require("path"), assert = require("assert/strict"), fs = require("fs"), http = require("http");
const FULL = "KELLER/STONE ALICE/BRUNO/CLARA";
const SHORT = "ALICE/BRUNO/CLARA K", LONG = "ALICE/BRUNO/CLARA KE";
(async () => {
  const html = fs.readFileSync(path.resolve(__dirname,"h-sweep.html"));
  const server = http.createServer((req,res)=>{res.setHeader("Content-Type","text/html; charset=utf-8");res.end(html);});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  try {
    const bundled = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    browser = await chromium.launch({executablePath:process.env.PW_BROWSER || (fs.existsSync(bundled) ? bundled : "/usr/bin/chromium"),args:["--no-sandbox"]});
    const page = await browser.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      const NativeDate = Date, pin = new NativeDate(2026,8,5,1).getTime();
      window.Date = class extends NativeDate {constructor(...a){super(...(a.length?a:[pin]));}static now(){return pin;}};
      localStorage.setItem("reccheck_legacy","0");
      window.__nameCapture = null;
      window.reccheckShortcuts = {
        get:async()=>({profiles:[],active:null,available:true}), helper:async()=>({state:"started"}),
        listFile:async tag=>tag==="IH"?window.__nameCapture:null
      };
    });
    const setup = async () => page.evaluate(({SHORT,LONG}) => {
      const receipts = [SHORT,LONG].map((guest,i)=>({sn:String(91001+i),roomMain:"55",room:"55",guest,dept:"RESTAURANT",
        total:10,cancelled:false,voided:false,time:"21:14",rates:{"24%":10,"13%":0,"6%":0,base:10}}));
      const depts = {};
      for(const d of ["RESTAURANT","CAFETERIA","TAVERNAKI","KAFENIO","BAR"]) depts[d]={list:d==="RESTAURANT"?receipts:[],other:[]};
      window.__t.setModel({reportDate:"4/9/2026",receipts,depts});
      window.__t.setState({receipts:{},extras:[]}); window.__t.setStateKey("4/9/2026");
      window.__t.showScreen("app");window.__t.renderAccordions();
      document.querySelectorAll(".acc").forEach(n=>n.classList.add("open"));
      document.getElementById("searchWrap").style.display="block";
      const input=document.getElementById("snInput");input.value="91001";input.dispatchEvent(new Event("input"));
    }, {SHORT,LONG});
    const card = page.locator("#matches .match .name");
    await page.goto("http://127.0.0.1:"+server.address().port);
    await setup();
    assert.equal(await card.textContent(),LONG,"before capture, the longest compatible printed fragment is shown");
    const before = await page.evaluate(()=>JSON.stringify({receipts:window.__t.getModel().receipts,state:window.__t.getState()}));
    await page.evaluate(FULL=>{window.__nameCapture={at:1000,text:[
      "TITLE\tGuests inhouse: 04/09/26",
      "IH\t"+FULL+"\t55\t3/0/0/0/0\t01/09/26\t04/09/26\tCI",
      "DONE\t1\t1\t1\t1\tunicode\tcomplete"
    ].join("\n")};},FULL);
    await page.waitForFunction(full=>document.querySelector("#matches .match .name")?.textContent===full,FULL,{timeout:15000});
    assert((await card.getAttribute("title")).includes(SHORT),"printed text remains on the tooltip");
    assert.equal(await page.locator("#snInput").inputValue(),"91001","capture preserves the search");
    assert.equal(await page.locator("#accordions .acc.open").count(),1,"capture preserves the open department");
    assert.deepEqual(await page.locator(".rrow .name").evaluateAll(nodes=>nodes.map(n=>n.firstChild.textContent)),[FULL,FULL]);
    assert.equal(await page.evaluate(()=>JSON.stringify({receipts:window.__t.getModel().receipts,state:window.__t.getState()})),before);
    assert.equal(await page.locator("#matches .match.left").count(),0);
    console.log("PASS a complete in-house capture refreshes both reordered cuts live, preserving search, open rows, source names and checks");
    await page.reload(); await setup();
    assert.equal(await card.textContent(),FULL,"saved name resolves both fragments after restart");
    await page.locator("#snInput").fill("91002");
    assert.equal(await card.textContent(),FULL);
    assert((await card.getAttribute("title")).includes(LONG));
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("reccheck_rooms"))["55"].guest),FULL);
    console.log("PASS restart restores full names for both receipt cuts without reopening a list");
    await page.evaluate(()=>{
      window.__rcLiveNames({dateKey:20260905,rooms:{"55":{name:"OTHER GUEST",status:"CI"}},all:{"55":[{name:"OTHER GUEST",status:"CI"}]}});
    });
    assert.equal(await card.textContent(),LONG,"before the departure is captured, a different occupant cannot name this receipt");
    await page.evaluate(SHORT=>{
      const st=JSON.parse(localStorage.getItem("reccheck_status_v1"));
      st.DP={"20260904":{at:2000,rows:{dep:{name:SHORT,room:"55",arr:"01/09/26",status:"CO",first:2000,last:2000}}}};
      localStorage.setItem("reccheck_status_v1",JSON.stringify(st));
      window.__rcMovesChanged();
    },SHORT);
    assert.equal(await page.locator("#matches .match.left").count(),1,"reordered departure resolves through its captured in-house full name");
    assert.equal(await page.locator("#moves .mv-dep.rec").count(),1);
    assert.equal(await card.textContent(),FULL);
    assert.deepEqual(await page.locator(".rrow .name").evaluateAll(nodes=>nodes.map(n=>n.firstChild.textContent)),[FULL,FULL],"departure capture refreshes department rows as well as search cards");
    assert.equal(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem("reccheck_status_v1")).DP["20260904"].rows)[0].name),SHORT);
    console.log("PASS reordered departure matches the in-house name for marking, without rewriting the captured departure");
    await page.evaluate(()=>{
      window.__rcLiveNames({dateKey:20260905,rooms:{"55":{name:"OTHER GUEST",status:"CI"}},all:{"55":[{name:"OTHER GUEST",status:"CI"}]}});
    });
    assert.equal(await card.textContent(),FULL,"captured departing name survives a new room occupant");
    console.log("PASS a captured departing full name remains visible after room turnover");
    await page.reload();await setup();
    assert.deepEqual(await page.locator(".rrow .name").evaluateAll(nodes=>nodes.map(n=>n.firstChild.textContent)),[FULL,FULL],"first department render after restart uses the saved departure/in-house bridge");
    console.log("PASS first department render after restart restores the captured departing name despite a different room occupant");
    assert.deepEqual(errors,[]);
  } finally {if(browser) await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
