"use strict";
const fs=require("fs"), path=require("path"), {spawn}=require("child_process");
const calc=require("./arrangement");
function layout(g, convert){
  const r=g.rect, s=g.strip, q=g.grid;
  if(!r||!s||![r.x,r.y,r.width,r.height,s.x,s.y,s.width,s.height].every(Number.isFinite)
     ||r.width<100||r.height<100||s.width<20||s.height<10
     ||s.x<r.x||s.y<r.y||s.x+s.width>r.x+r.width+2||s.y+s.height>r.y+r.height+2) return null;
  // The tint belongs to the actual B ListView, never the whole Invoice.
  if(!q||![q.x,q.y,q.width,q.height].every(Number.isFinite)||q.width<20||q.height<20
     ||q.x<r.x||q.y<r.y||q.x+q.width>r.x+r.width||q.y+q.height>r.y+r.height) return null;
  const bounds=convert(r), scale=bounds.width/r.width;
  const strip={x:(s.x-r.x)*scale,y:(s.y-r.y)*scale,width:s.width*scale,height:s.height*scale};
  const grid={x:(q.x-r.x)*scale,y:(q.y-r.y)*scale,width:q.width*scale,height:q.height*scale};
  return {bounds,strip,grid,scale};
}
function invoiceFields(f){
  if(!Array.isArray(f)||f.length!==9||!f.every(s=>typeof s==="string"))return null;
  const [name,room,arr,dep,remarks,title,balance,currency,status]=f;
  return {name,room,arr,dep,remarks,title,balance,currency,status,rows:[],complete:false};
}
class InvoiceState {
  constructor(){this.reset();}
  reset(id=null){
    this.id=id;this.g=null;this.inv=null;this.meta=null;this.fields=null;this.epoch=null;this.last=0;this.textWidth=-1;
    this.forInv=null;this.forRefs=null;this.result=null;this.scopeMeta=null;this.scopeRefs=null;this.scopeValue=null;
  }
  accept(m,now){
    if(m.kind==="hide"){this.reset();return;}
    if(m.kind==="reset"){
      if(m.id!==this.id)this.reset(m.id);
      this.inv=null;this.meta=null;this.fields=null;this.epoch=null;return;
    }
    if(m.id!==this.id)this.reset(m.id);
    if(m.kind==="geometry"){this.g=m;this.last=now;if(Number.isFinite(m.textWidth))this.textWidth=m.textWidth;}
    if(m.kind==="metadata"){
      if(!Number.isSafeInteger(m.epoch)||m.epoch<1||!invoiceFields(m.fields)){
        this.inv=null;this.meta=null;this.fields=null;this.epoch=null;return;
      }
      if(this.epoch!==null&&m.epoch<this.epoch)return;
      this.epoch=m.epoch;this.fields=JSON.stringify(m.fields);
      this.meta=invoiceFields(m.fields);this.inv=this.meta;
    }
    if(m.kind==="invoice"){
      // A row read is usable only with the exact metadata generation that requested it.
      if(!this.meta||m.epoch!==this.epoch)return;
      const d=m.data;
      if(!d||JSON.stringify(d.fields)!==this.fields||!Array.isArray(d.rows)||d.rows.length>400||!d.rows.every(r=>r&&["label","amount","date","currency"].every(k=>typeof r[k]==="string"))){
        this.inv=this.meta;return;
      }
      this.inv={...this.meta,rows:d.rows,complete:m.complete===true};
      this.textWidth=Number.isFinite(m.textWidth)?m.textWidth:-1;
    }
  }
  readScope(refs){
    if(!this.meta)return null;
    if(this.scopeMeta!==this.meta||this.scopeRefs!==refs){
      const value=calc.eligible(this.meta,calc.reference(this.meta,refs));
      // Re-enabling must obtain fresh rows: entries may have changed while paused.
      if(value!==true||(this.scopeMeta===this.meta&&this.scopeValue!==true))this.inv=this.meta;
      this.scopeValue=value;this.scopeMeta=this.meta;this.scopeRefs=refs;
    }
    return this.scopeValue;
  }
  display(refs,now){
    if(!this.g||!this.meta||!this.inv||now-this.last>750)return null;
    this.readScope(refs);
    // Geometry arrives ten times a second; matching belongs only to new data.
    if(this.forInv!==this.inv || this.forRefs!==refs || !this.result){
      this.result=calc.evaluate(this.inv,refs);this.forInv=this.inv;this.forRefs=refs;
    }
    return {result:this.result,g:this.g,textWidth:this.textWidth,remarks:this.inv.remarks||""};
  }
}
function start({electron,helperPath,captureDir,userData,spawnHelper=spawn}){
  const {app,BrowserWindow,screen,ipcMain}=electron;
  const state=new InvoiceState(), file=path.join(userData,"arrangement-rates-v1.json"),noRefs=[];
  let refs=[],child=null,overlay=null,ready=false,lastPaint="",lastBounds="",pending=null,closed=false,buffer="",stamps={},lastScope="";
  let inputBroken=false,nextHelperAt=0,helperRetry=1000,nextOverlayAt=0,overlayRetry=1000;
  let refsLoaded=false,refsDirty=false,refFault="";
  function readSavedRefs(){
    let raw;
    try{raw=fs.readFileSync(file,"utf8");}catch(e){if(e.code==="ENOENT")return [];throw e;}
    const r=JSON.parse(raw);
    if(!Array.isArray(r)||r.some(x=>!x||typeof x!=="object"||Array.isArray(x)||
      !["IH","AR","DP"].includes(x.tag)||!Number.isFinite(x.at)||x.at<0||
      !["name","room","arr","dep","price","agency","currency"].every(k=>typeof x[k]==="string")||
      calc.day(x.arr)===null||calc.day(x.dep)===null))throw new Error("Saved daily-price history is unreadable");
    return r;
  }
  function referenceFault(message,error){
    const next=message||"";
    if(refFault===next)return;
    refFault=next;lastPaint="";
    if(error)console.error(next+":",error.message||error);
    paint();
  }
  function hide(){pending=null;lastPaint="";try{if(overlay&&!overlay.isDestroyed())overlay.hide();}catch(e){retireOverlay(e);}}
  function retireOverlay(error){
    const failed=overlay;overlay=null;ready=false;pending=null;lastPaint="";lastBounds="";
    nextOverlayAt=Date.now()+overlayRetry;overlayRetry=Math.min(overlayRetry*2,30000);
    if(failed){try{failed.hide();}catch(ignore){}try{if(!failed.isDestroyed())failed.destroy();}catch(ignore){}}
    if(error)console.error("Arrangement display will retry:",error.message||error);
  }
  function paint(){
    if(closed)return;
    try{paintNow();}catch(e){
      // A failed app-owned window/geometry conversion must not permanently disable
      // the service. Keep source identity; a retry still needs fresh valid geometry.
      retireOverlay(e);
    }
  }
  function paintNow(){
    if(closed)return;
    if(child&&!inputBroken&&state.meta){
      const command="scope "+state.epoch+" "+(!refFault&&state.readScope(refs)===true?"read":"skip")+"\n";
      if(command!==lastScope){
        try{child.stdin.write(command);lastScope=command;}
        catch(e){inputBroken=true;state.inv=state.meta;console.error("Arrangement reader connection failed:",e.message||e);}
      }
    }
    if((refFault||inputBroken)&&state.meta)state.inv=state.meta;
    const d=state.display(refFault?noRefs:refs,Date.now());
    if(d&&refFault)d.result={state:"unknown",icon:"🤔",text:refFault,tint:false};
    else if(d&&inputBroken&&d.result.state!=="outside")d.result={state:"unknown",icon:"🤔",text:"Invoice reader connection needs recovery",tint:false};
    if(!d||d.result.state==="outside"){hide();return;}
    if(!overlay&&Date.now()<nextOverlayAt)return;
    const l=layout(d.g,r=>screen.screenToDipRect(null,r));
    if(!l){hide();return;}
    if(!overlay){
      overlay=new BrowserWindow({x:0,y:0,width:200,height:100,transparent:true,frame:false,show:false,
        alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,movable:false,hasShadow:false,
        webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false,
          preload:path.join(__dirname,"arrangement-preload.js")}});
      const created=overlay;
      overlay.setIgnoreMouseEvents(true);
      overlay.setAlwaysOnTop(true,"pop-up-menu");
      overlay.webContents.setWindowOpenHandler(()=>({action:"deny"}));
      overlay.webContents.on("will-navigate",e=>e.preventDefault());
      overlay.webContents.on("render-process-gone",()=>{if(overlay===created)retireOverlay("renderer exited");});
      overlay.webContents.on("did-fail-load",()=>{if(overlay===created)retireOverlay("display could not load");});
      overlay.webContents.once("did-finish-load",()=>{if(overlay===created){ready=true;lastPaint="";paint();}});
      overlay.on("closed",()=>{if(overlay===created){overlay=null;ready=false;pending=null;lastPaint="";lastBounds="";}});
      const loaded=overlay.loadFile(path.join(__dirname,"arrangement.html"));
      if(loaded&&typeof loaded.catch==="function")loaded.catch(e=>{if(overlay===created)retireOverlay(e);});
    }
    if(!ready)return;
    const b=JSON.stringify(l.bounds);
    if(b!==lastBounds){overlay.setBounds(l.bounds);lastBounds=b;}
    const packet={result:d.result,strip:l.strip,grid:l.grid,textWidth:d.textWidth<0?-1:d.textWidth*l.scale};
    const p=JSON.stringify(packet);
    pending={p,id:state.id};
    if(p!==lastPaint){
      overlay.hide(); // never leave an earlier verdict visible while a replacement is unpainted
      lastPaint=p;
      overlay.webContents.send("arrangement-paint",packet);
    }
    // Reveal only after the renderer confirms it has replaced the previous reservation.
  }
  ipcMain.on("arrangement-painted",(e,p)=>{
    if(!overlay||e.sender!==overlay.webContents||!pending||p!==pending.p||pending.id!==state.id)return;
    if(!state.display(refFault?noRefs:refs,Date.now()))return;
    try{overlay.showInactive();overlayRetry=1000;}catch(e){retireOverlay(e);}
  });
  function scanRefs(){
    if(closed)return;
    if(!refsLoaded){
      try{refs=calc.mergeRefs([],readSavedRefs());refsLoaded=true;referenceFault("");}
      catch(e){referenceFault("Saved daily-price history could not be read; original data retained",e);return;}
    }
    let changed=false;
    for(const tag of ["IH","AR","DP"]){
      try{
        const p=path.join(captureDir,"rc-list-"+tag+".tsv"), st=fs.statSync(p);
        const stamp=st.mtimeMs+":"+st.size;
        if(stamps[tag]===stamp)continue;
        if(st.size>4000000)continue;
        const text=fs.readFileSync(p,"utf8");
        stamps[tag]=stamp;
        const fresh=calc.capture(text,tag,st.mtimeMs);
        if(fresh.length){refs=calc.mergeRefs(refs,fresh);refsDirty=true;changed=true;}
      }catch(e){}
    }
    persistRefs();
    if(changed){
      lastPaint="";paint();
    }
  }
  function persistRefs(){
    if(refsDirty){
      try{
        // Re-read before replacement: a concurrently repaired/changed store is not
        // empty, and an unreadable original must never be overwritten by a new capture.
        refs=calc.mergeRefs(readSavedRefs(),refs);
        fs.writeFileSync(file+".tmp",JSON.stringify(refs));fs.renameSync(file+".tmp",file);
        refsDirty=false;referenceFault("");
      }catch(e){
        try{fs.unlinkSync(file+".tmp");}catch(ignore){}
        referenceFault("Daily-price history could not be saved; retrying with original data retained",e);
        return false;
      }
    }
    return true;
  }
  function ingestCapture(tag,text,at){
    if(closed)return false;
    if(tag==="MV")return true; // Moves contain no Arrangement price reference.
    if(!["IH","AR","DP"].includes(tag)||typeof text!=="string"||!Number.isFinite(at)||at<0)return false;
    const lines=text.split(/\r?\n/).map(s=>s.split("\t")),done=lines.find(c=>c[0]==="DONE");
    const title=lines.find(c=>c[0]==="TITLE")?.[1]||"";
    const titleOK=tag==="IH"?/in\s*-?\s*house/i.test(title):tag==="AR"?/arrival\s*report/i.test(title):/departure\s*report/i.test(title);
    const date=(title.match(/\b\d{2}\/\d{2}\/(?:\d{4}|\d{2})\b/)||[])[0];
    if(!done||done[6]!=="complete"||!Number.isInteger(+done[1])||+done[1]<0||+done[1]!==+done[2]||
      lines.some(c=>c[0]==="ERR")||!titleOK||calc.day(date)===null)return false;
    try{
      // Archive replay is independent of the latest-file timestamps. Load/validate
      // the durable store before accepting even a duplicate queued capture.
      const saved=readSavedRefs(),next=calc.mergeRefs(saved,refs.concat(calc.capture(text,tag,at)));
      refsDirty=refsDirty||JSON.stringify(next)!==JSON.stringify(saved);
      refs=next;refsLoaded=true;
    }catch(e){
      referenceFault("Saved daily-price history could not be read; original data retained",e);return false;
    }
    if(!persistRefs())return false;
    referenceFault("");lastPaint="";paint();
    return true;
  }
  function retireHelper(current,error){
    if(child!==current)return;
    child=null;inputBroken=false;buffer="";lastScope="";state.reset();hide();
    nextHelperAt=Date.now()+helperRetry;helperRetry=Math.min(helperRetry*2,30000);
    if(error)console.error("Arrangement reader will retry:",error.message||error);
  }
  function startHelper(){
    if(closed||child||Date.now()<nextHelperAt)return;
    let current;
    try{
      current=spawnHelper(helperPath,["invoice",String(process.pid)],{windowsHide:true,stdio:["pipe","pipe","ignore"]});
      child=current;inputBroken=false;buffer="";lastScope="";
      current.stdin.on("error",()=>{
        if(child!==current)return;
        inputBroken=true;state.inv=state.meta;hide();paint();
        // A live native reader may still own scratch memory. Wait for its actual
        // exit/close before replacing it; never kill or duplicate it on a pipe error.
      });
      current.stdout.setEncoding("utf8");
      current.stdout.on("data",chunk=>{
        if(child!==current||closed)return;
        buffer+=chunk;
        if(buffer.length>2000000){buffer="";state.reset();hide();return;}
        let n;
        while((n=buffer.indexOf("\n"))>=0){
          const line=buffer.slice(0,n);buffer=buffer.slice(n+1);
          try{
            const m=JSON.parse(line);
            if(m.kind==="reset"||m.kind==="hide")hide();
            state.accept(m,Date.now());
            if(m.kind==="geometry"||m.kind==="metadata")helperRetry=1000;
          }catch(e){state.reset();hide();}
        }
        paint();
      });
      current.on("error",e=>{
        if(child!==current)return;
        if(!current.pid)retireHelper(current,e); // failed spawn owns no running reader
        else{inputBroken=true;state.inv=state.meta;hide();paint();}
      });
      current.on("exit",()=>retireHelper(current));
      current.on("close",()=>retireHelper(current));
    }catch(e){
      if(!current){nextHelperAt=Date.now()+helperRetry;helperRetry=Math.min(helperRetry*2,30000);console.error("Arrangement reader will retry:",e.message||e);}
      else if(!current.pid)retireHelper(current,e);
      else{inputBroken=true;state.reset();hide();}
    }
  }
  const timer=setInterval(()=>{startHelper();paint();},100), refTimer=setInterval(scanRefs,1000);
  scanRefs();
  startHelper();
  app.once("before-quit",()=>{
    closed=true;clearInterval(timer);clearInterval(refTimer);hide();
    // Do not kill a reader while a native control owns its scratch pointer.
    // It notices the parent’s exit and closes itself after returning from the read.
    if(overlay&&!overlay.isDestroyed())overlay.destroy();
  });
  return {state,scanRefs,ingestCapture};
}
module.exports={layout,InvoiceState,start};
