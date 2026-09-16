const assert=require("assert"),{EventEmitter}=require("events"),fs=require("fs"),os=require("os"),path=require("path");
const {start}=require("../app/arrangement-live");
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"arrangement-service-"));
 const app=new EventEmitter(),ipcMain=new EventEmitter(),child=new EventEmitter();
 child.stdout=new EventEmitter();child.stdout.setEncoding=()=>{};
 const commands=[];child.stdin=new EventEmitter();child.stdin.write=s=>{commands.push(s);return true;};
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
 const controller=start({electron:{app,ipcMain,BrowserWindow:Win,screen:{screenToDipRect:(_w,r)=>r}},helperPath:"unused",captureDir:dir,userData:dir,spawnHelper:()=>child});
 const send=m=>child.stdout.emit("data",JSON.stringify(m)+"\n");
 const g={kind:"geometry",id:"one",rect:{x:50,y:80,width:1000,height:600},strip:{x:390,y:170,width:370,height:20},grid:{x:390,y:200,width:620,height:350},textWidth:80};
 const invoice={kind:"invoice",id:"one",epoch:1,complete:true,textWidth:80,data:{fields:["TEST GUEST","101","14/09/26","21/09/26","","INDIVIDUAL","-900,00","EUR","CI"],rows:[{label:"*Arrangement",amount:"150,00",date:"14/09/26",currency:"EUR"},{label:"PAYMENT",amount:"-1.050,00",date:"14/09/26",currency:"EUR"}]}};
 send(g);send({kind:"metadata",id:"one",epoch:1,fields:invoice.data.fields});send(invoice);
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
 send(g);send({kind:"metadata",id:"one",epoch:1,fields:invoice.data.fields});send(invoice);
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
 // No visible thinking icon while an excluded account changes at checkout.
 send({kind:"reset",id:"one"});assert.equal(window.visible,false);
 send(g);assert.equal(window.visible,false,"geometry alone stays quiet");
 const excluded={...invoice,epoch:2,data:{...invoice.data,fields:invoice.data.fields.map((v,i)=>i===5?"FICTIONAL AGENCY":v)}};
 send({kind:"metadata",id:"one",epoch:2,fields:excluded.data.fields});
 assert.equal(commands.at(-1),"scope 2 skip\n");
 assert.equal(window.visible,false,"excluded metadata creates no flash");
 ipcMain.emit("arrangement-painted",{sender:window.webContents},current);assert.equal(window.visible,false);
 send({...excluded,complete:false});assert.equal(window.visible,false,"incomplete excluded rows stay hidden");
 const checkout=excluded.data.fields.map((v,i)=>i===6?"0,00":i===8?"CO":v);
 send({kind:"metadata",id:"one",epoch:3,fields:checkout});
 assert.equal(commands.at(-1),"scope 3 skip\n");assert.equal(window.visible,false);
 const sent=commands.length;send(g);send(g);assert.equal(commands.length,sent,"geometry does not resend scope or scan rows");
 // A later WEBHOTELIER list may qualify the SAME invoice without reopening.
 fs.writeFileSync(path.join(dir,"rc-list-IH.tsv"),txt.replace("DIRECT","WEBHOTELIER"));
 controller.scanRefs();
 assert.equal(commands.at(-1),"scope 3 read\n");
 assert.equal(packet.result.state,"unknown");
 send({...invoice,epoch:3,data:{...invoice.data,fields:checkout}});
 assert.equal(packet.result.state,"paid");
 ipcMain.emit("arrangement-painted",{sender:window.webContents},JSON.stringify(packet));assert(window.visible);
 // Qualifying invoices retain live updates when an Arrangement is moved into B.
 send({...invoice,epoch:3,data:{fields:checkout,rows:[...invoice.data.rows,{label:"*Arrangement",amount:"150,00",date:"15/09/26",currency:"EUR"}]}});
 assert.equal(packet.result.state,"paid");
 // An old queued read cannot restore a verdict after a new reservation.
 send({kind:"metadata",id:"one",epoch:4,fields:checkout.map((v,i)=>i===0?"OTHER GUEST":v)});
 send({...invoice,epoch:3,data:{...invoice.data,fields:checkout}});
 assert.equal(packet.result.state,"unknown");assert.equal(commands.at(-1),"scope 4 skip\n");
 window.webContents.emit("render-process-gone");assert.equal(window.visible,false,"renderer crash cannot leave a stale verdict");
 app.emit("before-quit");
 assert(commands.includes("scope 1 read\n"));
 console.log("Eligibility gate, checkout without flashes, late list activation, live refresh and real service flow: click-through, no focus, paint acknowledgement, stale verdicts, close and renderer failure passed");
})().catch(e=>{console.error(e);process.exit(1);});
