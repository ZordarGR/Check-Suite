require("./fresh.js")();
const {chromium}=require("playwright-core"), path=require("path"), assert=require("assert");
(async()=>{
 const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
 const p=await browser.newPage();const errors=[];p.on("pageerror",e=>errors.push(e.message));
 await p.addInitScript(()=>{
  const D=Date,pin=new D(2026,8,5,1).getTime();window.Date=class extends D{constructor(...a){super(...(a.length?a:[pin]));}static now(){return pin;}};
  localStorage.setItem("reccheck_legacy","0");
  localStorage.setItem("reccheck_rooms",JSON.stringify({"120":{guest:"MORGAN/BRIGGS DAVID/ELENA",liveKey:20260904}}));
  window.__files={};window.__times={};
  window.reccheckShortcuts={get:()=>Promise.resolve({profiles:[],active:null,available:true}),helper:()=>Promise.resolve({state:"started"}),
   listFile:tag=>Promise.resolve(window.__files[tag]?{tag,text:window.__files[tag],at:window.__times[tag]}:null)};
 });
 await p.goto("file://"+path.resolve(__dirname,"h-sweep.html"));
 await p.waitForTimeout(300);
 await p.evaluate(()=>{
  const old="MORGAN/BRIGGS DAVID/ELENA";
  localStorage.setItem("reccheck_status_v1",JSON.stringify({
   DP:{"20260904":{rows:{old:{name:old,room:"90",arr:"01/09/26",last:100},now:{name:old,room:"120",arr:"01/09/26",last:300}}}},
   MV:{"20260903":{rows:{move:{name:"MORGAN/BRIGGS",from:"90",to:"120",arr:"01/09/26",dep:"04/09/26",x:"X"}}}}
  }));
  const r={sn:"80001",roomMain:"120",room:"120",guest:"KELLER/STONE ANNA/MORGAN",dept:"REST",total:10,cancelled:false,voided:false,rates:{"24%":10,"13%":0,"6%":0,base:10},time:"21:14"};
  const depts={};for(const d of ["REST","RESTAURANT","CAFETERIA","TAVERNAKI","KAFENIO","BAR"])depts[d]={list:d==="REST"?[r]:[],other:[]};
  window.__t.setModel({reportDate:"4/9/2026",receipts:[r],depts});window.__t.setState({receipts:{},extras:[]});window.__t.setStateKey("20260904");window.__t.showScreen("app");document.getElementById("searchWrap").style.display="block";window.__rcMovesChanged();
  const input=document.getElementById("snInput");input.value="80001";input.dispatchEvent(new Event("input"));
 });
 await p.waitForSelector("#matches .match");
 let card=await p.locator("#matches .match").evaluate(n=>({name:n.querySelector(".name").textContent,left:n.classList.contains("left")}));
 assert.equal(card.name,"KELLER/STONE ANNA/MORGAN");assert.equal(card.left,false);
 const pills=await p.locator("#moves").evaluate(n=>[...n.querySelectorAll("[class*='mvPill']")].map(x=>({text:x.textContent,cls:x.className})));
 // Use visible departure text independent of the pill's CSS naming.
 const panel=await p.locator("#moves").textContent();assert(panel.includes("120"));assert(!/\b90\b/.test(panel));
 assert.equal(await p.locator("#moves .rec").count(),0);
 console.log("PASS real card preserves receipt name and has no false LEFT TODAY; obsolete departure room and dot absent");
 const tsv=(tag,title,rows)=>["TITLE\t"+title,...rows.map(r=>tag+"\t"+r.join("\t")),"DONE\t"+rows.length+"\t"+rows.length+"\t1\t1\tunicode\tcomplete"].join("\n");
 await p.evaluate(()=>{localStorage.removeItem("reccheck_status_v1");window.__t.showScreen("tax");});
 const full=tsv("IH","Guests inhouse: 04/09/26",[
 ["ALPHA TEST","101","2/0/0/0/0","01/09/26","04/09/26","CI"],
 ["BETA TEST","102","1/0/0/0/0","02/09/26","08/09/26","CI"]]);
 await p.evaluate(txt=>{window.__files.IH=txt;window.__times.IH=1000;},full);
 await p.waitForFunction(()=>window.__tx.rate()?.count===2,{},{timeout:15000});
 const small=tsv("IH","Guests inhouse: 04/09/26",[["BETA TEST","102","1/0/0/0/0","02/09/26","08/09/26","CI"]]);
 await p.evaluate(txt=>{window.__files.IH=txt;window.__times.IH=2000;},small);
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem("reccheck_status_v1")).IHL?.rows.length===1,{},{timeout:15000});
 assert.equal(await p.evaluate(()=>window.__tx.rate().count),2);
 console.log("PASS real capture loop keeps both rooms after a smaller same-day list");
 const dp=tsv("DP","Departure Report for 04/09/26",[["ALPHA TEST","101","2/0/0/0/0","01/09/26","CO"]]);
 await p.evaluate(txt=>{window.__files.DP=txt;window.__times.DP=3000;},dp);
 await p.waitForFunction(()=>window.__tx.rate()?.count===1,{},{timeout:15000});
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem("reccheck_status_v1")).IH.rows.length),2);
 assert.equal(await p.evaluate(()=>Object.keys(window.__tx.rate().rooms)[0]),"102");
 console.log("PASS explicit departure CO retires the matching active stay and preserves stored history");
 assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
