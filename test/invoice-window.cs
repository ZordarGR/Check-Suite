// CLOUD WINDOWS FIXTURE ONLY. Own test windows, invented guests, no vendor process.
using System;using System.Text;using System.Diagnostics;using System.Runtime.InteropServices;using System.Threading;using System.IO;using System.Windows.Forms;
class InvoiceWindow{
 [StructLayout(LayoutKind.Sequential)]struct Init{public int size;public int classes;}
 [DllImport("comctl32.dll")]static extern bool InitCommonControlsEx(ref Init init);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateWindowEx(int ex,string cls,string title,int style,int x,int y,int w,int h,IntPtr parent,IntPtr id,IntPtr inst,IntPtr param);
 [StructLayout(LayoutKind.Sequential)]struct Rect{public int left,top,right,bottom;}
 [DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")]static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 static void PlaceGrid(IntPtr win,IntPtr grid,int x,int y,int width,int height){
  Rect client;if(!GetClientRect(win,out client))throw new Exception("fixture client bounds unavailable");
  width=Math.Min(width,client.right-x-10);height=Math.Min(height,client.bottom-y-10);
  if(width<20||height<20)throw new Exception("fixture window is too small for B");
  if(!SetWindowPos(grid,IntPtr.Zero,x,y,width,height,0))throw new Exception("fixture grid resize failed");
 }
 static void RecordGrid(IntPtr grid,StringBuilder expected){
  Rect r;if(!GetWindowRect(grid,out r))throw new Exception("fixture grid bounds unavailable");
  expected.AppendLine("{\"x\":"+r.left+",\"y\":"+r.top+",\"width\":"+(r.right-r.left)+",\"height\":"+(r.bottom-r.top)+"}");
 }
 [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr h,IntPtr z,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool SetWindowText(IntPtr h,string text);
 [DllImport("user32.dll")]static extern bool DestroyWindow(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr SendMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 [StructLayout(LayoutKind.Sequential)]struct Col{public uint mask;public int fmt,width;public IntPtr text;public int len,sub,image,order,min,def,ideal;}
 [StructLayout(LayoutKind.Sequential)]struct Item{public uint mask;public int row,sub;public uint state,stateMask;public IntPtr text;public int len,image;public IntPtr param;public int indent,group;public uint columns;public IntPtr cols,fmt;public int groupIndex;}
 static IntPtr Control(IntPtr parent,string cls,int id,string text,int x,int y,int w,int h){
  return CreateWindowEx(0,cls,text,unchecked((int)0x50000000),x,y,w,h,parent,(IntPtr)id,IntPtr.Zero,IntPtr.Zero);
 }
 sealed class ListSpy:NativeWindow{
  public int Reads, Delays;
  public bool SlowNext;
  public ListSpy(IntPtr h){AssignHandle(h);}
  protected override void WndProc(ref Message m){
   if(m.Msg==0x1073||m.Msg==0x102D){
    Reads++;
    if(SlowNext){
     SlowNext=false;Delays++;
     byte[] before=new byte[40],after=new byte[40];
     Marshal.Copy(m.LParam,before,0,before.Length);
     Thread.Sleep(650); // exceed the helper's 250ms deadline while owning its pointer
     Marshal.Copy(m.LParam,after,0,after.Length);
     if(BitConverter.ToString(before)!=BitConverter.ToString(after))throw new Exception("Pending getter's scratch was reused");
    }
   }
   base.WndProc(ref m);
  }
 }
 [DllImport("user32.dll")]static extern void NotifyWinEvent(uint ev,IntPtr hwnd,int obj,int child);
 static void Scope(Process helper,long epoch,string mode){
  // Match Node's ASCII command bytes; StreamWriter may prepend an encoding BOM.
  byte[] bytes=Encoding.ASCII.GetBytes("scope "+epoch+" "+mode+"\n");
  helper.StandardInput.BaseStream.Write(bytes,0,bytes.Length);
  helper.StandardInput.BaseStream.Flush();
 }
 static void Column(IntPtr lv,int index,string title){
  var c=new Col{mask=0xF,width=95,text=Marshal.StringToHGlobalUni(title),len=title.Length,sub=index};
  IntPtr p=Marshal.AllocHGlobal(Marshal.SizeOf(c));
  try{Marshal.StructureToPtr(c,p,false);SendMessage(lv,0x1061,(IntPtr)index,p);}finally{Marshal.FreeHGlobal(c.text);Marshal.FreeHGlobal(p);}
 }
 static void Cell(IntPtr lv,int row,int col,string text,bool insert){
  var it=new Item{mask=1,row=row,sub=col,text=Marshal.StringToHGlobalUni(text),len=text.Length};
  IntPtr p=Marshal.AllocHGlobal(Marshal.SizeOf(it));
  try{Marshal.StructureToPtr(it,p,false);SendMessage(lv,insert?0x104Du:0x1074u,(IntPtr)row,p);}finally{Marshal.FreeHGlobal(it.text);Marshal.FreeHGlobal(p);}
 }
 static void Row(IntPtr lv,int row,string[] cells){for(int c=0;c<cells.Length;c++)Cell(lv,row,c,cells[c],c==0);}
 static void PumpUntil(Func<bool> done,int timeout){
  int start=Environment.TickCount;
  using(var timer=new System.Windows.Forms.Timer()){
   timer.Interval=25;
   timer.Tick+=(sender,e)=>{if(done()||Environment.TickCount-start>=timeout)Application.ExitThread();};
   timer.Start();Application.Run();
  }
 }
 [DllImport("kernel32.dll")]static extern uint SetErrorMode(uint mode);
 [STAThread]static int Main(string[] args){
  SetErrorMode(0x0002|0x8000);
  Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);
  try{return Run(args);}catch(Exception e){Console.Error.WriteLine(e);return 1;}
 }
 static int Run(string[] args){
  SetProcessDpiAwarenessContext(new IntPtr(-4));
  var init=new Init{size=8,classes=1};InitCommonControlsEx(ref init);
  string folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"RecCheck");
  Directory.CreateDirectory(folder);File.WriteAllText(Path.Combine(folder,"rc-tbind-binds.txt"),"watch=PROT32\n");
  // Verify optional list metadata through the production ReadTagged path first.
  IntPtr ih=CreateWindowEx(0,"#32770","Guests inhouse: 15/09/26",unchecked((int)0x10CF0000),20,20,1000,500,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
  IntPtr ihlv=CreateWindowEx(0,"SysListView32","",unchecked((int)0x50000001),10,10,960,400,ih,(IntPtr)22222,IntPtr.Zero,IntPtr.Zero);
  string[] ihcols={"Name","VIP","Room no.","RT","Adlt.","Arrival","Departure","Curr.","Price","Rate code","Balance","Stat.","Group","Code","Travel Agency","Sharer"};
  for(int i=0;i<ihcols.Length;i++)Column(ihlv,i,ihcols[i]);
  Row(ihlv,0,new string[]{"TEST GUEST","","101","BSV","2/0/0/0","14/09/26","21/09/26","EUR","150,00","RATE","0,00","CI","","","WEBHOTELIER",""});
  // The target has a running UI loop before a user can open a list in the real app.
  int warmAt=Environment.TickCount;
  PumpUntil(()=>Environment.TickCount-warmAt>=700,2000);
  var readInfo=new ProcessStartInfo(args[0],"inhouse "+Process.GetCurrentProcess().Id+" 0 400"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true};
  var read=Process.Start(readInfo);
  // Pump this UI thread while the OTHER process asks its getters.
  string listResult=null;
  read.OutputDataReceived+=(sender,e)=>{if(e.Data!=null)listResult=(listResult??"")+e.Data+"\n";};read.BeginOutputReadLine();
  int waitAt=Environment.TickCount;
  PumpUntil(()=>read.HasExited,10000);
  if(!read.HasExited)throw new Exception("IH reader did not finish within its budget");
  read.WaitForExit();
  File.WriteAllText(args[1]+".list",listResult??"");
  Console.WriteLine("Synthetic IH capture:\n"+listResult);
  DestroyWindow(ih);
  IntPtr win=CreateWindowEx(0,"#32770","Invoice",unchecked((int)0x00CF0000),50,80,1000,600,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
  if(win==IntPtr.Zero)throw new Exception("fixture window failed");
  IntPtr name=Control(win,"Edit",202,"TEST GUEST",10,10,200,20);
  Control(win,"Edit",206,"101",10,35,100,20);Control(win,"Edit",208,"14/09/26",120,35,100,20);
  Control(win,"Edit",209,"21/09/26",230,35,100,20);Control(win,"Edit",211,"PREPAID is only a note",10,60,900,20);
  IntPtr allocation=Control(win,"Button",214,"INDIVIDUAL",340,90,370,20), balance=Control(win,"Edit",224,"-900,00",340,510,100,20);
  Control(win,"Edit",1700,"EUR",800,10,100,20);IntPtr status=Control(win,"Edit",566,"CI",800,35,100,20);
  IntPtr b=CreateWindowEx(0,"SysListView32","",unchecked((int)0x50000001),340,120,620,350,win,(IntPtr)24445,IntPtr.Zero,IntPtr.Zero);
  string[] headers={"Date","Inv.date","Qty","Text","Price","Add. text","Curr."};
  for(int i=0;i<headers.Length;i++)Column(b,i,headers[i]);
  Row(b,0,new string[]{"14/09/26 01:00","14/09/26","1","*Arrangement","150,00","","EUR"});
  Row(b,1,new string[]{"13/09/26 12:00","13/09/26","1","UNFAMILIAR PAYMENT","-1.050,00","","EUR"});
  // A must never be mistaken for B.
  IntPtr a=CreateWindowEx(0,"SysListView32","",unchecked((int)0x50000001),10,120,300,350,win,(IntPtr)24444,IntPtr.Zero,IntPtr.Zero);
  for(int i=0;i<headers.Length;i++)Column(a,i,headers[i]);
  Row(a,0,new string[]{"14/09/26","14/09/26","1","IRRELEVANT A PAYMENT","-999,00","","EUR"});
  var spy=new ListSpy(b);
  ShowWindow(win,5);SetForegroundWindow(win);
  var expectedGrid=new StringBuilder();RecordGrid(b,expectedGrid);
  var si=new ProcessStartInfo("node","\""+Path.GetFullPath("test/invoice-pipe.js")+"\" \""+args[0]+"\" "+Process.GetCurrentProcess().Id){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardInput=true};
  var helper=Process.Start(si);var output=new StringBuilder();object gate=new object();
  long currentEpoch=0,excludedEpoch=0,resumeEpoch=0;
  int firstMetadataAt=0,firstStableMs=-1;
  helper.OutputDataReceived+=(sender,e)=>{
   if(e.Data==null)return;
   lock(gate){
    output.AppendLine(e.Data);
    if(firstStableMs<0&&firstMetadataAt!=0&&e.Data.Contains("\"complete\":true")&&e.Data.Contains("TEST GUEST"))firstStableMs=Environment.TickCount-firstMetadataAt;
    if(e.Data.Contains("\"kind\":\"metadata\"")){
     var match=System.Text.RegularExpressions.Regex.Match(e.Data,"\"epoch\":([0-9]+)");
     currentEpoch=long.Parse(match.Groups[1].Value);
     if(firstMetadataAt==0)firstMetadataAt=Environment.TickCount;
     bool outside=e.Data.Contains("FICTIONAL AGENCY");
     if(outside)excludedEpoch=currentEpoch;
     Scope(helper,currentEpoch,outside?"skip":"read");
    }
   }
  };
  Console.WriteLine("Fixture StreamWriter preamble (bypassed for ASCII protocol): "+BitConverter.ToString(helper.StandardInput.Encoding.GetPreamble()));
  helper.BeginOutputReadLine();
  int start=Environment.TickCount,phase=0,readsBefore=0,readsAfterCheckout=0,readsAfterStale=0,readsAfterResume=0,rapid=0;
  PumpUntil(()=>{
   int elapsed=Environment.TickCount-start;
   if(elapsed>6000&&phase==0){SetWindowPos(win,IntPtr.Zero,150,130,1100,650,0);PlaceGrid(win,b,350,130,700,390);RecordGrid(b,expectedGrid);phase++;}
   if(elapsed>10000&&phase==1){ShowWindow(win,3);PlaceGrid(win,b,340,120,650,400);RecordGrid(b,expectedGrid);phase++;}
   if(elapsed>14000&&phase==2){ShowWindow(win,9);PlaceGrid(win,b,340,120,620,350);SetForegroundWindow(win);RecordGrid(b,expectedGrid);phase++;}
   if(elapsed>18000&&phase==3){
    SetWindowText(name,"SECOND TEST GUEST");Cell(b,1,3,"Deposit Cash",false);Cell(b,1,4,"-750,00",false);phase++;
   }
   if(elapsed>23000&&phase==4){
    SetWindowText(name,"EXCLUDED TEST GUEST");SetWindowText(allocation,"FICTIONAL AGENCY");phase++;
   }
   if(elapsed>27000&&phase==5){
    lock(gate){if(excludedEpoch==0)throw new Exception("Excluded metadata was not delivered");}
    readsBefore=spy.Reads;if(readsBefore==0)throw new Exception("Fixture never observed the eligible reads");
    SetWindowText(balance,"0,00");SetWindowText(status,"CO");
    Cell(b,1,4,"-800,00",false);NotifyWinEvent(0x800E,b,-4,0);phase++;
   }
   if(elapsed>31000&&phase==6){
    readsAfterCheckout=spy.Reads;
    if(readsAfterCheckout!=readsBefore)throw new Exception("Excluded checkout scanned B entries");
    lock(gate){Scope(helper,currentEpoch-1,"read");}
    NotifyWinEvent(0x800E,b,-4,0);phase++;
   }
   if(elapsed>34000&&phase==7){
    readsAfterStale=spy.Reads;
    if(readsAfterStale!=readsBefore)throw new Exception("A stale scope command restarted B scans");
    // Simulate a newly captured qualifying list without changing any Invoice metadata.
    lock(gate){resumeEpoch=currentEpoch;Scope(helper,currentEpoch,"read");}
    phase++;
   }
   if(elapsed>39000&&phase==8){
    readsAfterResume=spy.Reads;
    if(readsAfterResume<=readsBefore)throw new Exception("Late eligibility did not resume B reads");
    SetWindowText(allocation,"INDIVIDUAL");
    ShowWindow(b,0);phase++;
   }
   if(elapsed>41000&&phase==9){ShowWindow(b,5);SetForegroundWindow(win);phase++;}
   if(elapsed>46000&&phase==10){
    SetWindowText(name,"DELAYED TEST GUEST");Cell(b,1,4,"-650,00",false);
    spy.SlowNext=true;NotifyWinEvent(0x800E,b,-4,0);phase++;
   }
   if(elapsed>53000&&phase==11){
    phase++;
   }
   if(elapsed>53000&&phase==12&&rapid<8&&elapsed>53000+rapid*150){
    SetWindowText(name,"RAPID TEST GUEST "+rapid);Cell(b,1,4,"-"+(600+rapid)+",00",false);rapid++;
   }
   if(elapsed>55000&&phase==12){
    SetWindowText(name,"FINAL TEST GUEST");Cell(b,1,4,"-600,00",false);phase++;
   }
   if(elapsed>61000&&phase==13){
    SetWindowText(name,"LONG TEST GUEST");
    for(int i=2;i<400;i++)Row(b,i,new string[]{"15/09/26","15/09/26","1","*Arrangement","150,00","","EUR"});
    NotifyWinEvent(0x800E,b,-4,0);phase++;
   }
   if(elapsed>71000&&phase==14){ShowWindow(win,6);phase++;}
   return elapsed>=74000;
  },77000);
  DestroyWindow(win);Application.DoEvents();Thread.Sleep(400);
  lock(gate)File.WriteAllText(args[1],output.ToString());
  File.WriteAllText(args[1]+".grid",expectedGrid.ToString());
  File.WriteAllText(args[1]+".scope","{\"before\":"+readsBefore+",\"checkout\":"+readsAfterCheckout+",\"stale\":"+readsAfterStale+",\"resumed\":"+readsAfterResume+",\"epoch\":"+resumeEpoch+"}");
  File.WriteAllText(args[1]+".recovery","{\"delays\":"+spy.Delays+",\"rapid\":"+rapid+"}");
  Console.WriteLine("FIRST_VERDICT_MS="+firstStableMs);
  GC.KeepAlive(spy);
  Console.WriteLine("Cloud fixture emitted "+output.Length+" characters");
  return 0;
 }
}
