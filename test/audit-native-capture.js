/* Cloud-only: compile the shipped ReadTagged method against deterministic getter
   boundaries. Actual Windows pointer ownership is checked by invoice-window.cs. */
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert');
const src=fs.readFileSync(process.env.AUDIT_HELPER_SOURCE||'app/tbind.cs','utf8');
const a=src.indexOf('  static void ReadTagged(string tag, int maxRows){'),b=src.indexOf('  static string[] ReadRow(',a);assert(a>=0&&b>a);
const rig=`using System; using System.Text;
class Probe {
static StringBuilder READ; static int readMsgs, countCalls; static int rows=2;
static bool cellFail, cellThrow, mutate, countChange; static int mutateAfter=7;
const uint LVM_GETITEMCOUNT=1,SMTO_ABORTIFHUNG=2;
const int READ_BUDGET_MS=5000,PROCESS_VM_OPERATION=1,PROCESS_VM_READ=2,PROCESS_VM_WRITE=4,PROCESS_QUERY_LIMITED_INFORMATION=8,MEM_COMMIT=1,MEM_RESERVE=2,PAGE_READWRITE=4,MEM_RELEASE=8;
static string NeedleFor(string tag){return tag;}static string MissingFor(string tag){return tag;}
static IntPtr FindTaggedList(string needle,out string caption){caption="Guests inhouse: 18/09/26";return (IntPtr)1;}
static IntPtr SendMessageTimeout(IntPtr lv,uint msg,IntPtr w,IntPtr l,uint f,int timeout,out IntPtr res){countCalls++;res=(IntPtr)(countChange&&countCalls>1?1:rows);return (IntPtr)1;}
static void GetWindowThreadProcessId(IntPtr lv,out uint pid){pid=1;}
static IntPtr OpenProcess(int a,bool b,uint c){return (IntPtr)1;}
static bool IsWow64Process(IntPtr p,out bool v){v=false;return true;}
static IntPtr GetCurrentProcess(){return (IntPtr)1;}static bool TargetIs64(bool a,bool b){return a&&!b;}
static IntPtr VirtualAllocEx(IntPtr p,IntPtr a,UIntPtr n,int f,int g){return (IntPtr)1;}
static void VirtualFreeEx(IntPtr p,IntPtr a,UIntPtr n,int f){}static void CloseHandle(IntPtr p){}
static int[] ColsFor(string t){return new int[]{0,1,2,3,4,5};}
static int HeaderAt(string[] s,string t){return t=="PRICE"?6:t=="TRAVELAGENCY"?7:t=="CURRENCY"?8:-1;}
static string Cell(int row,int col){if(cellThrow)throw new Exception("getter failed");if(cellFail)return "";if(col==0)return "GUEST "+row;if(col==1)return (101+row).ToString();return "value";}
static string ReadCell(IntPtr p,IntPtr lv,bool t,int r,int c,IntPtr tx,IntPtr it,int n,bool w){return Cell(r,c);}
sealed class SafeListRead:IDisposable{
public bool ok=true; public int messages; int calls;
public SafeListRead(IntPtr p){}public SafeListRead(IntPtr p,bool recover){}
public string[] Headers(int max){return new string[]{"Name","Room"};}
public string Get(int r,int c,bool h){return GetText(r,c,h,true);}
public string GetText(int r,int c,bool h,bool wide){calls++;if(cellFail)ok=false;string x=Cell(r,c);return mutate&&calls>mutateAfter&&c==0?"OTHER GUEST":x;}
public void Dispose(){}
}
${src.slice(a,b)}
static int bad=0;
static void Run(string label,int max,bool fail,bool err,bool change,bool count,bool complete){
READ=new StringBuilder();countCalls=0;cellFail=fail;cellThrow=err;mutate=change;countChange=count;
ReadTagged("IH",max);string result=READ.ToString();bool actual=result.IndexOf("\\tcomplete\\n")>=0;
bool good=actual==complete;if(!good)bad++;Console.WriteLine((good?"PASS ":"FAIL ")+label+" => "+result.Replace("\\n"," | "));
}
static int Main(){
Run("complete stable capture",2,false,false,false,false,true);
Run("row cap cannot claim complete",1,false,false,false,false,false);
Run("failed cells cannot claim complete",2,true,false,false,false,false);
Run("exception cannot claim complete",2,false,true,false,false,false);
Run("row identity changes cannot claim complete",2,false,false,true,false,false);
mutateAfter=11;
Run("identity changes during rate getters cannot mix guests",2,false,false,true,false,false);
Run("list count changes cannot claim complete",2,false,false,false,true,false);
return bad==0?0:1;
}
}`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'audit-capture-')),cs=path.join(dir,'capture.cs'),exe=path.join(dir,'capture.exe');fs.writeFileSync(cs,rig);
cp.execFileSync('mcs',['-out:'+exe,cs],{stdio:'inherit'});
const result=cp.spawnSync('mono',[exe],{encoding:'utf8'});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');process.exitCode=result.status===0?0:1;
