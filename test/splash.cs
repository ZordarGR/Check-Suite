/* The installation overlay's geometry, which is the half of it that CAN be checked here.
   The drawing itself needs Windows; the arithmetic that places it does not, and both ways
   of getting it wrong are silent: an icon a few pixels off centre looks like sloppiness,
   and a ring whose pen crosses the window edge is clipped flat on four sides. Neither
   would show up until it was on his screen mid-install, which is the worst place to find
   out. Reflection, so these are the SHIPPED constants and the shipped translation.
   Build:  mcs -out:sptest.exe test/splash.cs && mono sptest.exe app/rc-tbind.exe */
using System; using System.Reflection;
class SplashTest {
  static int bad = 0;
  static Type T;
  static void Ck(string l, bool ok){ if(!ok) bad++; Console.WriteLine("  " + (ok?"ok  ":"FAIL") + "  " + l); }
  static int C(string n){
    FieldInfo f = T.GetField(n, BindingFlags.NonPublic | BindingFlags.Static);
    if(f == null){ Console.WriteLine("  FAIL  no constant " + n); bad++; return -999999; }
    return Convert.ToInt32(f.GetValue(null));
  }
  static uint U(string n){
    FieldInfo f = T.GetField(n, BindingFlags.NonPublic | BindingFlags.Static);
    if(f == null){ Console.WriteLine("  FAIL  no constant " + n); bad++; return 0; }
    return Convert.ToUInt32(f.GetValue(null));
  }
  static void Main(string[] a){
    T = Assembly.LoadFrom(a[0]).GetType("TBind");
    int W = C("SPLASH_W"), H = C("SPLASH_H");
    int cx = C("SPLASH_CX"), cy = C("SPLASH_CY");
    int r = C("SPLASH_R"), pen = C("SPLASH_PEN");

    Ck("the window is square",                       W == H);
    Ck("the centre really is the centre",            cx == W/2 && cy == H/2);
    /* the pen straddles the radius, so the ring's outer edge is r + pen/2 */
    Ck("the ring fits, pen and all",                 r + pen/2 < W/2);
    Ck("and does not sit right on the edge",         W/2 - (r + pen/2) >= 4);
    Ck("the ring has room inside it for the icon",   r - pen > 60);

    /* the glyph is authored for the 170px caps window and moved into this bigger one */
    MethodInfo m = T.GetMethod("SplashGlyph", BindingFlags.NonPublic | BindingFlags.Static);
    if(m == null){ Console.WriteLine("  FAIL  no SplashGlyph"); bad++; }
    else {
      Array g = (Array)m.Invoke(null, new object[0]);
      Array src = (Array)T.GetField("GLYPH", BindingFlags.NonPublic | BindingFlags.Static).GetValue(null);
      Ck("every point is carried over",              g.Length == src.Length);
      int minx = int.MaxValue, maxx = int.MinValue, miny = int.MaxValue, maxy = int.MinValue;
      Type P = g.GetValue(0).GetType();
      FieldInfo fx = P.GetField("x"), fy = P.GetField("y");
      for(int i = 0; i < g.Length; i++){
        object p = g.GetValue(i);
        int x = Convert.ToInt32(fx.GetValue(p)), y = Convert.ToInt32(fy.GetValue(p));
        if(x < minx) minx = x; if(x > maxx) maxx = x;
        if(y < miny) miny = y; if(y > maxy) maxy = y;
      }
      /* centred to within a pixel: the glyph's own extent is odd on one axis */
      Ck("the icon is centred left to right",        Math.Abs((minx + maxx)/2 - cx) <= 1);
      Ck("the icon is centred top to bottom",        Math.Abs((miny + maxy)/2 - cy) <= 1);
      /* and clears the ring's inner edge, or the A touches the donut */
      int inner = r - pen/2;
      int far = 0;
      for(int i = 0; i < g.Length; i++){
        object p = g.GetValue(i);
        int dx = Convert.ToInt32(fx.GetValue(p)) - cx, dy = Convert.ToInt32(fy.GetValue(p)) - cy;
        int d = (int)Math.Sqrt(dx*dx + dy*dy);
        if(d > far) far = d;
      }
      Ck("the icon clears the ring's inner edge",    far < inner - 4);
      Ck("and is not lost inside it",                far > inner / 3);
    }

    /* the palette is the update button's, stated as COLORREF 0x00BBGGRR */
    Ck("the disc is #101d33",                        U("SPLASH_BACK")  == 0x00331D10);
    Ck("the track is #2f5f9e",                       U("SPLASH_TRACK") == 0x009E5F2F);
    Ck("the arc is #286edc",                         U("SPLASH_ARC")   == 0x00DC6E28);
    Ck("none of them is the colour key",
       U("SPLASH_BACK") != U("CAPS_KEY") && U("SPLASH_TRACK") != U("CAPS_KEY") && U("SPLASH_ARC") != U("CAPS_KEY"));

    /* it travels rather than fills, so the sweep must be a fraction of the circle */
    int sweep = C("SPLASH_SWEEP"), step = C("SPLASH_STEP_MS");
    Ck("the arc is an arc, not the whole ring",      sweep > 20 && sweep < 180);
    Ck("the frame rate is sane",                     step >= 16 && step <= 100);

    Console.WriteLine(bad == 0 ? "\nall pass" : "\n" + bad + " FAILURES");
    Environment.Exit(bad == 0 ? 0 : 1);
  }
}
