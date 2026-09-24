/* Cloud-only live manifest verification using the installed 1.17.94 forced updater.
   Downloads and validates the setup; never spawns it or changes any hotel profile. */
"use strict";
const assert=require("assert"),fs=require("fs"),path=require("path"),os=require("os");
(async()=>{
 assert.equal(process.env.CI,"true");const version=process.env.RELEASE_VERSION;assert(version);
 const root="https://raw.githubusercontent.com/ZordarGR/Check-Suite/",dir=fs.mkdtempSync(path.join(os.tmpdir(),"forced-delivery-"));
 try{
  const r=await fetch(root+"54006b43269616af520d23557954360c17442810/app/updater.js",{signal:AbortSignal.timeout(60000)});assert(r.ok);
  const file=path.join(dir,"updater.cjs");fs.writeFileSync(file,await r.text());const {Updater}=require(file);
  const u=new Updater({userDataDir:path.join(dir,"profile"),packagedDir:dir,pkgVersion:"1.17.94",updateUrl:root+"main/update/latest.json"});
  const p=await u.check({forcedOnly:true});assert(p&&p.forced===true&&p.full&&p.downloaded);assert.equal(p.version,version);
  assert(u.installerReady());assert(u.claimForcedInstall());
  console.log("FORCED_DELIVERY_VERIFIED "+JSON.stringify({version,installedEngine:"1.17.94",forced:p.forced,sha256:p.sha256,bytes:fs.statSync(p.setupPath).size,installed:false}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
