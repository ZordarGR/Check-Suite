/* Cloud only. Synthetic configuration, filesystem, Electron IPC and helper processes.
 * Extracts shipped desktop code; never opens an app, writes hotel files, or runs helpers. */
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert'),{EventEmitter}=require('events');
const source=fs.readFileSync('app/main.js','utf8');
function extract(start, ending){
  assert(start>=0,'Missing shipped source');
  for(let end=source.indexOf(ending,start);end>=0;end=source.indexOf(ending,end+1)){
    const text=source.slice(start,end+ending.length);
    try{new vm.Script(text);return text;}catch(_){}
  }
  throw new Error('Cannot extract source at '+start);
}
function lift(name){const match=new RegExp('\\n(?:async )?function '+name+'\\(').exec(source);return extract(match?match.index+1:-1,'}');}
function handler(name){return extract(source.indexOf('ipcMain.handle("'+name+'",'),');');}
const clone=x=>JSON.parse(JSON.stringify(x));
const baseline=()=>({profiles:[{id:'a',name:'ALPHA',binds:{tau:'m3'}},{id:'b',name:'BETA',binds:{altn:'m4'}}],activeProfile:'a',
  reportsDirs:{dept:'/reports'},focus:{on:true,needle:'PROT32'},overlayHotkey:'Control+T',interactHotkey:'Alt+Shift+Z'});
function rig(initial=baseline()){
  let raw=typeof initial==='string'?initial:JSON.stringify(initial),last={};
  const files={'/synthetic/binds.txt':'PREVIOUS BINDINGS'},faults={},effects={writes:0,restarts:0,helper:[],children:[],hotkeys:[]};
  const hub={configUnreadable:false,readConfig(){
    try{const next=JSON.parse(raw);if(!next||typeof next!=='object'||Array.isArray(next))throw Error('invalid');last=next;this.configUnreadable=false;}
    catch(_){this.configUnreadable=true;}return clone(last);
  },writeConfig(c){effects.writes++;if(faults.config||this.configUnreadable)return false;raw=JSON.stringify(c);last=clone(c);return true;}};
  const fakefs={mkdirSync(){},writeFileSync(p,data){files[p]=faults.write?'partial':String(data);if(faults.write)throw Error('disk full');},
    renameSync(a,b){if(faults.rename)throw Error('locked');files[b]=files[a];delete files[a];},unlinkSync(p){delete files[p];}};
  const handlers={};
  const c=vm.createContext({hub,console,Buffer,process:{platform:'win32',pid:123},ACTIONS:['tau','altf4','altn','seq'],
    TRIGGER_RE:/^(?:m(?:[345]|\d{1,2}-[345])|k\d{1,2}-\d{1,3})$/,SEQ_DEFAULT:{keys:[13,13,13,39,13,13],gap:25},
    LAST_SPECS:['m3=tau'],TAU_DETECT:null,overlayWin:null,BOOT_QUEUE:Promise.resolve(),BOOT_CHOICE:0,path:{dirname:()=>'/synthetic'},require:name=>{assert.equal(name,'fs');return fakefs;},
    bindsPath:()=>'/synthetic/binds.txt',tauPath:()=>'/synthetic/helper.exe',tauStop:async()=>({}),tauStart:()=>{effects.restarts++;},
    helperVerb:async verb=>{effects.helper.push(verb);return faults.install?{available:true,on:false,err:'failed'}:{available:true,on:verb!=='uninstall'};},
    setTimeout:()=>0,announceOverlayState(){},createOverlay(){c.overlayWin={};},destroyOverlay(){c.overlayWin=null;},
    toggleOverlayGlobal(){},interactOverlayGlobal(){},
    globalShortcut:{unregisterAll(){effects.hotkeys=[];},register(key){if(key==='UNAVAILABLE')return false;effects.hotkeys.push(key);return true;}},
    ipcMain:{handle:(name,fn)=>{handlers[name]=fn;}},
    spawn(){const child=new EventEmitter();child.stdout=new EventEmitter();child.kill=()=>{queueMicrotask(()=>child.emit('exit',0));};effects.children.push(child);return child;}});
  const names=['validTrigger','newProfileId','readDesktopConfig','writeDesktopConfig','validateProfiles','readProfiles','writeProfiles','activeBinds',
    'focusConfig','focusSpec','seqConfig','seqSpec','writeBinds','bootHelperVerb','setHelperBoot','migrateHelperBoot','currentHotkey','currentIHotkey','tryRegister','applyHotkeys','setDesktopHotkey','setOverlay'];
  const channels=['sc-profile-add','sc-profile-rename','sc-profile-delete','sc-profile-select','sc-clear','sc-focus-set','sc-detect'];
  vm.runInContext(names.map(lift).concat(channels.map(handler)).join('\n'),c);
  return {c,files,faults,effects,raw:()=>raw,config:()=>JSON.parse(raw),call:(name,...args)=>handlers[name](null,...args)};
}
const results=[];
async function check(id,label,test){try{await test();results.push({id,label,passed:true});console.log('PASS '+id+' '+label);}
  catch(e){results.push({id,label,passed:false,error:e.message});console.log('FAIL '+id+' '+label+'\n  '+e.message);}}
