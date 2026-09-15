using System;using System.Reflection;
class HeaderTest{
 static int Main(string[] args){
  var t=Assembly.LoadFrom(args[0]).GetType("TBind");
  var m=t.GetMethod("BuildHeaderItem",BindingFlags.NonPublic|BindingFlags.Static);
  foreach(bool wide in new bool[]{false,true}){
   long ptr=wide?0x123456781234L:0x12345678L;
   var b=(byte[])m.Invoke(null,new object[]{wide,new IntPtr(ptr),1024});
   if(BitConverter.ToInt32(b,0)!=2||BitConverter.ToInt32(b,wide?24:16)!=1024
      ||(wide?BitConverter.ToInt64(b,8):BitConverter.ToInt32(b,8))!=ptr||b.Length<72)return 1;
  }
  Console.WriteLine("HDITEM 32/64-bit layouts passed");return 0;
 }
}
