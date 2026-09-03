/* The LVITEM the list control reads is laid out for the TARGET's bitness, not ours.
   Get an offset wrong and the control takes the text pointer out of padding and returns
   nothing — the failure would look exactly like "protel does not allow this". This is the
   one part of the read that can be checked without Windows, so it is.
   Build:  mcs -out:lvtest.exe test/lvitem.cs && mono lvtest.exe app/rc-tbind.exe */
using System; using System.Reflection;
class LvTest {
  static int bad = 0;
  static void Ck(string l, bool ok){ if(!ok) bad++; Console.WriteLine("  " + (ok?"ok  ":"FAIL") + "  " + l); }
  static int I(byte[] b, int at){ return b[at] | (b[at+1]<<8) | (b[at+2]<<16) | (b[at+3]<<24); }
  static long L(byte[] b, int at){ long v = 0; for(int i=7;i>=0;i--) v = (v<<8) | b[at+i]; return v; }
  static bool AllZero(byte[] b, int from){ for(int i=from;i<b.Length;i++) if(b[i]!=0) return false; return true; }
  static void Main(string[] a){
    Type T = Assembly.LoadFrom(a[0]).GetType("TBind");
    MethodInfo m = T.GetMethod("BuildLvItem", BindingFlags.NonPublic | BindingFlags.Static);
    if(m == null){ Console.WriteLine("BuildLvItem not found"); Environment.Exit(1); }

    byte[] b32 = (byte[])m.Invoke(null, new object[]{false, 7, 3, new IntPtr(0x11223344), 512});
    Ck("32-bit: LVIF_TEXT in mask",                I(b32,0) == 1);
    Ck("32-bit: iItem at 4",                       I(b32,4) == 7);
    Ck("32-bit: iSubItem at 8",                    I(b32,8) == 3);
    Ck("32-bit: state and stateMask left zero",    I(b32,12) == 0 && I(b32,16) == 0);
    Ck("32-bit: pszText at 20",                    I(b32,20) == 0x11223344);
    Ck("32-bit: cchTextMax at 24",                 I(b32,24) == 512);
    Ck("32-bit: struct is 48 bytes",               b32.Length == 48);
    Ck("32-bit: nothing written past cchTextMax",  AllZero(b32, 28));

    byte[] b64 = (byte[])m.Invoke(null, new object[]{true, 2, 5, new IntPtr(0x7ffe12345678L), 512});
    Ck("64-bit: LVIF_TEXT in mask",                I(b64,0) == 1);
    Ck("64-bit: iItem at 4",                       I(b64,4) == 2);
    Ck("64-bit: iSubItem at 8",                    I(b64,8) == 5);
    Ck("64-bit: pszText at 24, all eight bytes",   L(b64,24) == 0x7ffe12345678L);
    Ck("64-bit: the alignment gap at 20 is zero",  I(b64,20) == 0);
    Ck("64-bit: cchTextMax at 32",                 I(b64,32) == 512);
    Ck("64-bit: struct is 64 bytes",               b64.Length == 64);
    Ck("64-bit: nothing written past cchTextMax",  AllZero(b64, 36));

    Ck("a 32-bit pointer is not truncated at the boundary",
       I((byte[])m.Invoke(null, new object[]{false, 0, 0, new IntPtr(0x7FFFFFFF), 8}), 20) == 0x7FFFFFFF);

    /* --- WHICH layout gets chosen. The two above only prove each is built correctly;
       an audit found the wrong one being picked, which these assertions could not see. --- */
    MethodInfo t = T.GetMethod("TargetIs64", BindingFlags.NonPublic | BindingFlags.Static);
    if(t == null){ Console.WriteLine("  FAIL  TargetIs64 not found"); Environment.Exit(1); }
    Func<bool,bool,bool> pick = (os64, wow) => (bool)t.Invoke(null, new object[]{os64, wow});
    Ck("64-bit Windows, target in WOW64  -> 32-bit  (protel here)", pick(true,  true)  == false);
    Ck("64-bit Windows, target not WOW64 -> 64-bit",                pick(true,  false) == true);
    Ck("32-bit Windows -> always 32-bit, whatever WOW64 says",      pick(false, true)  == false);
    Ck("32-bit Windows, not WOW64        -> 32-bit",                pick(false, false) == false);
    Console.WriteLine(bad == 0 ? "\nall pass" : "\n" + bad + " FAILURES");
    Environment.Exit(bad == 0 ? 0 : 1);
  }
}
