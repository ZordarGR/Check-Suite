// Cloud-only verification of the already-released updater's HTML path.
"use strict";
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
(async()=>{
 assert.equal(process.env.CI,'true','Run only in cloud');
 const url=process.env.MANIFEST_URL,version=process.env.RELEASE_VERSION;assert(url&&version);
 const get=async u=>{const r=await fetch(u,{signal:AbortSignal.timeout(60000)});assert(r.ok,'HTTP '+r.status);return Buffer.from(await r.arrayBuffer());};
 const manifest=JSON.parse(await get(url));assert.equal(manifest.version,version);assert.equal(manifest.type,'html');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-sort-update-'));
 try{
  const source=await get('https://raw.githubusercontent.com/ZordarGR/Check-Suite/62c23d4da7b4cc93e4141fb5299ff441a752b188/app/updater.js');
  const sourcePath=path.join(dir,'updater.js');fs.writeFileSync(sourcePath,source);
  const {Updater}=require(sourcePath),u=new Updater({userDataDir:path.join(dir,'profile'),packagedDir:dir,pkgVersion:manifest.engine,updateUrl:url});
  const pending=await u.check();assert(pending&&!pending.full);assert.equal(pending.version,version);assert(u.promote());
  const effective=u.effective();assert.equal(effective.version,version);
  const html=fs.readFileSync(effective.file);assert.equal(crypto.createHash('sha256').update(html).digest('hex'),manifest.sha256);
  assert(html.toString('utf8').includes('APP_VERSION = "'+version+'"'));
  console.log('HTML_DELIVERY_VERIFIED '+JSON.stringify({version,engine:manifest.engine,sha256:manifest.sha256,bytes:html.length,installed:false}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
