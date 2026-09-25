"use strict";
const fs=require("fs"),os=require("os"),path=require("path"),cp=require("child_process"),assert=require("assert");
const s=fs.readFileSync("app/tbind.cs","utf8"),a=s.indexOf("  sealed class RateGridScan"),b=s.indexOf("  static bool RateGridTarget",a);
assert(a>0&&b>a);
const rig=String.raw`using System;using System.Text;
class Probe {
__NATIVE__
static int bad=0;
static string date(int n){return new DateTime(2026,9,1).AddDays(n).ToString("dd/MM/yy");}
static string cell(int r,int c){return c==2?date(r):c==3?"507":c==14?(r<5?"240,00":"220,00"):c==13?"TAX,*HB":"";}
static void check(bool good,string name){Console.WriteLine((good?"PASS ":"FAIL ")+name);if(!good)bad++;}
static int Main(){
foreach(int nights in new int[]{10,31,62,120,366,401,1000}){
 var scan=new RateGridScan("key","TITLE\tRate by Day Grid\n",nights+1);int calls=0,ticks=0;
 bool complete=false;while(!complete&&ticks++<10000)complete=scan.Step((r,c)=>{calls++;return cell(r,c);},()=>true);
 check(complete&&scan.rows.Count==nights+1&&calls==(nights+1)*16*2,"every cell twice for "+nights+" nights");
 string header="SYNTHETIC FULL GUEST , room 507, "+date(0)+" - "+date(nights);
 check(RateGridValid(scan,header),"full nightly coverage "+nights);
 check(RateGridBody(scan).Contains("DONE\t"+(nights+1)+"\t"+(nights+1)),"footer reflects all rows");
 scan.rows[7][2]=scan.rows[6][2];check(!RateGridValid(scan,header),"duplicate/missing day refused");
}
var changing=new RateGridScan("k","",11);bool threw=false;
try{while(true)changing.Step((r,c)=>changing.pass==1&&r==10&&c==14?"999,00":cell(r,c),()=>true);}catch(Exception){threw=true;}
check(threw,"last row changing between whole-list passes is rejected");
var failed=new RateGridScan("k","",401);threw=false;
try{failed.Step(cell,()=>false);}catch(Exception){threw=true;}
check(threw&&failed.rows.Count==0,"failed getter cannot advance a row");
return bad==0?0:1;
}
}`.replace("__NATIVE__",s.slice(a,b));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"native-rate-grid-")),cs=path.join(dir,"probe.cs"),exe=path.join(dir,"probe.exe");
fs.writeFileSync(cs,rig);cp.execFileSync("mcs",["-out:"+exe,cs],{stdio:"inherit"});cp.execFileSync("mono",[exe],{stdio:"inherit"});
