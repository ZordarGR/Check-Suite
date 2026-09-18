/* The real service with synthetic Electron/child events. Cloud only; no native reader. */
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),{EventEmitter}=require("events");
const {start}=require("../app/arrangement-live");
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"arrangement-recovery-")),realNow=Date.now;
 let now=realNow(),window,packet,conversionFails=false,throwNextSpawn=false,attempts=0;
 Date.now=()=>now;
 const app=new EventEmitter(),ipcMain=new EventEmitter(),children=[];
 class Win extends EventEmitter{
  constructor(){super();window=this;this.visible=false;this.dead=false;this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(_c,p)=>{packet=p;};}
  setIgnoreMouseEvents(){}setAlwaysOnTop(){}setBounds(){}
  loadFile(){setImmediate(()=>this.webContents.emit("did-finish-load"));}
  isDestroyed(){return this.dead;}showInactive(){this.visible=true;}hide(){this.visible=false;}destroy(){this.dead=true;this.visible=false;this.emit("closed");}
 }
 const day=n=>{const d=new Date(now+n*86400000);return String(d.getUTCDate()).padStart(2,"0")+"/"+String(d.getUTCMonth()+1).padStart(2,"0")+"/"+d.getUTCFullYear();};
 const arr=day(-2),dep=day(5),fields=["TEST GUEST","101",arr,dep,"","INDIVIDUAL","0,00","EUR","CI"];
 fs.writeFileSync(path.join(dir,"rc-list-IH.tsv"),"TITLE\tGuests inhouse: "+day(0)+"\nRATE\tIH\tTEST GUEST\t101\t"+arr+"\t"+dep+"\t100,00\tINDIVIDUAL\tEUR\tCI\nDONE\t1\t1\t0\t0\tunicode\tcomplete\n");
 const g={kind:"geometry",id:"one",rect:{x:0,y:0,width:1000,height:600},strip:{x:200,y:100,width:370,height:20},grid:{x:200,y:130,width:620,height:350}};
 const invoice={kind:"invoice",id:"one",epoch:1,complete:true,data:{fields,rows:[{label:"PAYMENT",amount:"-700,00",date:arr,currency:"EUR"}]}};
 const send=(child,m)=>child.stdout.emit("data",JSON.stringify(m)+"\n");
 const feed=child=>{send(child,g);send(child,{kind:"metadata",id:"one",epoch:1,fields});send(child,invoice);};
 const settle=()=>new Promise(r=>setTimeout(r,25));
 const advance=async ms=>{now+=ms;await new Promise(r=>setTimeout(r,125));};
 const ack=()=>ipcMain.emit("arrangement-painted",{sender:window.webContents},JSON.stringify(packet));
 try{
  start({electron:{app,ipcMain,BrowserWindow:Win,screen:{screenToDipRect:(_w,r)=>{if(conversionFails)throw Error("synthetic geometry conversion");return r;}}},helperPath:"unused",captureDir:dir,userData:dir,
   spawnHelper:()=>{
    attempts++;if(throwNextSpawn){throwNextSpawn=false;throw Error("synthetic failed spawn");}
    const child=new EventEmitter();child.pid=1000+children.length;child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};
    child.stdin=new EventEmitter();child.commands=[];child.stdin.write=s=>{child.commands.push(s);return true;};
    child.kill=()=>{throw Error("A live reader must never be killed during recovery");};children.push(child);return child;
   }});
  feed(children[0]);await settle();assert.equal(packet.result.state,"paid");ack();assert(window.visible);
  await advance(800);assert.equal(window.visible,false,"stale geometry hides the verdict");
  send(children[0],g);ack();assert(window.visible,"fresh geometry resumes without changing reservation");
  const crashed=window,oldPacket=JSON.stringify(packet);crashed.webContents.emit("render-process-gone");assert(crashed.dead);assert.equal(crashed.visible,false);
  await advance(1100);send(children[0],g);await settle();assert.notStrictEqual(window,crashed);assert.equal(packet.result.state,"paid");
  ipcMain.emit("arrangement-painted",{sender:crashed.webContents},oldPacket);assert.equal(window.visible,false,"old renderer cannot reveal a replacement");
  ack();assert(window.visible,"replacement renderer resumes in the same open Invoice");
  conversionFails=true;send(children[0],g);assert(window.dead);conversionFails=false;
  await advance(1100);send(children[0],g);await settle();ack();assert(window.visible,"a transient UI exception does not permanently disable the service");
  const first=children[0];first.emit("exit",1);first.emit("close",1);assert.equal(window.visible,false);
  await advance(1100);assert.equal(children.length,2,"one replacement after confirmed exit, despite exit+close");
  feed(first);assert.equal(window.visible,false,"late old-child data cannot restore a verdict");
  feed(children[1]);await settle();ack();assert(window.visible);assert.equal(packet.result.state,"paid");
  children[1].stdin.emit("error",Error("synthetic broken pipe"));assert.equal(packet.result.state,"unknown");
  await advance(31000);assert.equal(children.length,2,"a broken pipe must not create a second still-live reader");
  send(children[1],g);ack();assert.equal(packet.result.state,"unknown");
  children[1].emit("exit",1);throwNextSpawn=true;
  await advance(1100);assert.equal(attempts,3);assert.equal(children.length,2);
  await advance(2100);assert.equal(attempts,4);assert.equal(children.length,3,"failed spawn retries after bounded delay");
  feed(children[2]);await settle();ack();assert(window.visible);assert.equal(packet.result.state,"paid");
  app.emit("before-quit");children[2].emit("exit",0);await advance(31000);assert.equal(attempts,4,"shutdown cancels all recovery attempts");
  console.log("PASS Arrangement service recovery: stale geometry, renderer crash, transient UI failure, child exit, duplicate exit/close, late packets, broken pipe safety, failed spawn and shutdown");
 }finally{app.emit("before-quit");Date.now=realNow;fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
