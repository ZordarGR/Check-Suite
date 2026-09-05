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
  static void Set(string n, object v){
    FieldInfo f = T.GetField(n, BindingFlags.NonPublic | BindingFlags.Static);
    if(f == null){ Console.WriteLine("  FAIL  no field " + n); bad++; return; }
    f.SetValue(null, v);
  }
  static void Reset(int seconds){
    Set("splashLeftMs", seconds * 1000); Set("splashTotalMs", seconds * 1000);
    Set("splashPollMs", 0); Set("splashBackMs", 0);
    Set("splashSawGone", false); Set("splashBack", false); Set("splashDone", false);
  }
  /* goneAt/backAt in ms, -1 for never. Returns the ms at which it asked to close. */
  static int Drive(MethodInfo step, MethodInfo due, int stepMs, int seconds, int goneAt, int backAt){
    Reset(seconds);
    for(int ms = 0; ms < seconds * 1000 + stepMs * 4; ms += stepMs){
      bool here = !(goneAt >= 0 && ms >= goneAt) || (backAt >= 0 && ms >= backAt);
      bool polled = (bool)due.Invoke(null, new object[]{stepMs});
      if((bool)step.Invoke(null, new object[]{stepMs, polled, polled && here})) return ms;
    }
    return -1;
  }
  static void RunCase(string label, MethodInfo step, MethodInfo due, int stepMs, int seconds,
                      int goneAt, int backAt, bool expectQuick){
    int at = Drive(step, due, stepMs, seconds, goneAt, backAt);
    string when = at < 0 ? "never" : (at / 1000) + "s";
    if(expectQuick){
      /* it must end shortly after RecCheck returns — not at the timeout */
      Ck(label + " (ended " + when + ")", at >= backAt && at <= backAt + 3000);
    }else if(goneAt < 0){
      /* RecCheck never left: out at ~20 s, well before the timeout */
      Ck(label + " (ended " + when + ")", at > 19000 && at < 24000);
    }else{
      Ck(label + " (ended " + when + ")", at >= seconds * 1000 - 2000 && at <= seconds * 1000 + 500);
    }
  }
  /* is `need[from..from+len]` anywhere in `hay`? */
  static bool Contains(byte[] hay, byte[] need, int from, int len){
    if(from + len > need.Length) len = need.Length - from;
    if(len <= 0) return false;
    for(int i = 0; i + len <= hay.Length; i++){
      int j = 0;
      while(j < len && hay[i+j] == need[from+j]) j++;
      if(j == len) return true;
    }
    return false;
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

    /* HIS ICON GOES IN THE MIDDLE, not a letter. The first cut drew the Caps Lock glyph --
       a capital A -- and he asked what it was doing there. The picture cannot be checked
       without Windows, but three things about it can: that the exe actually carries an
       icon to blit, that the size asked for fits inside the ring, and that the old glyph
       is gone rather than merely unused. */
    int icon = C("SPLASH_ICON");
    Ck("the icon is asked for at a real size",        icon >= 64 && icon <= 200);
    /* the ring's inner edge is r - pen/2; a square inscribed in that circle has side
       inner * sqrt(2), and the icon must sit inside it corner to corner */
    double inner = r - pen / 2.0;
    Ck("and fits inside the ring, corner to corner",  icon <= inner * 1.414);
    Ck("with room to spare",                          icon < inner * 2 - 8);
    Ck("the Caps Lock letter is gone, not just unused",
       T.GetMethod("SplashGlyph", BindingFlags.NonPublic | BindingFlags.Static) == null);

    /* the .ico really is embedded: its largest image must appear verbatim in the exe */
    byte[] exe = System.IO.File.ReadAllBytes(a[0]);
    byte[] ico = System.IO.File.ReadAllBytes(System.IO.Path.Combine(
                   System.IO.Path.GetDirectoryName(a[0]), "reccheck.ico"));
    int n = ico[4] | (ico[5] << 8), bestW = 0, bestOff = 0, bestSize = 0;
    for(int i = 0; i < n; i++){
      int off = 6 + i * 16;
      int w = ico[off] == 0 ? 256 : ico[off];
      int size = ico[off+8] | (ico[off+9]<<8) | (ico[off+10]<<16) | (ico[off+11]<<24);
      int at   = ico[off+12] | (ico[off+13]<<8) | (ico[off+14]<<16) | (ico[off+15]<<24);
      if(w > bestW){ bestW = w; bestOff = at; bestSize = size; }
    }
    Ck("the icon file has a large image (" + bestW + "px)", bestW >= 128);
    Ck("and it is embedded in the helper", Contains(exe, ico, bestOff, 4096));

    /* the palette is the update button's, stated as COLORREF 0x00BBGGRR */
    Ck("the disc is #101d33",                        U("SPLASH_BACK")  == 0x00331D10);
    Ck("the track is #2f5f9e",                       U("SPLASH_TRACK") == 0x009E5F2F);
    Ck("the arc is #286edc",                         U("SPLASH_ARC")   == 0x00DC6E28);
    Ck("none of them is the colour key",
       U("SPLASH_BACK") != U("CAPS_KEY") && U("SPLASH_TRACK") != U("CAPS_KEY") && U("SPLASH_ARC") != U("CAPS_KEY"));

    /* it travels rather than fills, so the sweep must be a fraction of the circle */
    int sweep = C("SPLASH_SWEEP"), frameMs = C("SPLASH_STEP_MS");
    Ck("the arc is an arc, not the whole ring",      sweep > 20 && sweep < 180);
    Ck("the frame rate is sane",                     frameMs >= 16 && frameMs <= 100);


    /* ---- WHEN IT ENDS ----
       Every one of these happens on his machine, mid-install, with nobody watching. The
       state machine is lifted out of the window procedure precisely so they can be
       driven here instead of discovered there. */
    MethodInfo step = T.GetMethod("SplashStep", BindingFlags.NonPublic | BindingFlags.Static);
    MethodInfo due  = T.GetMethod("SplashPollDue", BindingFlags.NonPublic | BindingFlags.Static);
    if(step == null || due == null){ Console.WriteLine("  FAIL  no SplashStep/SplashPollDue"); bad++; }
    else {
      /* drive it exactly as the timer does: poll gate, then a step */
      Console.WriteLine();
      RunCase("gone at 8 s, back at 60 s — ends just after it returns", step, due, 40, 240,
              8000, 60000, true);
      RunCase("never goes away — out in ~20 s, not 240", step, due, 40, 240,
              -1, -1, false);
      /* gone and never seen again: only the hard timeout can end this one */
      RunCase("never comes back — the hard timeout holds", step, due, 40, 240,
              2000, -1, false);
      /* the regression that mattered: 1200 / 35 is not a whole number, and the first
         version could only leave on an exact zero */
      RunCase("still leaves when the step does not divide the hand-off", step, due, 35, 240,
              5000, 30000, true);
      RunCase("and with a coarse step too", step, due, 90, 240,
              5000, 30000, true);
      /* the process table must not be walked every frame */
      Reset(240);
      int polls = 0;
      for(int ms = 0; ms < 10000; ms += 40) if((bool)due.Invoke(null, new object[]{40})) polls++;
      Ck("the process table is read about once a second", polls >= 9 && polls <= 11);
    }

    Console.WriteLine(bad == 0 ? "\nall pass" : "\n" + bad + " FAILURES");
    Environment.Exit(bad == 0 ? 0 : 1);
  }
}