(async()=>{
  await check('D01','Malformed profile records are preserved instead of replaced or filtered',()=>{
    for(const profiles of [{},[],[null],[{id:'a',binds:[]}],[{id:'a'},{id:'a'}]]){
      const r=rig({...baseline(),profiles}),before=r.raw();assert.throws(()=>r.c.readProfiles());assert.equal(r.raw(),before);assert.equal(r.effects.writes,0);
    }
  });
  await check('D02','Reading legacy invalid triggers does not delete the original values',()=>{
    const initial=baseline();initial.profiles[0].binds={tau:'m0',altn:'m4',future:'unknown'};
    const r=rig(initial),before=r.raw();r.c.readProfiles();assert.equal(r.raw(),before);assert.equal(r.effects.writes,0);
    assert.equal(r.c.activeBinds().tau,undefined);assert.equal(r.c.activeBinds().altn,'m4');
  });
  await check('D03','A valid legacy profile migration preserves unrelated configuration',()=>{
    const r=rig({tauButton:5,reportsDir:'/reports'}),out=r.c.readProfiles();
    assert.equal(out.list[0].binds.tau,'m5');assert.equal(r.config().reportsDir,'/reports');assert.equal(r.config().activeProfile,out.active);
  });
  await check('D04','Every profile mutation refuses to claim a failed write',()=>{
    for(const [name,args] of [['sc-profile-add',['NEW']],['sc-profile-rename',['a','RENAMED']],['sc-profile-delete',['a']],['sc-profile-select',['b']],['sc-clear',['tau']]]){
      const r=rig(),before=r.raw();r.faults.config=true;const out=r.call(name,...args);
      assert.ok(out===false||out===null,name);assert.equal(r.raw(),before,name);assert.equal(r.effects.restarts,0,name);
    }
  });
  await check('D05','Detected binding is reported only when its save succeeds',async()=>{
    for(const fail of [false,true]){
      const r=rig(),before=r.raw();r.faults.config=fail;const pending=r.call('sc-detect','tau');await Promise.resolve();
      assert.equal(r.effects.children.length,1);r.effects.children[0].stdout.emit('data',Buffer.from('KEY:2-70\n'));
      assert.equal(await pending,fail?null:'k2-70');if(fail)assert.equal(r.raw(),before);else assert.equal(r.config().profiles[0].binds.tau,'k2-70');
    }
  });
  await check('D06','A failed focus-gate save leaves the helper and configuration unchanged',()=>{
    const r=rig(),before=r.raw();r.faults.config=true;assert.equal(r.call('sc-focus-set',false,''),null);
    assert.equal(r.raw(),before);assert.equal(r.effects.restarts,0);
  });
  await check('D07','A failed hotkey save restores runtime shortcuts and returns failure',()=>{
    for(const field of ['overlayHotkey','interactHotkey']){
      const r=rig(),before=r.raw();r.faults.config=true;assert.equal(r.c.setDesktopHotkey(field,'Control+R'),false);
      assert.equal(r.raw(),before);assert.deepEqual(r.effects.hotkeys,['Control+T','Alt+Shift+Z']);
    }
  });
  await check('D08','An unavailable hotkey never replaces the saved working shortcut',()=>{
    const r=rig(),before=r.raw();assert.equal(r.c.setDesktopHotkey('overlayHotkey','UNAVAILABLE'),false);
    assert.equal(r.raw(),before);assert.equal(r.effects.writes,0);assert.deepEqual(r.effects.hotkeys,['Control+T','Alt+Shift+Z']);
  });
  await check('D09','Disabling an interaction shortcut commits and removes it from runtime',()=>{
    const r=rig();assert.equal(r.c.setDesktopHotkey('interactHotkey',''),true);assert.equal(r.config().interactHotkey,'');assert.deepEqual(r.effects.hotkeys,['Control+T']);
  });
  await check('D10','Unreadable configuration cannot overwrite published bindings with defaults',()=>{
    const r=rig('{broken');assert.equal(r.c.writeBinds(),false);assert.equal(r.files['/synthetic/binds.txt'],'PREVIOUS BINDINGS');assert.equal(r.raw(),'{broken');
  });
  await check('D11','Partial binding-file writes preserve the last complete published file',()=>{
    const r=rig();r.faults.write=true;assert.equal(r.c.writeBinds(),false);assert.equal(r.files['/synthetic/binds.txt'],'PREVIOUS BINDINGS');
  });
  await check('D12','Binding-file rename failure preserves the last complete published file',()=>{
    const r=rig();r.faults.rename=true;assert.equal(r.c.writeBinds(),false);assert.equal(r.files['/synthetic/binds.txt'],'PREVIOUS BINDINGS');
  });
  await check('D13','Successful binding publication preserves the focus and watcher targets',()=>{
    const r=rig();assert.equal(r.c.writeBinds(),true);assert.match(r.files['/synthetic/binds.txt'],/focus=PROT32\r\nwatch=PROT32\r\nm3=tau/);
  });
  await check('D14','Unreadable startup configuration cannot trigger helper installation',async()=>{
    const r=rig('{broken');await assert.rejects(r.c.migrateHelperBoot());assert.equal(r.effects.helper.length,0);assert.equal(r.raw(),'{broken');
  });
  await check('D15','Failed helper installation remains retryable without a completed migration flag',async()=>{
    const r=rig();r.faults.install=true;assert.equal(await r.c.migrateHelperBoot(),false);assert.equal(r.config().bootMigrated,undefined);
    r.faults.install=false;assert.equal(await r.c.migrateHelperBoot(),true);assert.equal(r.config().bootMigrated,true);
  });
  await check('D16','An explicitly disabled legacy Caps Lock indicator is not installed at migration',async()=>{
    const r=rig({...baseline(),capsFlash:false});assert.equal(await r.c.migrateHelperBoot(),true);assert.equal(r.effects.helper.length,0);assert.equal(r.config().bootMigrated,true);
  });
  await check('D17','Malformed profile structure cannot overwrite a working bindings file',()=>{
    const r=rig({...baseline(),profiles:[{id:'a',binds:[]} ]});assert.equal(r.c.writeBinds(),false);assert.equal(r.files['/synthetic/binds.txt'],'PREVIOUS BINDINGS');
  });
  await check('D18','Successful profile changes preserve other profiles and unrelated settings',()=>{
    const r=rig();const added=r.call('sc-profile-add','NEW');assert.equal(added.profiles.length,3);
    assert.equal(r.call('sc-profile-select','b').active,'b');assert.equal(r.config().reportsDirs.dept,'/reports');
    assert.equal(r.config().profiles.find(p=>p.id==='a').binds.tau,'m3');
  });
  await check('D19','Overlay state does not change when its preference cannot be saved',()=>{
    const r=rig(),before=r.raw();r.faults.config=true;assert.equal(r.c.setOverlay(true),false);assert.equal(r.c.overlayWin,null);assert.equal(r.raw(),before);
  });
  await check('D20','Failed initial migration cannot manufacture a successfully saved default profile',()=>{
    const r=rig({tauButton:3});r.faults.config=true;assert.throws(()=>r.c.readProfiles());assert.deepEqual(r.config(),{tauButton:3});
  });
  await check('D21','A saved active-profile reference without profiles cannot become a default profile',()=>{
    const r=rig({activeProfile:'a'}),before=r.raw();assert.throws(()=>r.c.readProfiles());assert.equal(r.raw(),before);assert.equal(r.effects.writes,0);
  });
  await check('D22','An explicit off choice suppresses the delayed startup installation',async()=>{
    const r=rig();assert.equal((await r.c.setHelperBoot(false)).on,false);assert.equal(await r.c.migrateHelperBoot(),false);
    assert.deepEqual(r.effects.helper,['uninstall']);assert.equal(r.config().bootMigrated,true);
  });
  await check('D23','Manual off runs after an already-started automatic install and remains authoritative',async()=>{
    const r=rig(),calls=[];let release;
    r.c.helperVerb=verb=>{calls.push(verb);return verb==='install'?new Promise(resolve=>{release=resolve;}):Promise.resolve({available:true,on:false});};
    const migration=r.c.migrateHelperBoot();
    for(let i=0;i<5&&!release;i++)await Promise.resolve();
    assert.equal(typeof release,'function');const manual=r.c.setHelperBoot(false);release({available:true,on:true});
    assert.equal(await migration,false);assert.equal((await manual).on,false);
    assert.deepEqual(calls,['install','uninstall']);assert.equal(r.config().bootMigrated,true);
  });
  const failed=results.filter(r=>!r.passed);const summary={suite:'desktop-config',total:results.length,passed:results.length-failed.length,failed:failed.length,results};
  if(process.env.AUDIT_JSON)fs.writeFileSync(process.env.AUDIT_JSON,JSON.stringify(summary,null,2)+'\n');
  console.log('DESKTOP CONFIG '+JSON.stringify({total:summary.total,passed:summary.passed,failed:summary.failed}));process.exitCode=failed.length?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
