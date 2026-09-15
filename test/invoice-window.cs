// CLOUD WINDOWS FIXTURE ONLY. Own test windows, invented guests, no vendor process.
using System;using System.Text;using System.Diagnostics;using System.Runtime.InteropServices;using System.Threading;using System.IO;using System.Windows.Forms;
class InvoiceWindow{
 [StructLayout(LayoutKind.Sequential)]struct Init{public int size;public int classes;}
 [DllImport("comctl32.dll")]static extern bool InitCommonControlsEx(ref Init init);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr CreateWindowEx(int ex,string cls,string title,int style,int x,int y,int w,int h,IntPtr parent,IntPtr id,IntPtr inst,IntPtr param);
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
 [STAThread]static int Main(string[] args){
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
  while(Environment.TickCount-warmAt<700){Application.DoEvents();Thread.Sleep(10);}
  var readInfo=new ProcessStartInfo(args[0],"inhouse "+Process.GetCurrentProcess().Id+" 0 400"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true};
  var read=Process.Start(readInfo);
  // Pump this UI thread while the OTHER process asks its getters.
  string listResult=null;
  read.OutputDataReceived+=(sender,e)=>{if(e.Data!=null)listResult=(listResult??"")+e.Data+"\n";};read.BeginOutputReadLine();
  int waitAt=Environment.TickCount;
  while(!read.HasExited && Environment.TickCount-waitAt<10000){Application.DoEvents();Thread.Sleep(10);}
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
  Control(win,"Button",214,"INDIVIDUAL",340,90,370,20);Control(win,"Edit",224,"-900,00",340,510,100,20);
  Control(win,"Edit",1700,"EUR",800,10,100,20);Control(win,"Edit",566,"CI",800,35,100,20);
  IntPtr b=CreateWindowEx(0,"SysListView32","",unchecked((int)0x50000001),340,120,620,350,win,(IntPtr)24445,IntPtr.Zero,IntPtr.Zero);
  string[] headers={"Date","Inv.date","Qty","Text","Price","Add. text","Curr."};
  for(int i=0;i<headers.Length;i++)Column(b,i,headers[i]);
  Row(b,0,new string[]{"14/09/26 01:00","14/09/26","1","*Arrangement","150,00","","EUR"});
  Row(b,1,new string[]{"13/09/26 12:00","13/09/26","1","UNFAMILIAR PAYMENT","-1.050,00","","EUR"});
  // A must never be mistaken for B.
  IntPtr a=CreateWindowEx(0,"SysListView32","",unchecked((int)0x50000001),10,120,300,350,win,(IntPtr)24444,IntPtr.Zero,IntPtr.Zero);
  for(int i=0;i<headers.Length;i++)Column(a,i,headers[i]);
  Row(a,0,new string[]{"14/09/26","14/09/26","1","IRRELEVANT A PAYMENT","-999,00","","EUR"});
  ShowWindow(win,5);SetForegroundWindow(win);
  var si=new ProcessStartInfo(args[0],"invoice "+Process.GetCurrentProcess().Id){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true};
  var helper=Process.Start(si);var output=new StringBuilder();object gate=new object();
  helper.OutputDataReceived+=(sender,e)=>{if(e.Data!=null)lock(gate)output.AppendLine(e.Data);};
  helper.BeginOutputReadLine();
  int start=Environment.TickCount,phase=0;
  while(Environment.TickCount-start<27000){
   int elapsed=Environment.TickCount-start;
   if(elapsed>6000&&phase==0){SetWindowPos(win,IntPtr.Zero,150,130,1100,650,0);phase++;}
   if(elapsed>10000&&phase==1){ShowWindow(win,3);phase++;}
   if(elapsed>14000&&phase==2){ShowWindow(win,9);SetForegroundWindow(win);phase++;}
   if(elapsed>18000&&phase==3){
    SetWindowText(name,"SECOND TEST GUEST");Cell(b,1,3,"Deposit Cash",false);Cell(b,1,4,"-750,00",false);phase++;
   }
   if(elapsed>23000&&phase==4){ShowWindow(win,6);phase++;}
   Application.DoEvents();Thread.Sleep(20);
  }
  DestroyWindow(win);Application.DoEvents();Thread.Sleep(400);
  lock(gate)File.WriteAllText(args[1],output.ToString());
  Console.WriteLine("Cloud fixture emitted "+output.Length+" characters");
  return 0;
 }
}
