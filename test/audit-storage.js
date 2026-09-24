/* Cloud-only fault injection against shipped persistence and updater code.
   No hotel data, Electron process or protel installation is accessed. */
"use strict";
const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const src=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
function between(a,b){const start=src.indexOf(a),end=src.indexOf(b,start+a.length);assert(start>=0&&end>start,'extraction anchors');return src.slice(start,end);}
function storage(initial={}){const data={...initial};return {data,failKey:null,get length(){return Object.keys(data).length;},key:i=>Object.keys(data)[i],getItem:k=>data[k]??null,setItem(k,v){if(this.failKey===k)throw Error('QuotaExceededError');data[k]=String(v);},removeItem:k=>delete data[k]};}
function ctx(initial={}){
 const localStorage=storage(initial),toasts=[];let exported=null,reloads=0;
 const c={localStorage,console,Date,JSON,Object,Array,Set,MODEL:null,ROOMS:{},ROOMS_KEY:'reccheck_rooms',ROOMS_DISK_READY:false,ROOMS_DISK_PENDING:null,STATE:{date:'18/9/2026',receipts:{},extras:[]},stateKey:'reccheck_18/9/2026',NAMES_STALE:false,
  WATCH:[],WATCH_KEY:'reccheck_watchlist',toast:(...x)=>toasts.push(x),t:k=>k,pad2:n=>String(n).padStart(2,'0'),setTimeout(){},loadWatch(){},loadAlerts(){},paintAlertsBtn(){},syncRooms(){},refresh(){},
  Blob:class{constructor(parts){exported=JSON.parse(parts.join(''));}},URL:{createObjectURL:()=>'',revokeObjectURL(){}},document:{documentElement:{inert:false},createElement:()=>({click(){},remove(){}}),body:{append(){}}},
  FileReader:class{readAsText(text){this.result=text;this.onload();}},window:{location:{reload(){reloads++;}},__rcStorageFault:(...x)=>toasts.push(x)},uiFault:(...x)=>toasts.push(x)};
 vm.createContext(c);
 const recovery=src.includes('function importJournalKey(){')?between('function importJournalKey(){','if(!recoverImport())'):'';
 vm.runInContext(recovery+between('function blankState(date){','/* ---------- helpers ---------- */')+between('function exportData(){','/* ---------- refresh ---------- */')+between('function loadRooms(){','/* THE PROTEL NAMES,')+between('function loadWatch(){','function watchFor('),c);
 return {c,localStorage,toasts,get exported(){return exported;},get reloads(){return reloads;}};
}
const cases=[];const test=(name,fn)=>cases.push([name,fn]);
test('normal receipt state survives a reload',()=>{const x=ctx();x.c.STATE.receipts.a={status:'checked'};x.c.saveState();assert.equal(x.c.loadState('18/9/2026').receipts.a.status,'checked');});
test('quota failure on receipt save is observable instead of silent success',()=>{const x=ctx();x.localStorage.failKey=x.c.stateKey;let signalled=false;try{signalled=x.c.saveState()===false;}catch(e){signalled=true;}assert(signalled||x.toasts.length,'saveState swallowed the storage exception; a restart loses the displayed work');});
test('backup export contains Tax Check memory and decisions',()=>{const x=ctx({'reccheck_rooms':'{}','ta_check_memory_v2':'{"101":{"18/9/2026":{"auto":1}}}','ta_check_verify_v1':'{"20260918":{"101":true}}','ta_check_ack_v1':'{"101":1}'});x.c.exportData();for(const k of ['ta_check_memory_v2','ta_check_verify_v1','ta_check_ack_v1'])assert(k in x.exported.data,k+' was omitted');});
test('backup import restores Tax Check keys',()=>{const x=ctx();x.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_rooms:'{}',ta_check_memory_v2:'{"101":{}}'}}));assert.equal(x.localStorage.getItem('ta_check_memory_v2'),'{"101":{}}');});
test('export/import preserves non-JSON string preferences it exports',()=>{const x=ctx({reccheck_lang:'gr'});x.c.exportData();const y=ctx();y.c.importData(JSON.stringify(x.exported));assert.equal(y.localStorage.getItem('reccheck_lang'),'gr');});
test('theme preference survives export/import without changing audit stores',()=>{
 for(const theme of ['dark','light']){
  const original={reccheck_theme:theme,reccheck_rooms:'{"101":{"guest":"SYNTHETIC"}}'};
  const source=ctx(original);source.c.exportData();const dest=ctx();dest.c.importData(JSON.stringify(source.exported));
  for(const [key,value]of Object.entries(original))assert.equal(dest.localStorage.getItem(key),value);
 }
});
test('invalid theme in a backup rejects before changing any store',()=>{
 const original={reccheck_theme:'dark',reccheck_rooms:'{"101":{"guest":"SYNTHETIC"}}'},dest=ctx(original);
 dest.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_theme:'invalid',reccheck_rooms:'{}'}}));
 assert.deepEqual(dest.localStorage.data,original);
});
test('failed multi-key import leaves existing database consistent',()=>{const initial={reccheck_rooms:'{"101":{"guest":"CURRENT"}}',reccheck_watchlist:'[{"room":"101","name":"CURRENT"}]'};const x=ctx(initial);x.localStorage.failKey='reccheck_watchlist';x.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_rooms:'{"101":{"guest":"OLD"}}',reccheck_watchlist:'[]'}}));assert.deepEqual(x.localStorage.data,initial,'rooms were replaced before failure; watchlist retained another generation');});
test('committed import retires every cached writer before reloading',()=>{
 const oldChecklist=JSON.stringify([{id:'old',text:'OLD TASK',done:false}]),freshChecklist=JSON.stringify([{id:'new',text:'NEW TASK',done:true}]);
 const x=ctx({reccheck_checklist:oldChecklist});x.c.CL=JSON.parse(oldChecklist);
 vm.runInContext(between('function saveCL(){','/* How many columns')+between('function taxStoreWrite(key,value,memory){','function loadMem(){'),x.c);
 x.c.ROOMS={'101':{guest:'OLD GUEST'}};x.c.WATCH=[{room:'101',name:'OLD GUEST'}];
 const data={reccheck_checklist:freshChecklist,reccheck_rooms:'{"202":{"guest":"IMPORTED GUEST"}}',reccheck_watchlist:'[]',ta_check_memory_v2:'{"202":{}}','reccheck_18/9/2026':'{"date":"18/9/2026","receipts":{},"extras":[]}'};
 x.c.importData(JSON.stringify({app:'reccheck',data}));
 assert.equal(x.reloads,1);assert.equal(x.c.window.__rcImportBlocked,true);assert.equal(x.c.document.documentElement.inert,true);
 for(const save of [()=>x.c.saveCL(),()=>x.c.saveRooms(),()=>x.c.saveWatch(),()=>x.c.saveState(),()=>x.c.taxStoreWrite('ta_check_memory_v2',{},true)])assert.equal(save(),false);
 for(const [key,value]of Object.entries(data))assert.equal(x.localStorage.getItem(key),value,key+' replaced by a stale cache');
 // A new page initializes its checklist from the imported generation. Its next edit
 // can save NEW TASK; the retiring page could never save OLD TASK over it.
 const next=ctx(x.localStorage.data);next.c.CL=JSON.parse(next.localStorage.getItem('reccheck_checklist'));
 vm.runInContext(between('function saveCL(){','/* How many columns'),next.c);next.c.CL[0].done=false;assert.equal(next.c.saveCL(),true);
 assert.equal(JSON.parse(next.localStorage.getItem('reccheck_checklist'))[0].text,'NEW TASK');
});
test('validation-only import rejection leaves the current usable page running',()=>{
 const initial={reccheck_rooms:'{"101":{"guest":"CURRENT"}}'},x=ctx(initial);
 x.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_rooms:'{broken'}}));
 assert.deepEqual(x.localStorage.data,initial);assert.equal(x.reloads,0);assert(!x.c.window.__rcImportBlocked);assert.equal(x.c.document.documentElement.inert,false);
});
test('successful rollback reloads before cached state can overwrite the restored generation',()=>{
 const initial={reccheck_rooms:'{"101":{"guest":"CURRENT"}}',reccheck_watchlist:'[{"room":"101"}]'},x=ctx(initial);
 x.localStorage.failKey='reccheck_watchlist';x.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_rooms:'{}',reccheck_watchlist:'[]'}}));
 assert.deepEqual(x.localStorage.data,initial);assert.equal(x.reloads,1);assert.equal(x.c.window.__rcImportBlocked,true);
 x.c.ROOMS={'202':{guest:'STALE'}};assert.equal(x.c.saveRooms(),false);assert.deepEqual(x.localStorage.data,initial);
});
test('failed rollback retains its journal and blocks all old-page work until recovery',()=>{
 const initial={reccheck_rooms:'{"101":{"guest":"CURRENT"}}',reccheck_watchlist:'[{"room":"101"}]'},x=ctx(initial),set=x.localStorage.setItem;
 x.localStorage.setItem=function(key,value){if(key==='reccheck_watchlist'||(key==='reccheck_rooms'&&value===initial.reccheck_rooms))throw Error('storage temporarily unavailable');return set.call(this,key,value);};
 x.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_rooms:'{}',reccheck_watchlist:'[]'}}));
 assert.equal(x.reloads,1);assert.equal(x.c.document.documentElement.inert,true);assert.equal(x.c.window.__rcImportBlocked,true);
 assert.deepEqual(JSON.parse(x.localStorage.getItem('reccheck_import_pending_v1')),initial);assert.equal(x.localStorage.getItem('reccheck_rooms'),'{}');
 x.c.ROOMS={'303':{guest:'LATE'}};assert.equal(x.c.saveRooms(),false);
 x.localStorage.setItem=set;const next=ctx(x.localStorage.data);assert.equal(next.c.recoverImport(),true);assert.deepEqual(next.localStorage.data,initial);
});
test('a delayed room mirror cannot write after import starts reloading',async()=>{
 const x=ctx();let resolveRead,writes=0;x.c.ROOMS={'101':{guest:'OLD'}};
 x.c.window.reccheckRooms={read:()=>new Promise(resolve=>{resolveRead=resolve;}),write:()=>{writes++;return true;}};
 const pending=x.c.mergeRoomsFromDisk(),fresh='{"202":{"guest":"IMPORTED"}}';
 x.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_rooms:fresh}}));resolveRead({'303':{guest:'MIRROR'}});await pending;
 assert.equal(x.localStorage.getItem('reccheck_rooms'),fresh);assert.equal(writes,0);assert.equal(x.c.ROOMS['303'],undefined);
});
test('failed navigation leaves an imported page inert with writers blocked',()=>{
 const x=ctx(),fresh='{"202":{"guest":"IMPORTED"}}';x.c.window.location.reload=()=>{throw Error('navigation unavailable');};
 x.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_rooms:fresh}}));
 assert.equal(x.c.document.documentElement.inert,true);assert.equal(x.c.window.__rcImportBlocked,true);assert(x.toasts.some(x=>String(x[0]).includes('reload after import')));
 x.c.ROOMS={'101':{guest:'OLD'}};assert.equal(x.c.saveRooms(),false);assert.equal(x.localStorage.getItem('reccheck_rooms'),fresh);
});
test('recovery followed by invalid input still reloads the recovered stores',()=>{
 const before='{"101":{"guest":"OLD"}}',x=ctx({reccheck_rooms:'{}',reccheck_import_pending_v1:JSON.stringify({reccheck_rooms:before})});
 x.c.importData('{broken');assert.equal(x.localStorage.getItem('reccheck_rooms'),before);assert.equal(x.reloads,1);assert.equal(x.c.window.__rcImportBlocked,true);
});
test('schema-invalid receipt state cannot replace a usable loaded state',()=>{const x=ctx({'reccheck_18/9/2026':'{"date":"18/9/2026","receipts":null,"extras":"broken"}'});const state=x.c.loadState('18/9/2026');assert(state.receipts&&typeof state.receipts==='object'&&Array.isArray(state.extras),'JSON syntax alone does not validate the stored state');});
test('failed room mirror is observable when local storage also fails',()=>{const x=ctx();x.localStorage.failKey='reccheck_rooms';x.c.window.reccheckRooms={write:()=>false};x.c.ROOMS={'101':{guest:'NEW'}};let signalled=false;try{signalled=x.c.saveRooms()===false;}catch(e){signalled=true;}assert(signalled||x.toasts.length,'both persistence paths failed with no error signal');});
test('disk room recovery precedes writes that can destroy the only backup',async()=>{const x=ctx();let disk={'101':{guest:'SAVED',nick:'Keep me'},'102':{guest:'OMITTED'}};x.c.window.reccheckRooms={read:async()=>JSON.parse(JSON.stringify(disk)),write:v=>{disk=JSON.parse(JSON.stringify(v));return true;}};
 // The boot IIFE awaits directory/overlay IPC before starting mergeRoomsFromDisk;
 // the independent tax boot can deliver a capture during that interval.
 x.c.ROOMS={'101':{guest:'SAVED',liveKey:20260918}};x.c.saveRooms();await x.c.mergeRoomsFromDisk();assert.equal(x.c.ROOMS['101'].nick,'Keep me');assert(x.c.ROOMS['102']);});
