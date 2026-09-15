const {chromium}=require("playwright-core"), path=require("path"), fs=require("fs"), assert=require("assert");
(async()=>{
 const roots=fs.readdirSync("/opt/pw-browsers").filter(n=>/^chromium-\d+$/.test(n)).sort();
 const executablePath="/opt/pw-browsers/"+roots.at(-1)+"/chrome-linux/chrome";
 const fallback="/opt/pw-browsers/"+roots.at(-1)+"/chrome-linux64/chrome";
 const b=await chromium.launch({executablePath:fs.existsSync(executablePath)?executablePath:fallback,headless:true,args:["--no-sandbox"]});
 const p=await b.newPage({viewport:{width:1767,height:603}});
 await p.addInitScript(()=>{window.arrangement={onPaint:cb=>window.paint=cb,painted:x=>window.ack=x};});
 await p.goto("file://"+path.resolve("app/arrangement.html"));
 async function draw(state,textWidth,strip={x:610,y:110,width:370,height:18}){
  const packet={result:{state,icon:state==="paid"?"✓":state==="unknown"?"🤔":"✕",text:"Under €150.00",tint:state==="unpaid"},textWidth,strip};
  await p.evaluate(v=>window.paint(v),packet);
  await p.waitForFunction(v=>window.ack===JSON.stringify(v),packet);
  return await p.evaluate(()=>({icon:document.getElementById("icon").getBoundingClientRect().toJSON(),detail:getComputedStyle(document.getElementById("detail")).display,tint:getComputedStyle(document.getElementById("tint")).display,body:getComputedStyle(document.body).pointerEvents}));
 }
 let r=await draw("paid",120);assert.equal(r.icon.y,110);assert.equal(r.detail,"none");assert.equal(r.tint,"none");assert.equal(r.body,"none");
 r=await draw("unpaid",120);assert.equal(r.tint,"block");assert.equal(r.detail,"block");
 r=await draw("unknown",370);assert(r.icon.y>128);
 await p.setViewportSize({width:1920,height:1000});
 r=await draw("paid",220,{x:650,y:180,width:520,height:27});assert(r.icon.x>1100);assert(r.icon.y>=180&&r.icon.y<207);
 await b.close();console.log("Overlay paid/unpaid/uncertain, long title and resized positions passed");
})().catch(e=>{console.error(e);process.exit(1);});
