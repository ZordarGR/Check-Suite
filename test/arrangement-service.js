const assert=require("assert"),{EventEmitter}=require("events"),fs=require("fs"),os=require("os"),path=require("path");
const {start}=require("../app/arrangement-live");
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"arrangement-service-"));
 const app=new EventEmitter(),ipcMain=new EventEmitter(),child=new EventEmitter();
 child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};
 let window,packet;
 class Win extends EventEmitter{
  constructor(options){
   super();window=this;this.options=options;this.visible=false;this.dead=false;
   this.webContents=new EventEmitter();
   this.webContents.setWindowOpenHandler=()=>{};
   this.webContents.send=(_channel,p)=>{packet=p;};
  }
  setIgnoreMouseEvents(v){this.clickThrough=v;}
  setAlwaysOnTop(){}
  setBounds(v){this.bounds=v;}
  loadFile(){setImmediate(()=>this.webContents.emit("did-finish-load"));}
  isDestroyed(){return this.dead;}
  showInactive(){this.visible=true;}
  hide(){this.visible=false;}
  destroy(){this.dead=true;this.emit("closed");}
 }
 const txt="TITLE\tGuests inhouse: 15/09/26\nRATE\tIH\tTEST GUEST\t101\t14/09/26\t21/09/26\t150,00\tDIRECT\tEUR\tCI\nDONE\t1\t1\t0\t0\tunicode\tcomplete\n";
 fs.writeFileSync(path.join(dir,"rc-list-IH.tsv"),txt);
 start({electron:{app,ipcMain,BrowserWindow:Win,screen:{screenToDipRect:(_w,r)=>r}},helperPath:"unused",captureDir:dir,userData:dir,spawnHelper:()=>child});
 const send=m=>child.stdout.emit("data",JSON.stringify(m)+"\n");
 const g={kind:"geometry",id:"one",rect:{x:50,y:80,width:1000,height:600},strip:{x:390,y:170,width:370,height:20},grid:{x:390,y:200,width:620,height:350},textWidth:80};
 const invoice={kind:"invoice",id:"one",complete:true,textWidth:80,data:{fields:["TEST GUEST","101","14/09/26","21/09/26","","INDIVIDUAL","-900,00","EUR","CI"],rows:[{label:"*Arrangement",amount:"150,00",date:"14/09/26",currency:"EUR"},{label:"PAYMENT",amount:"-1.050,00",date:"14/09/26",currency:"EUR"}]}};
 send(g);send(invoice);
 await new Promise(r=>setTimeout(r,30));
 assert(window.clickThrough);assert.equal(window.options.focusable,false);assert.equal(window.visible,false);
 assert.equal(packet.result.state,"paid");
 assert.deepEqual(packet.grid,{x:340,y:120,width:620,height:350});
 const paid=JSON.stringify(packet);
 ipcMain.emit("arrangement-painted",{sender:window.webContents},paid);assert(window.visible);
 send({...invoice,complete:false});
 assert.equal(window.visible,false,"hide earlier green while replacement is not painted");
 ipcMain.emit("arrangement-painted",{sender:window.webContents},paid);assert.equal(window.visible,false,"ignore stale paint acknowledgement");
 ipcMain.emit("arrangement-painted",{sender:window.webContents},JSON.stringify(packet));assert(window.visible);
 send({kind:"hide"});assert.equal(window.visible,false);
 send(g);send(invoice);
 ipcMain.emit("arrangement-painted",{sender:window.webContents},JSON.stringify(packet));assert(window.visible);
 // Grid changes must be painted before the overlay is revealed again.
 send({...g,grid:{x:390,y:200,width:560,height:320}});
 assert.deepEqual(packet.grid,{x:340,y:120,width:560,height:320});
 assert.equal(window.visible,false);
 ipcMain.emit("arrangement-painted",{sender:window.webContents},JSON.stringify(packet));assert(window.visible);
 const current=JSON.stringify(packet);
 send({...g,grid:null});assert.equal(window.visible,false);
 ipcMain.emit("arrangement-painted",{sender:window.webContents},current);assert.equal(window.visible,false,"missing grid rejects stale acknowledgement");
 send(g);
 ipcMain.emit("arrangement-painted",{sender:window.webContents},JSON.stringify(packet));assert(window.visible);
 window.webContents.emit("render-process-gone");assert.equal(window.visible,false,"renderer crash cannot leave a stale verdict");
 app.emit("before-quit");
 console.log("Real service flow: click-through, no focus, paint acknowledgement, stale verdicts, close and renderer failure passed");
})().catch(e=>{console.error(e);process.exit(1);});
