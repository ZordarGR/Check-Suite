/* Shipped desktop startup functions, with synthetic windows and IPC. */
const fs=require("fs"),vm=require("vm"),assert=require("assert/strict"),path=require("path"),{pathToFileURL}=require("url"),{EventEmitter}=require("events");
const source=fs.readFileSync("app/main.js","utf8");
function extract(start,ending){
  for(let end=source.indexOf(ending,start);end>=0;end=source.indexOf(ending,end+1)){
    const code=source.slice(start,end+ending.length);
    try{new vm.Script(code);return code;}catch{}
  }
  throw Error("Cannot extract shipped startup code");
}
const lift=n=>{const match=new RegExp('\\n(?:async )?function '+n+'\\(').exec(source);return extract(match.index+1,"}");};
function rig(){
  const handlers={},windows=[],effects=[];
  class Window extends EventEmitter{
    constructor(options={}){
      super();this.options=options;this.destroyed=false;this.visible=options.show!==false;windows.push(this);
      this.webContents=new EventEmitter();this.webContents.mainFrame={};
      this.webContents.send=(...args)=>effects.push(["send",...args]);
      this.webContents.executeJavaScript=async script=>{effects.push(["progress",script]);};
    }
    loadURL(url){this.url=url;effects.push(["load",url]);return Promise.resolve();}
    isDestroyed(){return this.destroyed;}destroy(){this.destroyed=true;effects.push(["destroy"]);}
    show(){this.visible=true;effects.push(["show"]);}hide(){this.visible=false;}focus(){effects.push(["focus"]);}
  }
  const c=vm.createContext({win:null,startupGate:null,startupChecking:false,QUITTING:false,INSTALLING_UPDATE:false,console,
    BrowserWindow:Window,path,pathToFileURL,__dirname:"/synthetic",encodeURIComponent,
    updater:{pending:{version:"synthetic"},check:async()=>null,promote:()=>true},destroyOverlay(){},
    launchPendingInstaller:async()=>false,ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}}});
  const stages=source.slice(source.indexOf("const STARTUP_STAGES ="),source.indexOf("function startupHTML"));
  const names=["startupHTML","startupProgress","startupStage","showMain","finishMainStartup","createWindow","startupUpdate"];
  const ipc=["app-ready","app-startup-progress"].map(n=>extract(source.indexOf('ipcMain.handle("'+n+'",'),");"));
  vm.runInContext(stages+names.map(lift).join("\n")+ipc.join("\n"),c);
  return {c,handlers,windows,effects};
}
(async()=>{
  const r=rig();await r.c.startupUpdate();
  assert(r.c.startupGate && !r.c.startupGate.destroyed,"startup progress remains visible after checking updates");
  assert(r.c.startupGate.url.includes("startupProgress"));
  r.c.createWindow("/synthetic/index.html");const main=r.c.win,gate=r.c.startupGate;
  assert.equal(main.options.show,false);assert.equal(main.visible,false);
  r.c.showMain();assert.equal(main.visible,false,"tray/second instance cannot reveal an unfinished window");
  assert.equal(r.handlers["app-ready"]({sender:{}}),false);
  assert.equal(r.handlers["app-ready"]({sender:main.webContents,senderFrame:{}}),false);
  const event={sender:main.webContents,senderFrame:main.webContents.mainFrame};
  assert.equal(r.handlers["app-startup-progress"]({sender:{}},"rooms"),false);
  assert.equal(r.handlers["app-startup-progress"](event,"unknown"),false);
  assert.equal(r.handlers["app-startup-progress"](event,"rooms"),true);
  assert(r.effects.some(e=>e[0]==="progress" && e[1].includes("Loading room names and nicknames")));
  main.emit("ready-to-show");assert.equal(main.visible,false,"first paint is not data readiness");
  assert.equal(r.handlers["app-ready"](event),true);assert.equal(main.visible,false,"backend readiness is required too");
  main.startupBackend=true;await r.c.finishMainStartup();
  assert.equal(main.visible,true);assert.equal(gate.destroyed,true);assert.equal(r.c.startupGate,null);
  const shown=r.effects.filter(e=>e[0]==="show").length;
  r.handlers["app-ready"](event);assert.equal(r.effects.filter(e=>e[0]==="show").length,shown,"duplicate ready messages do not resurface a hidden app");
  assert.equal(r.handlers["app-startup-progress"](event,"rooms"),false);
  assert(r.effects.some(e=>e[0]==="send" && e[1]==="reccheck-update-ready"),"pending update is delivered after renderer listeners are ready");
  console.log("PASS hidden main window waits for scripts/data, backend initialization and paint; startup progress stays visible; foreign frames and early tray reveals are rejected");
})().catch(e=>{console.error(e);process.exitCode=1;});
