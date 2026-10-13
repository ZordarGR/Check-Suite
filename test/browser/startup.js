/* Real renderer boot with deliberately delayed data and archived captures. */
require("./fresh.js")();
const {chromium}=require("playwright-core"),fs=require("fs"),path=require("path"),http=require("http"),assert=require("assert/strict");
(async()=>{
  const html=fs.readFileSync(path.join(__dirname,"h-sweep.html"));
  const server=http.createServer((req,res)=>{res.setHeader("Content-Type","text/html; charset=utf-8");res.end(html);});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  try{
    const bundled="/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
    browser=await chromium.launch({executablePath:process.env.PW_BROWSER||(fs.existsSync(bundled)?bundled:"/usr/bin/chromium"),args:["--no-sandbox"]});
    const page=await browser.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript(()=>{
      const NativeDate=Date,pin=new NativeDate(2026,8,5,1).getTime();
      window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[pin]));}static now(){return pin;}};
      localStorage.setItem("reccheck_legacy","0");
      window.__stages=[];window.__ready=[];window.__captureCalls=0;window.__roomReads=0;window.__roomWrites=0;
      const full="KELLER/STONE ALICE/BRUNO/CLARA";
      window.reccheckApp={setLang:async()=>true,progress:async stage=>{window.__stages.push(stage);return true;},ready:async()=>{
        window.__ready.push({rooms:JSON.parse(localStorage.getItem("reccheck_rooms")),status:JSON.parse(localStorage.getItem("reccheck_status_v1")),
          cursor:JSON.parse(localStorage.getItem("reccheck_capture_cursor")),profile:document.getElementById("homeLogo").textContent,
          zip:typeof JSZip,stages:window.__stages.slice()});return true;
      }};
      window.reccheckFiles={perTool:true,getDir:async()=>null,onDirEvent(){}};
      const rooms=new Promise(resolve=>{window.__releaseRooms=()=>resolve({"55":{guest:full,nick:"saved nickname",liveKey:20260904}});});
      window.reccheckRooms={read:()=>{window.__roomReads++;return rooms;},write:async()=>{window.__roomWrites++;return true;}};
      const cap=(seq,tag,row)=>{
        const at=pin-3600000+seq;
        return {id:String(seq).padStart(19,"0")+"-"+at+"-"+tag+"-"+"a".repeat(32)+".tsv",tag,at,text:[
          "TITLE\t"+(tag==="IH"?"Guests inhouse: ":"Departure Report for ")+"04/09/26",
          tag+"\t"+row.join("\t"),"DONE\t1\t1\t1\t1\tunicode\tcomplete"
        ].join("\n")};
      };
      const captures=[cap(1,"IH",[full,"55","3/0/0/0/0","01/09/26","04/09/26","CI"]),
        cap(2,"DP",["ALICE/BRUNO/CLARA K","55","3/0/0/0/0","01/09/26","CO"]),
        cap(3,"IH",["SECOND SYNTHETIC GUEST","56","1/0/0/0/0","01/09/26","10/09/26","CI"])];
      window.__lastCapture=captures[2].id;
      const profile=new Promise(resolve=>{window.__releaseProfile=()=>resolve({profiles:[{id:"a",name:"Synthetic auditor"}],active:"a",available:true});});
      window.reccheckShortcuts={
        get:()=>profile,
        helper:async()=>({state:"started"}),listFile:async()=>null,
        listCaptures:async after=>{window.__captureCalls++;if(localStorage.getItem("startup-test-fail")==="1")throw Error("Synthetic capture read failure");const rest=captures.filter(c=>c.id>after);return {captures:rest.slice(0,1),more:rest.length>1,rateGrids:[]};}
      };
    });
    await page.goto("http://127.0.0.1:"+server.address().port);
    await page.waitForFunction(()=>window.__roomReads===1);
    assert.equal(await page.evaluate(()=>window.__ready.length),0);
    assert.equal(await page.evaluate(()=>window.__captureCalls),0,"capture replay waits for disk room recovery");
    await page.evaluate(()=>window.__releaseRooms());
    await page.waitForFunction(()=>window.__stages.includes("profile"));
    assert.equal(await page.evaluate(()=>window.__ready.length),0,"window readiness waits for the profile");
    assert.equal(await page.evaluate(()=>window.__captureCalls),0,"language/legacy setup cannot start a parallel capture replay before startup data is ready");
    await page.evaluate(()=>window.__releaseProfile());
    try{await page.waitForFunction(()=>window.__ready.length===1,{},{timeout:10000});}
    catch(e){console.log(await page.evaluate(()=>({stages:window.__stages,calls:window.__captureCalls,reads:window.__roomReads,writes:window.__roomWrites,ready:window.__ready,storage:Object.keys(localStorage),faults:window.__rcStorageFaults,blocked:window.__rcImportBlocked,modal:document.querySelector('#modal')?.textContent})));console.log(errors);throw e;}
    const state=await page.evaluate(()=>({ready:window.__ready[0],last:window.__lastCapture}));
    assert.equal(state.ready.rooms["55"].nick,"saved nickname");
    assert.equal(state.ready.rooms["56"].guest,"SECOND SYNTHETIC GUEST");
    assert.equal(state.ready.cursor,state.last,"all archive batches are committed before revealing the window");
    assert(state.ready.status.DP["20260904"]);
    assert(state.ready.profile.includes("Synthetic auditor"));assert.equal(state.ready.zip,"function");
    assert.deepEqual(state.ready.stages,["folders","rooms","preferences","profile","records","captures","interface"]);
    assert.deepEqual(errors,[]);
    console.log("PASS startup readiness waits for room recovery, profile, scripts and every saved capture batch; progress names each loaded stage and recovered nicknames survive");
    await page.evaluate(()=>localStorage.setItem("startup-test-fail","1"));
    await page.reload();
    await page.waitForFunction(()=>window.__roomReads===1);await page.evaluate(()=>window.__releaseRooms());
    await page.waitForFunction(()=>window.__stages.includes("profile"));await page.evaluate(()=>window.__releaseProfile());
    await page.waitForFunction(()=>window.__ready.length===1);
    assert((await page.locator("#storageFailure").textContent()).includes("Synthetic capture read failure"));
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("reccheck_capture_cursor"))),state.last);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("reccheck_rooms"))["55"].nick),"saved nickname");
    assert.deepEqual(errors,[]);
    console.log("PASS a capture failure opens the recovery banner without hanging startup, advancing the cursor or losing saved room data");
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
