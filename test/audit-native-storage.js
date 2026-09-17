/* Cloud only: exercise the shipped snapshot writer with injected filesystem failures. */
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert');
const src=fs.readFileSync('app/tbind.cs','utf8'),a=src.indexOf('  static bool WriteList(string tag, string body){'),b=src.indexOf('  /* Runs on the pump thread',a);
assert(a>=0&&b>a);
const method=src.slice(a,b).replaceAll('System.IO.File.','FaultFile.');
const rig=`using System;
class Probe {
static string folder; static string ListPath(string tag){return System.IO.Path.Combine(folder,tag+".tsv");}
static class FaultFile {
public static bool failWrite,failReplace,failMove;
public static bool Exists(string p){return System.IO.File.Exists(p);}
public static void WriteAllText(string p,string body,System.Text.Encoding e){if(failWrite){System.IO.File.WriteAllText(p,"partial");throw new Exception("full disk");}System.IO.File.WriteAllText(p,body,e);}
public static void Replace(string from,string to,string backup){if(failReplace)throw new Exception("locked destination");System.IO.File.Replace(from,to,backup);}
public static void Move(string from,string to){if(failMove)throw new Exception("rename failure");System.IO.File.Move(from,to);}
}
${method}
static int bad;
static void Check(string name,bool ok){if(!ok)bad++;Console.WriteLine((ok?"PASS ":"FAIL ")+name);}
static int Main(){
folder=System.IO.Path.Combine(System.IO.Path.GetTempPath(),"snapshot-audit-"+Guid.NewGuid().ToString());System.IO.Directory.CreateDirectory(folder);
Check("first snapshot persists",WriteList("IH","OLD")&&System.IO.File.ReadAllText(ListPath("IH"))=="OLD");
FaultFile.failWrite=true;Check("partial temp write preserves previous capture",!WriteList("IH","NEW")&&System.IO.File.ReadAllText(ListPath("IH"))=="OLD");FaultFile.failWrite=false;
FaultFile.failReplace=true;Check("failed replacement preserves previous capture",!WriteList("IH","NEW")&&System.IO.File.ReadAllText(ListPath("IH"))=="OLD");FaultFile.failReplace=false;
Check("same capture retries after recovery",WriteList("IH","NEW")&&System.IO.File.ReadAllText(ListPath("IH"))=="NEW");
FaultFile.failMove=true;Check("first-write rename failure is observable",!WriteList("DP","NEW")&&!System.IO.File.Exists(ListPath("DP")));FaultFile.failMove=false;
Check("first-write retry succeeds",WriteList("DP","NEW")&&System.IO.File.ReadAllText(ListPath("DP"))=="NEW");
return bad==0?0:1;
}}
`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-storage-')),file=path.join(dir,'rig.cs'),exe=path.join(dir,'rig.exe');fs.writeFileSync(file,rig);cp.execFileSync('mcs',['-out:'+exe,file],{stdio:'inherit'});const r=cp.spawnSync('mono',[exe],{stdio:'inherit'});process.exitCode=r.status===0?0:1;
