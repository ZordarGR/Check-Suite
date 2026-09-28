// Cloud only. Real Electron overlay with synthetic reader events and a temporary store.
"use strict";
const electron=require("electron"),fs=require("fs"),os=require("os"),path=require("path"),{EventEmitter}=require("events"),assert=require("assert");
const {app,BrowserWindow}=electron;
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"arrangement-electron-"));
 const date=n=>{const d=new Date(Date.now()+n*86400000);return [String(d.getUTCDate()).padStart(2,"0"),String(d.getUTCMonth()+1).padStart(2,"0"),d.getUTCFullYear()].join("/");};
 const arr=date(-2),dep=date(5),agencies=["BOOKING.COM","EXPEDIA","INDIVIDUAL","WEBHOTELIER"];
 const refs=agencies.map((agency,i)=>({tag:"IH",at:Date.now(),name:"SYNTHETIC GUEST "+i,room:String(101+i),arr,dep,price:"100,00",currency:"EUR",agency}));
 fs.writeFileSync(path.join(dir,"arrangement-rates-v1.json"),JSON.stringify(refs));
 let child,timer,index=0;
 const g={kind:"geometry",id:"synthetic",rect:{x:20,y:20,width:1000,height:600},strip:{x:350,y:110,width:350,height:20},grid:{x:350,y:140,width:550,height:380},textWidth:80};
 const send=m=>child.stdout.emit("data",JSON.stringify(m)+"\n");
 const fields=()=>[refs[index].name,refs[index].room,arr,dep,"SYNTHETIC NOTE","UNRELATED B NAME","-600,00","EUR","CI"];
 const feed=()=>{send(g);send({kind:"metadata",id:g.id,epoch:index+1,fields:fields()});send({kind:"invoice",id:g.id,epoch:index+1,complete:true,data:{fields:fields(),rows:[{label:"Deposit",amount:"-700,00",date:arr,currency:"EUR"}]}});};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 app.on("web-contents-created",(_e,w)=>{w.on("console-message",(_e,...a)=>console.log("RENDERER",...a));w.on("render-process-gone",(_e,d)=>console.log("GONE",JSON.stringify(d)));w.on("preload-error",(_e,p,e)=>console.log("PRELOAD",p,e.message));});
 try{
  const service=require("../app/arrangement-live").start({electron,helperPath:"unused",captureDir:dir,userData:dir,spawnHelper:()=>{
   child=new EventEmitter();child.pid=123;child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};child.stdin=new EventEmitter();child.stdin.write=command=>{
    const p=command.trim().split(" ");setImmediate(()=>send({kind:"scope",epoch:+p[1],read:p[2]==="read",request:+p[3]||0}));return true;
   };return child;
  }});
  timer=setInterval(()=>send(g),100);
  for(index=0;index<agencies.length;index++){
   feed();const deadline=Date.now()+10000;
   let win;
   while(Date.now()<deadline){win=BrowserWindow.getAllWindows()[0];if(win&&win.isVisible())break;await wait(50);}
   assert(win&&win.isVisible(),"Overlay never became visible for "+agencies[index]);
   assert.equal(await win.webContents.executeJavaScript('document.getElementById("icon").textContent'),"✓");
   service.setEnabled(false);assert(!win.isVisible(),"Disabled overlay stayed visible");
   service.setEnabled(true);await wait(150);feed();await wait(300);
   assert(win.isVisible(),"Overlay failed after off/on");
   console.log("PASS real Electron display and toggle",agencies[index]);
  }
  console.log("PASS all real Electron arrangement checks");app.exit(0);
 }catch(e){console.error(e.stack);app.exit(1);}finally{clearInterval(timer);}
});
