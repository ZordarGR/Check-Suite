/* Cloud-only synthetic updater and startup lifecycle regression. Never runs an installer. */
"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),crypto=require("crypto"),vm=require("vm"),{EventEmitter}=require("events");
assert.equal(process.env.CI,"true","Run in cloud CI only");
const {Updater}=require("../app/updater");
const html=Buffer.from("<!DOCTYPE html>"+ " ".repeat(12000)),setup=Buffer.alloc(1048576);setup.write("MZ");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"forced-update-")),nativeFetch=global.fetch;
let count=0;
async function scenario(label,fn){
 const profile=path.join(dir,String(count++));fs.mkdirSync(profile);
 const saved=path.join(profile,"hotel-state.json");fs.writeFileSync(saved,'{"synthetic":"preserve"}');
 const u=new Updater({userDataDir:profile,packagedDir:profile,pkgVersion:"1.0.0",updateUrl:"https://fixture/manifest",fallbackReleaseUrl:"https://fixture/release"});
 const calls=[];let manifest={version:"1.0.1",type:"html",html:"https://fixture/page",sha256:sha(html),force:true};
 global.fetch=async(url,options={})=>{
  calls.push({url:String(url),signal:options.signal});
  if(String(url).startsWith("https://fixture/manifest"))return Response.json(manifest);
  if(url==="https://fixture/page")return new Response(html);
  if(url==="https://fixture/setup")return new Response(setup);
  throw Error("unexpected URL");
 };
 try{await fn(u,calls,m=>{manifest=m;});assert.equal(fs.readFileSync(saved,"utf8"),'{"synthetic":"preserve"}');console.log("PASS "+label);}
 finally{global.fetch=nativeFetch;}
}
(async()=>{
 try{
  for(const flag of [undefined,false,"true",1]){
   await scenario("only literal force:true triggers startup: "+String(flag),async(u,c,set)=>{
    set({version:"1.0.1",type:"html",html:"https://fixture/page",sha256:sha(html),force:flag});
    assert.equal(await u.check({forcedOnly:true}),null);assert.equal(c.length,1);assert(c[0].signal);
   });
  }
  await scenario("forced HTML verifies and promotes before audit, then is not reapplied",async(u,c)=>{
   const p=await u.check({forcedOnly:true});assert.equal(p.forced,true);assert(!p.full);assert(c.every(x=>x.signal));assert(u.promote());assert.equal(u.effective().version,"1.0.1");
   assert.equal(await u.check({forcedOnly:true}),null);assert.equal(c.filter(x=>x.url==="https://fixture/page").length,1);
  });
  for(const digest of [undefined,"bad","0".repeat(64)]){
   await scenario("forced HTML rejects missing/invalid/mismatched hash "+digest,async(u,c,set)=>{
    set({version:"1.0.1",type:"html",html:"https://fixture/page",sha256:digest,force:true});
    assert.equal(await u.check({forcedOnly:true}),null);assert(!u.promote());assert.equal(u.effective().version,"1.0.0");
   });
  }
  await scenario("optional update still downloads for the button without forcing",async(u,c,set)=>{
   set({version:"1.0.1",type:"html",html:"https://fixture/page",sha256:sha(html)});
   const p=await u.check();assert(p&&!p.forced);assert.equal(u.effective().version,"1.0.0");
  });
  await scenario("cached forced flag cannot override a newly optional manifest",async(u,c,set)=>{
   assert((await u.check({forcedOnly:true})).forced);
   set({version:"1.0.1",type:"html",html:"https://fixture/page",sha256:sha(html),force:false});
   assert.equal(await u.check({forcedOnly:true}),null);assert.equal(u.effective().version,"1.0.0");
  });
  const full={version:"1.0.2",engine:"1.0.2",type:"full",setup:"https://fixture/setup",setupSha256:sha(setup),force:true};
  for(const type of ["full","html"]){
   await scenario("forced "+type+" respects required engine and validates installer again",async(u,c,set)=>{
    set({...full,type});const p=await u.check({forcedOnly:true});assert(p.full&&p.forced&&p.downloaded);assert.equal(p.version,"1.0.2");assert(u.installerReady());
    fs.writeFileSync(p.setupPath,"tampered");assert(!u.installerReady());assert.equal(u.effective().version,"1.0.0");
   });
  }
  for(const change of [{setup:undefined},{setupSha256:undefined},{setupSha256:"0".repeat(64)}]){
   await scenario("forced full without usable authenticated installer never auto-opens a release page",async(u,c,set)=>{
    set({...full,...change});assert.equal(await u.check({forcedOnly:true}),null);assert(!u.installerReady());
   });
  }
  await scenario("offline startup falls back to current page",async u=>{
   global.fetch=async()=>{throw Error("offline");};assert.equal(await u.check({forcedOnly:true}),null);assert.equal(u.effective().version,"1.0.0");
  });
  await scenario("aborted download cannot promote a partial page",async u=>{
   global.fetch=async url=>String(url).includes("manifest")?Response.json({version:"1.0.1",type:"html",html:"https://fixture/page",sha256:sha(html),force:true}):{ok:true,arrayBuffer:async()=>{throw Error("AbortError");}};
   assert.equal(await u.check({forcedOnly:true}),null);assert(!u.promote());
  });
  await scenario("installer attempt limit stops automatic retries without a browser fallback",async(u,c,set)=>{
   set(full);const P=u.paths();fs.writeFileSync(P.setupMeta,JSON.stringify({version:"1.0.2",tries:3}));
   assert.equal(await u.check({forcedOnly:true}),null);assert.equal(c.length,1);
  });
  await scenario("automatic launch attempts are bounded across restarts and retain verified manual retry",async(u,c,set)=>{
   set(full);await u.check({forcedOnly:true});
   for(let i=0;i<3;i++)assert(u.claimForcedInstall());
   assert(!u.claimForcedInstall());assert(u.installerReady());
   const next=new Updater(u.o);await next.check({forcedOnly:true});assert(!next.claimForcedInstall());
  });
  await scenario("promotion failure keeps verified current page and all saved data",async u=>{
   await u.check({forcedOnly:true});const P=u.paths();fs.mkdirSync(P.curHtml+".tmp");
   assert(!u.promote());assert.equal(u.effective().version,"1.0.0");
  });
  const src=fs.readFileSync(path.join(__dirname,"../app/main.js"),"utf8");
  const gate=src.slice(src.indexOf("async function startupUpdate(){"),src.indexOf("app.whenReady().then(async"));
  const install=src.slice(src.indexOf("let INSTALLING_UPDATE ="),src.indexOf('ipcMain.handle("reccheck-apply-update"'));
  function context({pending,spawnError=false,valid=true,checkError=false}={}){
   const events=[],timers=[];let destroyed=false;
   const c={events,timers,encodeURIComponent,Promise,
    BrowserWindow:class{constructor(o){events.push("gate");assert.equal(o.webPreferences.nodeIntegration,false);assert.equal(o.webPreferences.sandbox,true);}
     async loadURL(url){assert(url.startsWith("data:text/html"));events.push("gate-loaded");}isDestroyed(){return destroyed;}destroy(){destroyed=true;events.push("gate-closed");}},
    updater:{pending,async check(o){assert.equal(o.forcedOnly,true);events.push("checked");if(checkError)throw Error("offline");return pending;},
     promote(){events.push("promoted");return true;},installerReady(){return valid;},claimForcedInstall(){events.push("claimed");return valid;}},
    spawn(file,args,opts){events.push("spawn-request");assert.equal(file,"fixture.exe");assert.deepEqual(Array.from(args),["/S"]);assert.equal(opts.windowsHide,true);
     const child=new EventEmitter();child.unref=()=>events.push("unref");queueMicrotask(()=>child.emit(spawnError?"error":"spawn",new Error("fixture")));return child;},
    startInstallSplash(){events.push("splash");},setTimeout(fn){timers.push(fn);},app:{exit(){events.push("exit");}}};
   vm.createContext(c);vm.runInContext(gate+install,c);return c;
  }
  for(const pending of [null,{version:"1.0.1"}, {version:"1.0.1",forced:false}]){
   const c=context({pending});assert.equal(await c.startupUpdate(),false);assert.deepEqual(c.events,["gate","gate-loaded","checked","gate-closed"]);
  }
  let c=context({pending:{version:"1.0.1",forced:true}});assert.equal(await c.startupUpdate(),false);assert(c.events.includes("promoted"));assert(!c.events.includes("exit"));
  for(const opts of [{spawnError:true},{valid:false},{checkError:true}]){
   c=context({pending:{forced:true,full:true,downloaded:true,setupPath:"fixture.exe"},...opts});assert.equal(await c.startupUpdate(),false);assert.equal(c.timers.length,0);assert(!c.events.includes("exit"));assert(c.events.includes("gate-closed"));
  }
  c=context({pending:{forced:true,full:true,downloaded:true,setupPath:"fixture.exe"}});
  assert.equal(await c.startupUpdate(),true);assert(c.events.indexOf("unref")<c.events.indexOf("splash"));assert.equal(c.timers.length,1);assert(!c.events.includes("exit"));c.timers[0]();assert(c.events.includes("exit"));
  assert.equal(await c.launchPendingInstaller(),false,"duplicate installer launch blocked");
  // Actual startup callback: gate must settle before any hub/renderer/helper writer starts.
  const begin=src.indexOf("app.whenReady().then(async"),end=src.indexOf("/* ---- the room database",begin),boot=src.slice(begin,end);
  for(const stop of [false,true]){
   let ready;const events=[];const ctx={app:{whenReady:()=>({then:fn=>{ready=fn;}}),getPath:()=>"/synthetic"},Updater:class{effective(){return {file:"verified.html"};}check(){return Promise.resolve(null);}},
    FileHub:class{constructor(){events.push("hub");}startWatch(){}readConfig(){return {};}},path,process:{env:{},platform:"linux"},__dirname:"/synthetic",PKG_VERSION:"1.0.0",REPO_RAW:"https://fixture",win:null,
    startupUpdate:async()=>{events.push("gate");await Promise.resolve();events.push("settled");return stop;},createWindow:file=>{events.push("audit");assert.equal(file,"verified.html");},
    buildTray(){},applyHotkeys(){},tauKillStrays(){events.push("helper");},setInterval(fn,ms){assert.equal(ms,1800000,"background checks every 30 minutes");},showMain(){}};
   vm.createContext(ctx);vm.runInContext(boot,ctx);await ready();
   assert.deepEqual(events,stop?["gate","settled"]:["gate","settled","hub","audit","helper"]);
  }
  console.log("PASS startup lifecycle: no prompt, no audit writers before gate, no relaunch for HTML, spawn errors/corruption preserve running process, successful silent installer exits only after spawn, duplicate launch blocked");
 }finally{global.fetch=nativeFetch;fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
