// Cloud Windows only. Synthetic controls; never launches or attaches to protel.
using System;using System.Text;using System.IO;using System.Diagnostics;using System.Runtime.InteropServices;using System.Reflection;using System.Threading;using System.Windows.Forms;
class RateGridWindow {
 [StructLayout(LayoutKind.Sequential)]struct Init{public int size,classes;}
 [DllImport("comctl32.dll")]static extern bool InitCommonControlsEx(ref Init x);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateWindowEx(int ex,string cls,string title,int style,int x,int y,int w,int h,IntPtr parent,IntPtr id,IntPtr inst,IntPtr param);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]static extern bool DestroyWindow(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool SetWindowText(IntPtr h,string text);
 [DllImport("user32.dll")]static extern uint MsgWaitForMultipleObjectsEx(uint count,IntPtr handles,uint milliseconds,uint mask,uint flags);
 [StructLayout(LayoutKind.Sequential)]struct Col{public uint mask;public int fmt,width;public IntPtr text;public int len,sub,image,order,min,def,ideal;}
 [StructLayout(LayoutKind.Sequential)]struct Item{public uint mask;public int row,sub;public uint state,stateMask;public IntPtr text;public int len,image;public IntPtr param;public int indent,group;public uint columns;public IntPtr cols,fmt;public int groupIndex;}
 static void Column(IntPtr lv,int i){
  var c=new Col{mask=0xF,width=85,text=Marshal.StringToHGlobalUni("Column "+i),len=20,sub=i};
  IntPtr p=Marshal.AllocHGlobal(Marshal.SizeOf(c));try{Marshal.StructureToPtr(c,p,false);SendMessage(lv,0x1061,(IntPtr)i,p);}finally{Marshal.FreeHGlobal(c.text);Marshal.FreeHGlobal(p);}
 }
 static void Cell(IntPtr lv,int r,int c,string value){
  var it=new Item{mask=1,row=r,sub=c,text=Marshal.StringToHGlobalUni(value),len=value.Length};
  IntPtr p=Marshal.AllocHGlobal(Marshal.SizeOf(it));try{Marshal.StructureToPtr(it,p,false);SendMessage(lv,c==0?0x104Du:0x1074u,(IntPtr)r,p);}finally{Marshal.FreeHGlobal(it.text);Marshal.FreeHGlobal(p);}
 }
 sealed class Spy:NativeWindow {
  public int reads,writes;
  public Spy(IntPtr h){AssignHandle(h);}
  protected override void WndProc(ref Message m){if(m.Msg==0x1073||m.Msg==0x102D)reads++;if(m.Msg==0x1074||m.Msg==0x104D||m.Msg==0x102E||m.Msg==0x1007||m.Msg==0x1008)writes++;base.WndProc(ref m);}
 }
 static string Date(int n){return new DateTime(2026,9,1).AddDays(n).ToString("dd/MM/yy");}
 static IntPtr Control(IntPtr h,string cls,int id,string text,int x,int y,int w,int height){
  return CreateWindowEx(0,cls,text,unchecked((int)0x50000000),x,y,w,height,h,(IntPtr)id,IntPtr.Zero,IntPtr.Zero);
 }
 static int Probe(string[] args){
  var type=Assembly.LoadFile(Path.GetFullPath(args[1])).GetType("TBind");
  var flags=BindingFlags.NonPublic|BindingFlags.Static;
  type.GetField("watchWantPids",flags).SetValue(null,new uint[]{uint.Parse(args[2])});
  var service=type.GetMethod("ServiceRateGrid",flags);
  DateTime deadline=DateTime.UtcNow.AddSeconds(100);
  while(DateTime.UtcNow<deadline){Application.DoEvents();service.Invoke(null,null);Thread.Sleep(100);}
  return 0;
 }
 static void Pump(int ms){var end=DateTime.UtcNow.AddMilliseconds(ms);while(DateTime.UtcNow<end){Application.DoEvents();MsgWaitForMultipleObjectsEx(0,IntPtr.Zero,10,0x04FF,0x0004);}}
 [STAThread]static int Main(string[] args){
  try{
   if(args[0]=="probe")return Probe(args);
   int nights=int.Parse(args[2]);
   var init=new Init{size=8,classes=1};if(!InitCommonControlsEx(ref init))throw new Exception("Common controls unavailable");
   IntPtr win=CreateWindowEx(0,"#32770","Rate by Day Grid",unchecked((int)0x10CF0000),30,30,760,360,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
   if(win==IntPtr.Zero)throw new Exception("Fixture dialog not created");
   string identity="SYNTHETIC LONG STAY , room 507, "+Date(0)+" - "+Date(nights);
   IntPtr guestControl=Control(win,"Edit",113,identity,10,10,650,25);Control(win,"Edit",110,"EUR",670,10,45,25);
   IntPtr lv=CreateWindowEx(0,"SysListView32","",unchecked((int)0x50000001),10,50,710,170,win,(IntPtr)24444,IntPtr.Zero,IntPtr.Zero);
   for(int c=0;c<16;c++)Column(lv,c);
   for(int r=0;r<=nights;r++)for(int c=0;c<16;c++)Cell(lv,r,c,c==2?Date(r):c==3?"507":c==14?(r<5?"240,00":"220,00"):c==13?"TAX,*HB":c==15?"Individuals":"");
   var spy=new Spy(lv);ShowWindow(win,5);SetForegroundWindow(win);
   string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"RecCheck","rc-list-RG.tsv");
   string probe=Path.GetFullPath(args[1]),helper=Path.GetFullPath(args[3]);
   var pi=new ProcessStartInfo(probe,"probe \""+helper+"\" "+Process.GetCurrentProcess().Id){UseShellExecute=false,CreateNoWindow=true};
   using(var p=Process.Start(pi)){
    DateTime end=DateTime.UtcNow.AddSeconds(80);string body="";
    while(DateTime.UtcNow<end){
     Pump(100);SetForegroundWindow(win);
     if(File.Exists(file)){try{body=File.ReadAllText(file);}catch(IOException){}}
     if(body.Contains(identity)&&body.Contains("\tcomplete\n"))break;
     if(p.HasExited)throw new Exception("Probe exited "+p.ExitCode);
    }
    if(!body.Contains(identity)||!body.Contains("\tcomplete\n"))throw new Exception("Full native capture missing: "+body.Substring(0,Math.Min(250,body.Length)));
    int rows=0;foreach(string line in body.Split('\n'))if(line.StartsWith("RG\t"))rows++;
    if(rows!=nights+1||!body.Contains("DONE\t"+(nights+1)+"\t"+(nights+1)))throw new Exception("Truncated grid "+rows);
    if(spy.reads<(nights+1)*16*2)throw new Exception("Not every cell verified");
    if(spy.writes!=0)throw new Exception("Reader modified native list");
    File.WriteAllText("native-rate-grid-"+nights+".tsv",body);
    Console.WriteLine("PASS native "+(IntPtr.Size*8)+"-bit target, 64-bit reader, "+rows+" rows, "+spy.reads+" getters, zero setters, small scrollable window");
    if(nights==62){
     string other=identity.Replace("SYNTHETIC LONG STAY","SYNTHETIC NEXT GUEST");
     SetWindowText(guestControl,other);DateTime switched=DateTime.UtcNow,until=switched.AddSeconds(7);
     string replacement="";
     while(DateTime.UtcNow<until){Pump(50);try{replacement=File.ReadAllText(file);}catch(IOException){}if(replacement.Contains(other)&&replacement.Contains("\tcomplete\n"))break;}
     if(!replacement.Contains(other)||!replacement.Contains("\tcomplete\n"))throw new Exception("Reused dialog was delayed by the previous guest's cooldown");
     if(spy.writes!=0)throw new Exception("Reader modified the reused grid");
     Console.WriteLine("PASS reused dialog captures the next guest before the old 10-second cooldown, "+(DateTime.UtcNow-switched).TotalSeconds.ToString("F1")+" seconds");
    }
    DestroyWindow(win);Pump(350);
    // Only the test reflection driver; completed capture means no getter remains in flight.
    p.Kill();p.WaitForExit();
   }
   return 0;
  }catch(Exception e){Console.Error.WriteLine(e);return 1;}
 }
}
