const {chromium}=require("playwright-core"), path=require("path"), fs=require("fs"), assert=require("assert");
(async()=>{
 const roots=fs.readdirSync("/opt/pw-browsers").filter(n=>/^chromium-\d+$/.test(n)).sort();
 const executablePath="/opt/pw-browsers/"+roots.at(-1)+"/chrome-linux/chrome";
 const fallback="/opt/pw-browsers/"+roots.at(-1)+"/chrome-linux64/chrome";
 const b=await chromium.launch({executablePath:fs.existsSync(executablePath)?executablePath:fallback,headless:true,args:["--no-sandbox"]});
 try{
  const p=await b.newPage({viewport:{width:1767,height:603}});
  await p.addInitScript(()=>{window.arrangement={onPaint:cb=>window.paint=cb,painted:x=>window.ack=x};});
  await p.goto("file://"+path.resolve("app/arrangement.html"));
  const layouts=[
   {viewport:{width:1767,height:603},strip:{x:610,y:110,width:370,height:18},grid:{x:610,y:142,width:550,height:380}},
   {viewport:{width:1920,height:1000},strip:{x:650,y:180,width:520,height:27},grid:{x:650,y:214,width:780,height:650}},
   {viewport:{width:1440,height:800},strip:{x:495.5,y:90.5,width:380.5,height:22},grid:{x:495.5,y:120.5,width:520.5,height:550}},
   {viewport:{width:1767,height:603},strip:{x:620,y:120,width:370,height:18},grid:{x:620,y:152,width:560,height:390}}
  ];
  let checks=0;
  for(const {viewport,strip:s,grid:g} of layouts){
   await p.setViewportSize(viewport);
   for(const state of ["paid","difference","unpaid","unknown"]){
    let firstPosition;
    for(const textWidth of [120,348,370,900,-1,undefined]){
     const packet={result:{state,icon:state==="paid"?"✓":state==="unknown"?"🤔":"✕",text:"€180.00 × 7 nights = €1,260.00. Paid €1,110.00. Under €150.00.",tint:state==="unpaid"},textWidth,strip:s,grid:g};
     await p.evaluate(v=>{window.ack=null;window.paint(v);},packet);
     await p.waitForFunction(v=>window.ack===JSON.stringify(v),packet);
     const r=await p.evaluate(()=>{
      const icon=document.getElementById("icon"),detail=document.getElementById("detail"),tint=document.getElementById("tint");
      return {icon:icon.getBoundingClientRect().toJSON(),iconText:icon.textContent,detailRect:detail.getBoundingClientRect().toJSON(),
       detail:getComputedStyle(detail).display,detailText:detail.textContent,tint:getComputedStyle(tint).display,
       tintRect:tint.getBoundingClientRect().toJSON(),tintColor:getComputedStyle(tint).backgroundColor,pointer:[document.body,icon,detail,tint].map(x=>getComputedStyle(x).pointerEvents)};
     });
     assert(r.icon.top>=s.y&&r.icon.bottom<=s.y+s.height,"status icon must remain inside the B name tile row");
     assert(r.icon.left>=s.x&&r.icon.right<=s.x+s.width,"status icon must remain inside the B name tile width");
     assert(s.x+s.width-r.icon.right<=5,"status icon belongs at the name tile's right edge");
     assert(Math.abs(r.icon.y+r.icon.height/2-(s.y+s.height/2))<0.1,"status icon must be vertically centred on the title");
     const position=[r.icon.x,r.icon.y];
     if(firstPosition)assert.deepEqual(position,firstPosition,"text measurement must not move the status icon");
     else firstPosition=position;
     assert.equal(r.iconText,packet.result.icon);
     assert.equal(r.detail,state==="paid"?"none":"block");
     if(state!=="paid"){
      assert(r.detailRect.top>=s.y+s.height+2,"calculation and explanations must remain below the title");
      assert(r.detailRect.left>=0&&r.detailRect.right<=viewport.width,"explanation must remain readable within the window");
      assert.equal(r.detailText,packet.result.text);
     }
     assert.equal(r.tint,state==="unpaid"?"block":"none");
     assert.equal(r.tintColor,"rgba(255, 0, 0, 0.05)");
     if(state==="unpaid"){
      for(const k of ["x","y","width","height"])assert(Math.abs(r.tintRect[k]-g[k])<0.02,"unpaid tint must cover only B entries grid");
      assert(r.tintRect.top>=s.y+s.height,"B title must remain untinted");
      assert(r.tintRect.left>0&&r.tintRect.right<viewport.width,"neighbouring panes must remain untinted");
      assert(r.tintRect.bottom<viewport.height-20,"balance and Invoice footer must remain untinted");
     }
     assert(r.pointer.every(x=>x==="none"),"overlay must remain click-through");
     checks++;
    }
   }
  }
  // A missing or invalid rectangle must clear even a previously visible tint.
  for(const grid of [undefined,null,{x:-1,y:150,width:500,height:300},{x:600,y:150,width:1500,height:300},{x:600,y:150,width:0,height:300},{x:600,y:NaN,width:500,height:300}]){
   const base={result:{state:"unpaid",icon:"✕",text:"No accommodation payment",tint:true},strip:layouts[3].strip,grid:layouts[3].grid};
   await p.evaluate(v=>{window.ack=null;window.paint(v);},base);
   await p.waitForFunction(v=>window.ack===JSON.stringify(v),base);
   const invalid={...base,grid};
   await p.evaluate(v=>{window.ack=null;window.paint(v);},invalid);
   await p.waitForFunction(v=>window.ack===JSON.stringify(v),invalid);
   assert.equal(await p.$eval("#tint",el=>getComputedStyle(el).display),"none","invalid geometry must not retain or expand tint");
  }
  console.log(checks+" overlay placement cases plus 6 invalid-grid cases passed: B-grid-only tint, title icons, explanations below, all states and moved/resized/restored geometry.");
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
