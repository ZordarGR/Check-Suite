/* Cloud only: exercise the shipped snapshot writer with injected filesystem failures. */
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert');
const src=fs.readFileSync('app/tbind.cs','utf8'),a=src.indexOf('  static bool WriteList(string tag, string body){'),b=src.indexOf('  /* Runs on the pump thread',a);
assert(a>=0&&b>a);
const method=src.slice(a,b).replaceAll('System.IO.File.','FaultFile.').replaceAll('DateTime.UtcNow.Ticks','NowTicks');
const rig=`using System;
class Probe {
static string folder; static string ListPath(string tag){return System.IO.Path.Combine(folder,tag+".tsv");}
static long NowTicks=638937600000000000L;
static class FaultFile {
public static bool failWrite,failReplace,failMove,failMirrorMove,failMirrorWrite;
public static bool Exists(string p){return System.IO.File.Exists(p);}
public static void WriteAllText(string p,string body,System.Text.Encoding e){if(failWrite||(failMirrorWrite&&System.IO.Path.GetDirectoryName(p)==folder)){System.IO.File.WriteAllText(p,"partial");throw new Exception("full disk");}System.IO.File.WriteAllText(p,body,e);}
public static void Replace(string from,string to,string backup){if(failReplace)throw new Exception("locked destination");System.IO.File.Replace(from,to,backup);}
public static void Move(string from,string to){if(failMove||(failMirrorMove&&System.IO.Path.GetDirectoryName(to)==folder))throw new Exception("rename failure");System.IO.File.Move(from,to);}
}
${method}
static int bad;
static void Check(string name,bool ok){if(!ok)bad++;Console.WriteLine((ok?"PASS ":"FAIL ")+name);}
static string[] Queued(){string[] files=System.IO.Directory.GetFiles(System.IO.Path.Combine(folder,"captures"),"*.tsv");Array.Sort(files,StringComparer.Ordinal);return files;}
static string LastQueue(){string[] files=Queued();return files[files.Length-1];}
static long Sequence(string file){return long.Parse(System.IO.Path.GetFileName(file).Substring(0,19));}
static long Stamp(string file){return long.Parse(System.IO.Path.GetFileName(file).Substring(20,13));}
static int Main(){
folder=System.IO.Path.Combine(System.IO.Path.GetTempPath(),"snapshot-audit-"+Guid.NewGuid().ToString());System.IO.Directory.CreateDirectory(folder);
Check("first snapshot persists",WriteList("IH","OLD")&&System.IO.File.ReadAllText(ListPath("IH"))=="OLD");
string first=LastQueue();
Check("first capture is queued unchanged",Queued().Length==1&&System.IO.File.ReadAllText(first)=="OLD");
Check("queue name carries ordered sequence actual UTC milliseconds tag and GUID",System.Text.RegularExpressions.Regex.IsMatch(System.IO.Path.GetFileName(first),@"^[0-9]{19}-[0-9]{13}-(IH|AR|DP|MV)-[a-f0-9]{32}[.]tsv$")&&Sequence(first)==NowTicks&&Stamp(first)==(NowTicks-621355968000000000L)/10000);
int before=Queued().Length;
FaultFile.failWrite=true;Check("partial temp write preserves previous capture",!WriteList("IH","NEW")&&System.IO.File.ReadAllText(ListPath("IH"))=="OLD"&&Queued().Length==before&&System.IO.File.ReadAllText(first)=="OLD");FaultFile.failWrite=false;
FaultFile.failReplace=true;Check("failed replacement preserves previous capture",!WriteList("IH","NEW")&&System.IO.File.ReadAllText(ListPath("IH"))=="OLD");FaultFile.failReplace=false;
Check("queue survives compatibility replacement failure",Queued().Length==before+1&&System.IO.File.ReadAllText(LastQueue())=="NEW");
Check("same capture retries after recovery",WriteList("IH","NEW")&&System.IO.File.ReadAllText(ListPath("IH"))=="NEW");
Check("multiple captures retain the original immutable body",Queued().Length==before+2&&System.IO.File.ReadAllText(first)=="OLD");
before=Queued().Length;
FaultFile.failMove=true;Check("queue rename failure publishes no capture or mirror",!WriteList("DP","NEW")&&!System.IO.File.Exists(ListPath("DP"))&&Queued().Length==before);FaultFile.failMove=false;
Check("first-write retry succeeds",WriteList("DP","NEW")&&System.IO.File.ReadAllText(ListPath("DP"))=="NEW");
before=Queued().Length;
FaultFile.failMirrorMove=true;Check("first mirror rename failure preserves durable queue",!WriteList("AR","ARRIVAL")&&!System.IO.File.Exists(ListPath("AR"))&&Queued().Length==before+1&&System.IO.File.ReadAllText(LastQueue())=="ARRIVAL");FaultFile.failMirrorMove=false;
before=Queued().Length;
FaultFile.failMirrorWrite=true;Check("partial mirror write preserves queue and previous mirror",!WriteList("IH","MIRRORFAIL")&&System.IO.File.ReadAllText(ListPath("IH"))=="NEW"&&Queued().Length==before+1&&System.IO.File.ReadAllText(LastQueue())=="MIRRORFAIL");FaultFile.failMirrorWrite=false;
string previous=LastQueue();
Check("same clock tick produces a distinct increasing queue position",WriteList("MV","MOVE")&&LastQueue()!=previous&&Sequence(LastQueue())>Sequence(previous)&&Stamp(LastQueue())==Stamp(previous));
long previousSequence=Sequence(LastQueue());NowTicks-=100000000;
Check("clock rollback preserves queue order and actual capture time",WriteList("IH","ROLLBACK")&&Sequence(LastQueue())>previousSequence&&Stamp(LastQueue())==(NowTicks-621355968000000000L)/10000);
previousSequence=Sequence(LastQueue());captureSequence=-1;
Check("restart recovers committed maximum even with clock behind",WriteList("IH","RESTART")&&Sequence(LastQueue())>previousSequence);
System.IO.File.WriteAllText(System.IO.Path.Combine(folder,"captures","9223372036854775807-0000000000000-IH-00000000000000000000000000000000.tsv.tmp"),"unfinished");
previousSequence=Sequence(LastQueue());captureSequence=-1;
Check("unfinished temporary capture never advances restart cursor",WriteList("IH","AFTERTEMP")&&Sequence(LastQueue())==previousSequence+1);
string raw="IH\\t54\\tΔΟΚΙΜΗ\\r\\nEND\\t1\\r\\n";
Check("queue preserves Unicode tabs and original line endings",WriteList("IH",raw)&&System.IO.File.ReadAllText(LastQueue())==raw&&System.IO.File.ReadAllText(ListPath("IH"))==raw);
bool ordered=true;string[] all=Queued();for(int i=1;i<all.Length;i++)if(Sequence(all[i])<=Sequence(all[i-1]))ordered=false;
Check("all committed captures have unique strictly increasing positions",ordered);
return bad==0?0:1;
}}
`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-storage-')),file=path.join(dir,'rig.cs'),exe=path.join(dir,'rig.exe');fs.writeFileSync(file,rig);cp.execFileSync('mcs',['-out:'+exe,file],{stdio:'inherit'});const r=cp.spawnSync('mono',[exe],{stdio:'inherit'});process.exitCode=r.status===0?0:1;