test('disk merge keeps an existing working room authoritative',async()=>{const x=ctx();x.c.ROOMS={'101':{guest:'NEW'}};x.c.window.reccheckRooms={read:async()=>({'101':{guest:'OLD'},'102':{guest:'OTHER'}})};await x.c.mergeRoomsFromDisk();assert.equal(x.c.ROOMS['101'].guest,'NEW');assert.equal(x.c.ROOMS['102'].guest,'OTHER');});
const {FileHub}=require('../app/files.js');
test('interrupted config save preserves previous folder/profile configuration',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'audit-config-')),f=path.join(dir,'config.json');const before=JSON.stringify({reportsDirs:{dept:'/reports'},profiles:[{id:'saved'}]});fs.writeFileSync(f,before);const real=fs.writeFileSync;try{fs.writeFileSync=function(p,...args){if(String(p)===f||String(p)===f+'.tmp'){real(p,'');throw Error('simulated full disk after truncation');}return real(p,...args);};new FileHub({configPath:f}).writeConfig({reportsDirs:{dept:'/changed'}});}finally{fs.writeFileSync=real;}assert.equal(fs.readFileSync(f,'utf8'),before);});
const {Updater}=require('../app/updater.js');
function updater(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'audit-update-'));return new Updater({userDataDir:dir,packagedDir:dir,pkgVersion:'1.0.0',updateUrl:'https://fixture.invalid/manifest',fallbackReleaseUrl:'https://fixture.invalid/release'});}
test('cached HTML is revalidated before reporting ready',async()=>{const u=updater(),p=u.paths(),valid='<!DOCTYPE html>'+('x'.repeat(11000)),sha=crypto.createHash('sha256').update(valid).digest('hex');fs.writeFileSync(p.pendMeta,JSON.stringify({version:'2.0.0',sha256:sha}));fs.writeFileSync(p.pendHtml,'truncated');const fetch=global.fetch;global.fetch=async()=>({ok:true,json:async()=>({version:'2.0.0',type:'html',html:'https://fixture.invalid/page',sha256:sha}),arrayBuffer:async()=>Buffer.from('truncated')});try{assert.equal(await u.check(),null,'corrupt cached payload was accepted as ready');}finally{global.fetch=fetch;}});
test('interrupted promotion preserves the previously working page',()=>{const u=updater(),p=u.paths(),old='<!DOCTYPE html>'+('old'.repeat(4000)),fresh='<!DOCTYPE html>'+('new'.repeat(4000)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');fs.writeFileSync(p.curHtml,old);fs.writeFileSync(p.curMeta,JSON.stringify({version:'1.5.0',sha256:sha(old)}));fs.writeFileSync(p.pendHtml,fresh);fs.writeFileSync(p.pendMeta,JSON.stringify({version:'2.0.0',sha256:sha(fresh)}));u.pending={version:'2.0.0'};const real=fs.copyFileSync;let injected=false;try{fs.copyFileSync=(from,to)=>{injected=true;fs.writeFileSync(to,'PARTIAL');throw Error('simulated interrupted copy');};try{u.promote();}catch(e){}}finally{fs.copyFileSync=real;}assert(injected,'fault injection reached the copy');assert.equal(fs.readFileSync(p.curHtml,'utf8'),old);});
test('crash recovery restores every pre-import generation before continuing',()=>{const journal={reccheck_rooms:'{"101":{"guest":"OLD"}}',ta_check_memory_v2:null};const x=ctx({reccheck_import_pending_v1:JSON.stringify(journal),reccheck_rooms:'{"102":{"guest":"IMPORTED"}}',ta_check_memory_v2:'{"102":{}}'});assert.equal(x.c.recoverImport(),true);assert.equal(x.localStorage.getItem('reccheck_rooms'),journal.reccheck_rooms);assert.equal(x.localStorage.getItem('ta_check_memory_v2'),null);assert.equal(x.localStorage.getItem('reccheck_import_pending_v1'),null);});
test('failed crash recovery retains journal and succeeds after storage recovers',()=>{const journal={reccheck_rooms:'{"101":{"guest":"OLD"}}'};const x=ctx({reccheck_import_pending_v1:JSON.stringify(journal),reccheck_rooms:'{}'});x.localStorage.failKey='reccheck_rooms';assert.equal(x.c.recoverImport(),false);assert(x.localStorage.getItem('reccheck_import_pending_v1'));x.localStorage.failKey=null;assert.equal(x.c.recoverImport(),true);assert.equal(x.localStorage.getItem('reccheck_rooms'),journal.reccheck_rooms);});
test('malformed room bytes survive load followed by save',()=>{for(const raw of ['{broken','null','[]']){const x=ctx({reccheck_rooms:raw});x.c.loadRooms();x.c.ROOMS['102']={guest:'NEW'};assert.equal(x.c.saveRooms(),false);assert.equal(x.localStorage.getItem('reccheck_rooms'),raw);assert(x.toasts.length);}});
test('malformed watchlist bytes survive load followed by save',()=>{for(const raw of ['{broken','null','{}']){const x=ctx({reccheck_watchlist:raw});x.c.loadWatch();x.c.WATCH.push({room:'102',name:'NEW'});assert.equal(x.c.saveWatch(),false);assert.equal(x.localStorage.getItem('reccheck_watchlist'),raw);assert(x.toasts.length);}});
test('corrupt config cannot be replaced by a new folder selection',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'audit-config-bad-')),f=path.join(dir,'config.json'),raw='{broken';fs.writeFileSync(f,raw);const hub=new FileHub({configPath:f});assert.throws(()=>hub.setDir('dept',dir));assert.equal(fs.readFileSync(f,'utf8'),raw);});
test('transient config read failure keeps last known folders',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'audit-config-read-')),f=path.join(dir,'config.json');fs.writeFileSync(f,JSON.stringify({reportsDirs:{dept:dir}}));const hub=new FileHub({configPath:f});assert.equal(hub.getDir('dept'),dir);const real=fs.readFileSync;try{fs.readFileSync=(p,...args)=>{if(p===f){const e=Error('busy');e.code='EACCES';throw e;}return real(p,...args);};assert.equal(hub.getDir('dept'),dir);assert.equal(hub.writeConfig({}),false);}finally{fs.readFileSync=real;}assert.equal(hub.readConfig().reportsDirs.dept,dir);});
test('valid cached HTML remains available after integrity verification',async()=>{const u=updater(),p=u.paths(),valid='<!DOCTYPE html>'+('x'.repeat(11000)),sha=crypto.createHash('sha256').update(valid).digest('hex');fs.writeFileSync(p.pendMeta,JSON.stringify({version:'2.0.0',sha256:sha}));fs.writeFileSync(p.pendHtml,valid);const fetch=global.fetch;global.fetch=async()=>({ok:true,json:async()=>({version:'2.0.0',type:'html',html:'https://fixture.invalid/page',sha256:sha})});try{assert.equal((await u.check()).version,'2.0.0');}finally{global.fetch=fetch;}});
test('crash between update file renames recovers the previous verified page',()=>{const u=updater(),p=u.paths(),old='<!DOCTYPE html>'+('old'.repeat(4000)),fresh='<!DOCTYPE html>'+('new'.repeat(4000)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');fs.writeFileSync(p.curHtml,old);fs.writeFileSync(p.curMeta,JSON.stringify({version:'1.5.0',sha256:sha(old)}));fs.writeFileSync(p.pendHtml,fresh);fs.writeFileSync(p.pendMeta,JSON.stringify({version:'2.0.0',sha256:sha(fresh)}));u.pending={version:'2.0.0'};const rename=fs.renameSync;try{fs.renameSync=(from,to)=>{if(to===p.curMeta)throw Error('interrupted second rename');return rename(from,to);};assert.equal(u.promote(),false);}finally{fs.renameSync=rename;}assert.equal(u.effective().version,'1.5.0');assert.equal(fs.readFileSync(p.curHtml,'utf8'),old);assert.equal(u.promote(),true);assert.equal(u.effective().version,'2.0.0');});
test('mirror recovery cannot overwrite corrupt primary room bytes',async()=>{const x=ctx({reccheck_rooms:'{broken'});x.c.loadRooms();x.c.window.reccheckRooms={read:async()=>({'101':{guest:'SAVED'}})};await x.c.mergeRoomsFromDisk();assert.equal(x.localStorage.getItem('reccheck_rooms'),'{broken');assert.equal(x.c.ROOMS['101'].guest,'SAVED');assert(x.toasts.length);});
test('a partly damaged backup cannot import only its surviving keys',()=>{const initial={reccheck_rooms:'{"101":{"guest":"CURRENT"}}',ta_check_memory_v2:'{}'};const x=ctx(initial);x.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_rooms:'{"102":{"guest":"OLD"}}',ta_check_memory_v2:'{broken'}}));assert.deepEqual(x.localStorage.data,initial);assert(x.toasts.length);});
test('a second import cannot replace an unfinished recovery journal',()=>{const old={reccheck_rooms:'{"101":{"guest":"OLD"}}'},initial={reccheck_rooms:'{}',reccheck_import_pending_v1:JSON.stringify(old)};const x=ctx(initial);x.localStorage.failKey='reccheck_rooms';x.c.importData(JSON.stringify({app:'reccheck',data:{ta_check_memory_v2:'{}'}}));assert.equal(x.localStorage.getItem('reccheck_import_pending_v1'),initial.reccheck_import_pending_v1);assert.equal(x.localStorage.getItem('ta_check_memory_v2'),null);});
test('failed checklist night reset preserves ticks and remains retryable',()=>{const x=ctx({reccheck_cl_night:'20260917'});Object.assign(x.c,{CL:[{done:true},{done:false}],shiftKey:()=>20260918,saveCL:()=>false,renderChecklist(){},OVQUIET:false});vm.runInContext(between('function clNightCheck(){','/* ----------') ,x.c);x.c.clNightCheck();assert.equal(x.c.CL[0].done,true);assert.equal(x.localStorage.getItem('reccheck_cl_night'),'20260917');x.c.saveCL=()=>true;x.c.clNightCheck();assert.equal(x.c.CL[0].done,false);assert.equal(x.localStorage.getItem('reccheck_cl_night'),'20260918');});
test('recognized non-string backup entries reject the entire import',()=>{
 for(const broken of [null,{},[],42,true]){
  const initial={reccheck_rooms:'{"101":{"guest":"CURRENT"}}',ta_check_memory_v2:'{}'},x=ctx(initial);
  x.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_rooms:'{"102":{"guest":"OLDER"}}',ta_check_memory_v2:broken}}));
  assert.deepEqual(x.localStorage.data,initial);assert(x.toasts.length);
 }
});
test('deeply malformed known stores cannot replace any valid backup generation',()=>{
 const invalid={
  reccheck_rooms:{'101':null},reccheck_watchlist:[null],reccheck_checklist:{},
  ta_check_memory_v2:{'101':null},ta_check_verify_v1:{'20260918':[]},ta_check_ack_v1:{'101':{balance:'2',source:'x'}},
  reccheck_status_v1:{IH:{rows:[null]}},reccheck_moves_v2:{'101':{'20260910':null}},
  reccheck_moves_v1:{'20260918':{'101':[null]}},reccheck_receipts_v1:{'20260918':[['101',null]]},
  reccheck_alerts:[{key:null}],reccheck_alerts_done:{bad:[]},reccheck_moves_applied:{bad:null},
  'reccheck_18/9/2026':{date:'19/9/2026',receipts:{},extras:[]}
 };
 for(const [key,bad] of Object.entries(invalid)){
  const initial={reccheck_rooms:'{"101":{"guest":"CURRENT"}}',reccheck_lang:'en'},x=ctx(initial);
  x.c.importData(JSON.stringify({app:'reccheck',data:{reccheck_lang:'gr',[key]:JSON.stringify(bad)}}));
  assert.deepEqual(x.localStorage.data,initial,key);assert(x.toasts.length,key);
 }
});
test('legacy and current saved-store schemas survive full export and import',()=>{
 const values={
  reccheck_rooms:{'101':{guest:'ALPHA',seen:null,nick:'FAMILY',liveKey:20260918}},
  reccheck_watchlist:[{room:'101',sn:'7',name:'ALPHA'}],reccheck_checklist:[{id:'a',text:'Audit',done:true,tier:'high',ord:1}],
  ta_check_memory_v2:{'101':{'18/09/26':{arr:1,auto:1,man:0,manual:null,uncertain:true,versions:[{arr:1,auto:0,man:0}]}}},
  ta_check_verify_v1:{'20260918':{'101':true,'102':'one'}},ta_check_ack_v1:{'101':1,'102':{balance:2,source:'saved facts'}},
  reccheck_status_v1:{IH:{rows:[{name:'ALPHA',room:'101',arr:'10/09/26',dep:'20/09/26',status:'CI',readAt:1000.125,cells:['ALPHA']}],incompleteRows:[]},DP:{'20260918':{rows:{'ALPHA|101':{name:'ALPHA',room:'101',arr:'10/09/26',status:'CO',last:1000.125}}}}},
  reccheck_moves_v2:{'101':{'20260910':{n:'ALPHA',d:20260920,seen:20260918,conflicts:[{n:'BETA',d:20260921}]}}},
  reccheck_moves_v1:{'20260918':{'101':[{a:20260910,d:20260920,n:'ALPHA'}]}},
  reccheck_receipts_v1:{'20260918':[['101','ALPHA'],['102','BETA',{id:'7|102',live:true,uncertain:false,versions:[['103','BETA',true]]}]]},
  reccheck_alerts:[{key:'move',kind:'move',text:'Review',night:20260918,at:'01:00',read:false}],reccheck_alerts_done:{old:20260917},
  reccheck_moves_applied:{move:20260918},'reccheck_18/9/2026':{date:'18/09/2026',receipts:{'BAR|7|101':{status:'ok',corr:null}},extras:[]}
 };
 const data=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,JSON.stringify(v)]));data.reccheck_lang='gr';
 const source=ctx(data);source.c.exportData();const dest=ctx();dest.c.importData(JSON.stringify(source.exported));
 for(const [key,value] of Object.entries(data))assert.equal(dest.localStorage.getItem(key),value,key);
});
(async()=>{let failed=0;for(const [name,fn] of cases){try{await fn();console.log('PASS '+name);}catch(e){failed++;console.log('FAIL '+name+'\n  '+e.message);}}console.log(JSON.stringify({suite:'storage',total:cases.length,passed:cases.length-failed,failed}));process.exitCode=failed?1:0;})();
