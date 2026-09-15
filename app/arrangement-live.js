"use strict";
const fs=require("fs"), path=require("path"), {spawn}=require("child_process");
const calc=require("./arrangement");
function layout(g, convert){
  const r=g.rect, s=g.strip;
  if(!r||!s||![r.x,r.y,r.width,r.height,s.x,s.y,s.width,s.height].every(Number.isFinite)
     ||r.width<100||r.height<100||s.width<20||s.height<10
     ||s.x<r.x||s.y<r.y||s.x+s.width>r.x+r.width+2||s.y+s.height>r.y+r.height+2) return null;
  const bounds=convert(r), scale=bounds.width/r.width;
  const strip={x:(s.x-r.x)*scale,y:(s.y-r.y)*scale,width:s.width*scale,height:s.height*scale};
  return {bounds,strip,scale};
}
class InvoiceState {
  constructor(){this.reset();}
  reset(id=null){this.id=id;this.g=null;this.inv=null;this.last=0;this.textWidth=-1;this.forInv=null;this.forRefs=null;this.result=null;}
  accept(m,now){
    if(m.kind==="hide"){this.reset();return;}
    if(m.kind==="reset"){
      if(m.id!==this.id)this.reset(m.id);
      this.inv=null;return;
    }
    if(m.id!==this.id)this.reset(m.id);
    if(m.kind==="geometry"){this.g=m;this.last=now;if(Number.isFinite(m.textWidth))this.textWidth=m.textWidth;}
    if(m.kind==="invoice"){
      const d=m.data, f=d?.fields;
      if(!Array.isArray(f)||f.length!==9||!f.every(s=>typeof s==="string")||!Array.isArray(d.rows)||d.rows.length>400||!d.rows.every(r=>r&&["label","amount","date","currency"].every(k=>typeof r[k]==="string"))){
        this.inv=null;return;
      }
      const [name,room,arr,dep,remarks,title,balance,currency,status]=f;
      this.inv={name,room,arr,dep,remarks,title,balance,currency,status,rows:d.rows,complete:m.complete===true};
      this.textWidth=Number.isFinite(m.textWidth)?m.textWidth:-1;
    }
  }
  display(refs,now){
    if(!this.g||now-this.last>750) return null;
    // Geometry arrives ten times a second; reservation matching/calculation belongs
    // only to a new invoice snapshot or a changed reference set.
    if(this.forInv!==this.inv || this.forRefs!==refs || !this.result){
      this.result=calc.evaluate(this.inv,refs);this.forInv=this.inv;this.forRefs=refs;
    }
    return {result:this.result,g:this.g,textWidth:this.textWidth,remarks:this.inv?.remarks||""};
  }
}
function start({electron,helperPath,captureDir,userData}){
  const {app,BrowserWindow,screen,ipcMain}=electron;
  const state=new InvoiceState(), file=path.join(userData,"arrangement-rates-v1.json");
  let refs=[],child=null,overlay=null,ready=false,lastPaint="",lastBounds="",pending=null,closed=false,buffer="",stamps={},disabled=false;
  try{const r=JSON.parse(fs.readFileSync(file,"utf8"));if(Array.isArray(r))refs=calc.mergeRefs([],r);}catch(e){}
  function hide(){pending=null;lastPaint="";if(overlay&&!overlay.isDestroyed())overlay.hide();}
  function paint(){
    if(disabled||closed)return;
    try{paintNow();}catch(e){
      disabled=true;state.reset();
      try{hide();}catch(ignored){}
      console.error("Arrangement overlay stopped:",e.message);
    }
  }
  function paintNow(){
    if(closed)return;
    const d=state.display(refs,Date.now());
    if(!d||d.result.state==="outside"){hide();return;}
    const l=layout(d.g,r=>screen.screenToDipRect(null,r));
    if(!l){hide();return;}
    if(!overlay){
      overlay=new BrowserWindow({x:0,y:0,width:200,height:100,transparent:true,frame:false,show:false,
        alwaysOnTop:true,skipTaskbar:true,focusable:false,resizable:false,movable:false,hasShadow:false,
        webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false,
          preload:path.join(__dirname,"arrangement-preload.js")}});
      overlay.setIgnoreMouseEvents(true);
      overlay.setAlwaysOnTop(true,"pop-up-menu");
      overlay.webContents.setWindowOpenHandler(()=>({action:"deny"}));
      overlay.webContents.on("will-navigate",e=>e.preventDefault());
      overlay.webContents.once("did-finish-load",()=>{ready=true;lastPaint="";paint();});
      overlay.on("closed",()=>{overlay=null;ready=false;lastPaint="";lastBounds="";});
      overlay.loadFile(path.join(__dirname,"arrangement.html"));
    }
    if(!ready)return;
    const b=JSON.stringify(l.bounds);
    if(b!==lastBounds){overlay.setBounds(l.bounds);lastBounds=b;}
    const packet={result:d.result,strip:l.strip,textWidth:d.textWidth<0?-1:d.textWidth*l.scale};
    const p=JSON.stringify(packet);
    pending={p,id:state.id};
    if(p!==lastPaint){
      lastPaint=p;
      overlay.webContents.send("arrangement-paint",packet);
    }
    // Reveal only after the renderer confirms it has replaced the previous reservation.
  }
  ipcMain.on("arrangement-painted",(e,p)=>{
    if(!overlay||e.sender!==overlay.webContents||!pending||p!==pending.p||pending.id!==state.id)return;
    if(!state.display(refs,Date.now()))return;
    overlay.showInactive();
  });
  function scanRefs(){
    if(closed||disabled)return;
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
        if(fresh.length){refs=calc.mergeRefs(refs,fresh);changed=true;}
      }catch(e){}
    }
    if(changed){
      try{fs.writeFileSync(file+".tmp",JSON.stringify(refs));fs.renameSync(file+".tmp",file);}catch(e){}
      lastPaint="";paint();
    }
  }
  const timer=setInterval(paint,100), refTimer=setInterval(scanRefs,1000);
  scanRefs();
  try{
    child=spawn(helperPath,["invoice",String(process.pid)],{windowsHide:true,stdio:["ignore","pipe","ignore"]});
    child.stdout.setEncoding("utf8");
    child.stdout.on("data",chunk=>{
      buffer+=chunk;
      if(buffer.length>2000000){buffer="";state.reset();hide();return;}
      let n;
      while((n=buffer.indexOf("\n"))>=0){
        const line=buffer.slice(0,n);buffer=buffer.slice(n+1);
        try{
          const m=JSON.parse(line);
          if(m.kind==="reset"||m.kind==="hide")hide();
          state.accept(m,Date.now());
        }catch(e){state.reset();hide();}
      }
      paint();
    });
    child.on("error",()=>{state.reset();hide();});
    child.on("exit",()=>{state.reset();hide();});
  }catch(e){state.reset();hide();}
  app.once("before-quit",()=>{
    closed=true;clearInterval(timer);clearInterval(refTimer);hide();
    // Do not kill a reader while a native control owns its scratch pointer.
    // It notices the parent’s exit and closes itself after returning from the read.
    if(overlay&&!overlay.isDestroyed())overlay.destroy();
  });
  return {state,scanRefs};
}
module.exports={layout,InvoiceState,start};
