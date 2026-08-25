// rc-tbind — RecCheck helper: bind mouse buttons or keyboard combos to protel shortcuts.
//   rc-tbind.exe detect <parentPid>
//       -> waits for a middle/X1/X2 press or a key combo, prints "BTN:<code>"
//          or "KEY:<mods>-<vk>", exits
//   rc-tbind.exe bind <parentPid> <trigger>=<action> [<trigger>=<action> ...]
//       -> swallows each trigger system-wide and performs its action instead
//   rc-tbind.exe diag <parentPid> [delayMs]
//       -> waits, then runs the tau shortcut against the foreground window and prints
//          every step it observed, so a machine where it fails can say why
//   rc-tbind.exe ping
//       -> prints "RCTBIND OK <version>" and exits 0. Installs nothing and touches
//          nothing. It exists so the app can tell the difference between "the helper
//          is missing", "the helper will not start" and "the helper starts but the
//          hooks are refused" instead of failing silently for all three.
//
// Triggers: m<mods>-<btn>   3 = middle, 4 = X1 (Back), 5 = X2 (Forward); bare "m4" = no mods
//           k<mods>-<vk>    mods bitmask: 1 = Ctrl, 2 = Alt, 4 = Shift, 8 = Win
// Actions:  tau            = a real Greek τ keypress (verified layout hop)
//           altf4          = a real Alt+F4 (closes the focused window)
//           seq:<vk,...>[@ms] = a fixed run of keystrokes, e.g. seq:13,13,39,13,13@120
//                            (Enter Enter Right Enter Enter). Extended keys such as the
//                            arrows carry the extended flag so they are not read as numpad.
// Left/right mouse buttons are never bindable.
//
// Design notes (v2 — the v1 pump could stall and throttle the whole desktop's mouse):
//   * raw Win32 GetMessage loop — no frameworks, nothing else runs on the hook thread
//   * the hook callback ONLY classifies and returns; the actual SendInput happens on the
//     message loop via PostThreadMessage, never inside the hook
//   * the parent watchdog is an independent thread that hard-exits the process,
//     so the helper dies with RecCheck even if the loop is somehow wedged
//
// Design notes (v3 — the layout hop is synchronous instead of sleep-and-hope):
//   * v2 posted WM_INPUTLANGCHANGEREQUEST and slept 90 ms before pressing T, then 90 ms
//     more before hopping back (~180 ms felt latency). v3 SENDS the request with
//     SendMessageTimeout, which returns the moment the target window has processed it —
//     the τ lands in single-digit milliseconds on a responsive app.
//   * every hop is VERIFIED with GetKeyboardLayout(targetThread). If the app ignored the
//     request, fall back to AttachThreadInput + ActivateKeyboardLayout on its thread;
//     if even that fails, fall back to the old post-and-wait; last resort is Unicode τ.
//   * the hop BACK still waits for the keystroke to leave the input queue first
//     (GetQueueStatus poll while attached, worst-case bounded sleep otherwise) — restoring
//     the layout before the target translates the key would turn the τ into a plain t.
//   * the Greek HKL is loaded once and cached, not on every press.
//
// Design notes (v7 — Win+Space is how the layout actually changes):
//   * the shape is: if the target is ALREADY Greek, just press T and change nothing;
//     otherwise Win+Space, press T, Win+Space back.
//   * every other method asks the application to change its own layout, and protel is
//     exactly the application that refuses — so those are now the backstop, not the
//     opening move. Win+Space goes over its head: the SHELL performs the switch.
//   * it CYCLES rather than selecting, so it presses, verifies, and repeats up to the
//     number of installed layouts; with the usual EN+EL pair that is a single press.
//   * the Win key is released in a finally: a stuck Win key would turn every following
//     keystroke into a shell shortcut, and releasing it after Space has registered is
//     also what stops the Start menu opening.
//
// Design notes (v6 — the layout could be left switched to Greek):
//   * PostMessage cannot be recalled. On the way TO Greek a request processed after we
//     stopped waiting flipped the layout with nobody left to undo it: no tau AND a
//     stranded keyboard from one press, and it looked intermittent because it depended
//     on how busy the target was. That direction is now synchronous-only; the
//     fire-and-forget fallback survives only when RESTORING, where late is still correct.
//   * ActivateKeyboardLayout while attached is tried FIRST — synchronous, local, and
//     incapable of arriving late.
//   * the restore runs whether or not the hop verified, and re-checks that the layout
//     stayed restored instead of discarding its own result.
//
// Design notes (v4 — multiple binds, keyboard triggers, Alt+F4):
//   * a low-level KEYBOARD hook sits beside the mouse hook so a plain key or a combo can
//     drive the same actions — colleagues without a side-button mouse get the same speed
//   * injected events (our own SendInput output) are ignored by both hooks, so an action
//     can never re-trigger itself
//   * the layout restore moved into a finally, and a zero target thread id is rejected:
//     GetKeyboardLayout(0) reports OUR thread, whose layout LoadKeyboardLayout already set
//     to Greek, so a hop could report success while the target never moved
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

static class TBind {
  const int WH_MOUSE_LL    = 14, WH_KEYBOARD_LL = 13;
  const int WM_MBUTTONDOWN = 0x0207, WM_MBUTTONUP = 0x0208;
  const int WM_XBUTTONDOWN = 0x020B, WM_XBUTTONUP = 0x020C;
  const int WM_KEYDOWN     = 0x0100, WM_KEYUP = 0x0101;
  const int WM_SYSKEYDOWN  = 0x0104, WM_SYSKEYUP = 0x0105;
  const uint WM_QUIT       = 0x0012;
  const uint WM_APP_SEND   = 0x8000 + 1;
  const uint KEYEVENTF_UNICODE = 0x0004, KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_EXTENDEDKEY = 0x0001;
  const uint WM_INPUTLANGCHANGEREQUEST = 0x0050;
  const uint KLF_ACTIVATE = 1;
  const uint SMTO_ABORTIFHUNG = 0x0002;
  const uint QS_KEY = 0x0001;
  const uint LLMHF_INJECTED = 0x0001, LLKHF_INJECTED = 0x0010;
  const ushort VK_T = 0x54, VK_F4 = 0x73;
  const int VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12;
  const int VK_LWIN = 0x5B, VK_RWIN = 0x5C;
  const char TAU = 'τ';
  const long GREEK = 0x0408;

  const int ACT_TAU = 1, ACT_ALTF4 = 2, ACT_SEQ = 3;

  delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hk);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG msg);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG msg);
  [DllImport("user32.dll")] static extern bool PostThreadMessage(uint tid, uint msg, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint idThread);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr LoadKeyboardLayout(string klid, uint flags);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  [DllImport("user32.dll")] static extern IntPtr ActivateKeyboardLayout(IntPtr hkl, uint flags);
  [DllImport("user32.dll")] static extern uint GetQueueStatus(uint flags);
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO gui);
  [DllImport("user32.dll")] static extern int GetKeyboardLayoutList(int n, [Out] IntPtr[] list);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);

  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential)] struct GUITHREADINFO {
    public int cbSize; public uint flags;
    public IntPtr hwndActive, hwndFocus, hwndCapture, hwndMenuOwner, hwndMoveSize, hwndCaret;
    public RECT rcCaret;
  }
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }
  [StructLayout(LayoutKind.Sequential)] struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }

  static HookProc keepMouse, keepKeys;   // prevent the delegates from being garbage-collected
  static IntPtr hook = IntPtr.Zero, kbHook = IntPtr.Zero;
  static int mode = 0;                   // 1 = detect, 2 = bind
  static uint mainTid = 0;
  static Thread watchdog;                // static ref so it can never be collected
  class Bind { public int action; public ushort[] keys; public int gap; }
  static readonly List<Bind> bindList = new List<Bind>();
  static readonly Dictionary<string, int> binds = new Dictionary<string, int>();   // trigger -> index
  static readonly HashSet<uint> swallowed = new HashSet<uint>();   // keys whose KEYUP we must eat too
  static readonly HashSet<int> swallowedBtn = new HashSet<int>();  // buttons whose release we must eat

  static bool IsModifierVk(uint vk){
    return vk == VK_SHIFT || vk == VK_CONTROL || vk == VK_MENU || vk == VK_LWIN || vk == VK_RWIN
        || vk == 0xA0 || vk == 0xA1 || vk == 0xA2 || vk == 0xA3 || vk == 0xA4 || vk == 0xA5;
  }
  static int CurMods(){
    int m = 0;
    if((GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0) m |= 1;
    if((GetAsyncKeyState(VK_MENU)    & 0x8000) != 0) m |= 2;
    if((GetAsyncKeyState(VK_SHIFT)   & 0x8000) != 0) m |= 4;
    if(((GetAsyncKeyState(VK_LWIN) | GetAsyncKeyState(VK_RWIN)) & 0x8000) != 0) m |= 8;
    return m;
  }

  static int ButtonOf(IntPtr wParam, IntPtr lParam, out bool down){
    int m = wParam.ToInt32();
    down = m == WM_MBUTTONDOWN || m == WM_XBUTTONDOWN;
    if(m == WM_MBUTTONDOWN || m == WM_MBUTTONUP) return 3;
    if(m == WM_XBUTTONDOWN || m == WM_XBUTTONUP){
      MSLLHOOKSTRUCT info = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
      return ((info.mouseData >> 16) & 0xFFFF) == 2 ? 5 : 4;
    }
    return 0;
  }

  static void KeyEvent(ushort vk, ushort scan, uint flags){
    INPUT[] one = new INPUT[1];
    one[0].type = 1; // INPUT_KEYBOARD
    one[0].u.ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags, time = 0, dwExtraInfo = IntPtr.Zero };
    SendInput(1, one, Marshal.SizeOf(typeof(INPUT)));
  }
  static void PressKeys(ushort vk, ushort scan, uint flags){
    INPUT[] inputs = new INPUT[2];
    inputs[0].type = 1;
    inputs[0].u.ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags, time = 0, dwExtraInfo = IntPtr.Zero };
    inputs[1].type = 1;
    inputs[1].u.ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags | KEYEVENTF_KEYUP, time = 0, dwExtraInfo = IntPtr.Zero };
    SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
  }
  static void PressTau(){ PressKeys(0, (ushort)TAU, KEYEVENTF_UNICODE); }

  /* When DIAG is non-null every step of the hop records what it saw, so a machine
     where this does not work can report the reason instead of failing silently. */
  static StringBuilder DIAG = null;
  static void D(string line){ if(DIAG != null) DIAG.AppendLine(line); }
  static string Hex(IntPtr p){ return "0x" + ((long)p).ToString("X8"); }

  /* An HKL is (device handle << 16) | language id. Two HKLs for the same language can
     carry different device handles — a second Greek layout, or one Windows re-created —
     so comparing whole handles can report a hop as failed when it actually worked.
     Only the language id is meaningful here. */
  static bool SameLang(IntPtr a, IntPtr b){ return ((long)a & 0xFFFF) == ((long)b & 0xFFFF); }
  static bool ThreadHasLang(uint tid, IntPtr hkl){ return SameLang(GetKeyboardLayout(tid), hkl); }
  /* the control that actually has keyboard focus inside the target thread */
  static IntPtr FocusedOf(uint tid){
    GUITHREADINFO gi = new GUITHREADINFO();
    gi.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    try{ if(GetGUIThreadInfo(tid, ref gi)) return gi.hwndFocus; }catch(Exception){}
    return IntPtr.Zero;
  }
  static string Describe(IntPtr hwnd){
    if(hwnd == IntPtr.Zero) return "(none)";
    StringBuilder cls = new StringBuilder(128), txt = new StringBuilder(128);
    try{ GetClassName(hwnd, cls, cls.Capacity); }catch(Exception){}
    try{ GetWindowText(hwnd, txt, txt.Capacity); }catch(Exception){}
    return Hex(hwnd) + " class=\"" + cls + "\" title=\"" + txt + "\"";
  }

  static IntPtr grkCached = IntPtr.Zero;
  static IntPtr GreekHKL(){
    if(grkCached == IntPtr.Zero){
      try{ grkCached = LoadKeyboardLayout("00000408", KLF_ACTIVATE); }catch(Exception){}
    }
    return grkCached;
  }

  /* switch the target thread's layout and return only when it has actually changed */
  /* allowPost: may we fall back to a fire-and-forget PostMessage?
     Only where a LATE arrival cannot hurt. Going TO Greek it can: PostMessage cannot be
     recalled, so a request processed after we stop waiting flips the layout with nobody
     left to put it back — no tau AND a stranded keyboard, from the same press. Coming
     BACK it is exactly what we want, because arriving late still means correct. */
  static bool HopTo(IntPtr fg, uint tid, IntPtr hkl, bool attached, bool allowPost){
    if(ThreadHasLang(tid, hkl)){ D("    already on the target layout"); return true; }
    /* Win+Space FIRST. Everything below asks the target application to change its own
       layout, and protel is precisely the application that will not — trying those first
       only spends a few hundred milliseconds before flashing the switcher anyway. The
       shell shortcut needs no cooperation, so it is the one that actually lands. */
    if(HopViaWinSpace(tid, hkl)) return true;
    /* Attached-local: synchronous, silent, and no message that can arrive late. */
    if(attached){
      ActivateKeyboardLayout(hkl, 0);
      D("    ActivateKeyboardLayout (attached) layout now " + Hex(GetKeyboardLayout(tid)));
      if(ThreadHasLang(tid, hkl)) return true;
    }else D("    AttachThreadInput had failed, so ActivateKeyboardLayout was skipped");
    IntPtr res;
    IntPtr focus = FocusedOf(tid);
    /* The request has to reach the window that owns keyboard focus. On a dialog-heavy
       app that is a child control, not the top-level window the old code always used. */
    IntPtr[] targets = (focus != IntPtr.Zero && focus != fg) ? new IntPtr[]{focus, fg} : new IntPtr[]{fg};
    foreach(IntPtr target in targets){
      IntPtr r = SendMessageTimeout(target, WM_INPUTLANGCHANGEREQUEST, IntPtr.Zero, hkl, SMTO_ABORTIFHUNG, 150, out res);
      D("    SendMessageTimeout -> " + Describe(target) + " returned=" + (r != IntPtr.Zero) +
        " layout now " + Hex(GetKeyboardLayout(tid)));
      if(ThreadHasLang(tid, hkl)) return true;
    }
    if(allowPost){
      PostMessage(fg, WM_INPUTLANGCHANGEREQUEST, IntPtr.Zero, hkl);
      for(int i = 0; i < 12; i++){
        Thread.Sleep(15);
        if(ThreadHasLang(tid, hkl)){ D("    PostMessage worked after " + ((i + 1) * 15) + " ms"); return true; }
      }
    }
    D("    every attempt failed; layout is still " + Hex(GetKeyboardLayout(tid)));
    return false;
  }
  /* Win+Space is handled by the SHELL, not by the target application, so it works where
     asking the app politely does not — which is the whole failure we keep hitting. Two
     costs: it flashes the layout switcher, and it CYCLES rather than selecting, so with
     three layouts installed the first press can land on the wrong one. Hence: cycle,
     verify after each press, and stop the moment we are on the language we wanted. */
  static void PressWinSpace(){
    ushort scWin = (ushort)MapVirtualKey(VK_LWIN, 0), scSpace = (ushort)MapVirtualKey(0x20, 0);
    int m = CurMods();      // a modifier the user is holding would spoil the chord
    if((m & 1) != 0) KeyEvent(VK_CONTROL, (ushort)MapVirtualKey(VK_CONTROL, 0), KEYEVENTF_KEYUP);
    if((m & 2) != 0) KeyEvent(VK_MENU,    (ushort)MapVirtualKey(VK_MENU, 0),    KEYEVENTF_KEYUP);
    if((m & 4) != 0) KeyEvent(VK_SHIFT,   (ushort)MapVirtualKey(VK_SHIFT, 0),   KEYEVENTF_KEYUP);
    try{
      KeyEvent(VK_LWIN, scWin, KEYEVENTF_EXTENDEDKEY);
      KeyEvent(0x20, scSpace, 0);
      KeyEvent(0x20, scSpace, KEYEVENTF_KEYUP);
    }finally{
      /* The Win key MUST come back up even if injection throws: a stuck Win key turns
         every subsequent keystroke into a shell shortcut. Releasing it after a Space has
         been seen also stops the Start menu opening, which a lone Win press would do. */
      KeyEvent(VK_LWIN, scWin, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP);
    }
  }
  static bool HopViaWinSpace(uint tid, IntPtr hkl){
    int count = 0;
    try{ count = GetKeyboardLayoutList(0, null); }catch(Exception){}
    if(count < 2){ D("    Win+Space skipped: only one layout installed"); return false; }
    int tries = count > 4 ? 4 : count;          // never cycle forever hunting a layout
    for(int i = 0; i < tries; i++){
      PressWinSpace();
      for(int w = 0; w < 10; w++){
        Thread.Sleep(20);
        if(ThreadHasLang(tid, hkl)){
          D("    Win+Space landed on the target after " + (i + 1) + " press(es)");
          return true;
        }
      }
      D("    Win+Space press " + (i + 1) + " -> layout " + Hex(GetKeyboardLayout(tid)));
    }
    return false;
  }

  /* Put the user's layout back and keep checking that it STAYED back. Costs one
     comparison when nothing moved. The retries cover a request the target processes
     late, which is the whole reason the keyboard used to stick on Greek. */
  static void RestoreLayout(IntPtr fg, uint tid, IntPtr cur, bool attached){
    if(cur == IntPtr.Zero) return;
    for(int round = 0; round < 3; round++){
      if(ThreadHasLang(tid, cur)){
        Thread.Sleep(40);                  // settle: catch a straggler flipping it again
        if(ThreadHasLang(tid, cur)) return;
        D("  layout drifted back to Greek after restoring — going again");
      }
      D("  restore attempt " + (round + 1) + ":");
      try{ HopTo(fg, tid, cur, attached, true); }catch(Exception){}
    }
    if(!ThreadHasLang(tid, cur))
      D("  COULD NOT RESTORE the layout; it is left on " + Hex(GetKeyboardLayout(tid)));
  }
  /* the T we SendInput is TRANSLATED under whatever layout is active when the target
     pulls it off the queue — never hop back before it has been consumed */
  static void WaitKeyDrained(bool attached){
    if(attached){
      for(int i = 0; i < 12; i++){                 // queues are shared while attached,
        if((GetQueueStatus(QS_KEY) >> 16) == 0) return;   // so we can see the key leave
        Thread.Sleep(5);
      }
      return;
    }
    Thread.Sleep(90);                              // can't observe the queue — v2 delay
  }
  /* a real press of the T KEY under the GREEK layout — protel and friends see a genuine
     keystroke (WM_KEYDOWN VK_T + WM_CHAR 'τ'), not a pasted character. If the foreground
     window is on another layout, hop it to Greek for the press and hop it right back. */
  static void SendGreekT(){
    IntPtr fg = GetForegroundWindow();
    if(fg == IntPtr.Zero){ D("  no foreground window -> Unicode fallback"); PressTau(); return; }
    uint pid;
    uint tid = GetWindowThreadProcessId(fg, out pid);
    D("  foreground " + Describe(fg));
    D("  owning thread=" + tid + " pid=" + pid + " (" + ProcName(pid) + ")");
    D("  focused control " + Describe(FocusedOf(tid)));
    // tid 0 would make GetKeyboardLayout report OUR thread — already Greek from
    // LoadKeyboardLayout(KLF_ACTIVATE) — and every hop check would pass bogusly.
    if(tid == 0){ D("  thread id 0 -> Unicode fallback"); PressTau(); return; }
    IntPtr cur = GetKeyboardLayout(tid);
    ushort sc = (ushort)MapVirtualKey(VK_T, 0);
    D("  target layout " + Hex(cur) + "   this helper's layout " + Hex(GetKeyboardLayout(0)));
    D("  T scan code 0x" + sc.ToString("X2"));
    if(((long)cur & 0xFFFF) == GREEK){
      D("  target is ALREADY Greek -> pressing T directly (this is the path that works for you)");
      PressKeys(VK_T, sc, 0); return;
    }
    IntPtr grk = GreekHKL();
    D("  LoadKeyboardLayout(00000408) -> " + Hex(grk));
    D("  installed layouts: " + LayoutList());
    if(grk == IntPtr.Zero){ D("  no Greek layout -> Unicode fallback"); PressTau(); return; }
    bool attached = AttachThreadInput(GetCurrentThreadId(), tid, true);
    D("  AttachThreadInput -> " + attached + (attached ? "" : "   (blocked: different desktop, or protel runs elevated and RecCheck does not)"));
    try{
      D("  hop attempts:");
      if(!HopTo(fg, tid, grk, attached, false)){   // no fire-and-forget on the way TO Greek
        D("  HOP FAILED -> falling back to injecting Unicode tau, which protel appears to ignore");
        PressTau(); return;
      }
      D("  hop OK, layout now " + Hex(GetKeyboardLayout(tid)) + " -> pressing VK_T");
      PressKeys(VK_T, sc, 0);
      WaitKeyDrained(attached);
    }finally{
      /* Restore unconditionally, and survive an exception on the press. The old code
         only restored when the hop had been VERIFIED, so a request that landed after we
         gave up left the user typing Greek in every program with nobody to undo it. */
      RestoreLayout(fg, tid, cur, attached);
      D("  layout after restore " + Hex(GetKeyboardLayout(tid)));
      if(attached) AttachThreadInput(GetCurrentThreadId(), tid, false);
    }
  }
  /* a real Alt+F4. Any other modifier the user is physically holding (because the
     trigger itself was a combo) would corrupt it, so release those first. */
  static void SendAltF4(){
    int m = CurMods();
    ushort scCtrl = (ushort)MapVirtualKey(VK_CONTROL, 0), scShift = (ushort)MapVirtualKey(VK_SHIFT, 0);
    ushort scAlt = (ushort)MapVirtualKey(VK_MENU, 0), scF4 = (ushort)MapVirtualKey(VK_F4, 0);
    if((m & 1) != 0) KeyEvent(VK_CONTROL, scCtrl, KEYEVENTF_KEYUP);
    if((m & 4) != 0) KeyEvent(VK_SHIFT, scShift, KEYEVENTF_KEYUP);
    if((m & 8) != 0){
      KeyEvent(VK_LWIN, (ushort)MapVirtualKey(VK_LWIN, 0), KEYEVENTF_KEYUP);
      KeyEvent(VK_RWIN, (ushort)MapVirtualKey(VK_RWIN, 0), KEYEVENTF_KEYUP);
    }
    bool altHeld = (m & 2) != 0;                  // already down: reuse it, don't double it
    if(!altHeld) KeyEvent(VK_MENU, scAlt, 0);
    KeyEvent(VK_F4, scF4, 0);
    KeyEvent(VK_F4, scF4, KEYEVENTF_KEYUP);
    if(!altHeld) KeyEvent(VK_MENU, scAlt, KEYEVENTF_KEYUP);
  }

  static string ProcName(uint pid){
    try{ return Process.GetProcessById((int)pid).ProcessName + ".exe"; }catch(Exception){ return "?"; }
  }
  static string LayoutList(){
    try{
      int n = GetKeyboardLayoutList(0, null);
      if(n <= 0) return "(none)";
      IntPtr[] list = new IntPtr[n];
      GetKeyboardLayoutList(n, list);
      StringBuilder sb = new StringBuilder();
      for(int i = 0; i < n; i++){
        if(i > 0) sb.Append(", ");
        sb.Append(Hex(list[i]));
        if(((long)list[i] & 0xFFFF) == GREEK) sb.Append(" <- Greek");
      }
      return sb.ToString();
    }catch(Exception e){ return "(failed: " + e.Message + ")"; }
  }

  /* Arrows, Insert/Delete, Home/End, PageUp/Down and friends are EXTENDED keys. Without
     the extended flag the target can read them as their numpad twins — a Right Arrow
     arriving as numpad 6 would type a digit instead of moving the selection. */
  static bool IsExtendedVk(ushort vk){
    return vk == 0x21 || vk == 0x22 || vk == 0x23 || vk == 0x24    // PgUp PgDn End Home
        || vk == 0x25 || vk == 0x26 || vk == 0x27 || vk == 0x28    // arrows
        || vk == 0x2D || vk == 0x2E                                // Insert Delete
        || vk == 0x2C || vk == 0x6F || vk == 0x90;                 // PrintScreen Divide NumLock
  }
  /* A fixed run of keystrokes, with a pause between them so a dialog has time to appear.
     Plain navigation keys only — nothing here depends on the keyboard layout. */
  static void SendSequence(Bind b){
    if(b == null || b.keys == null) return;
    for(int i = 0; i < b.keys.Length; i++){
      ushort vk = b.keys[i];
      ushort sc = (ushort)MapVirtualKey(vk, 0);
      PressKeys(vk, sc, IsExtendedVk(vk) ? KEYEVENTF_EXTENDEDKEY : 0);
      if(i < b.keys.Length - 1) Thread.Sleep(b.gap);
    }
  }

  static readonly object sendLock = new object();
  static void QueueSend(int idx){             // off the hook thread — sleeps must never stall the mouse
    if(idx < 0 || idx >= bindList.Count) return;
    Bind b = bindList[idx];
    ThreadPool.QueueUserWorkItem(delegate {
      try{
        lock(sendLock){
          if(b.action == ACT_ALTF4) SendAltF4();
          else if(b.action == ACT_SEQ) SendSequence(b);
          else SendGreekT();
        }
      }catch(Exception){}
    });
  }

  static IntPtr MouseCallback(int nCode, IntPtr wParam, IntPtr lParam){
    try{
      if(nCode >= 0){
        /* NO injected-event filter here, deliberately. We only ever SendInput with
           type = 1 (INPUT_KEYBOARD) — mouse input is never injected by this helper, so
           there is no feedback loop for such a filter to prevent. What it DID do was
           discard buttons that arrive flagged as injected, which is exactly how mouse
           software (G HUB, Synapse, OEM drivers) delivers remapped side buttons: the
           bind stored, the helper ran, the hook fired, and the event was dropped before
           anything looked at it. The keyboard hook keeps its filter, where we do inject
           and the loop is real. */
        {
          bool down;
          int btn = ButtonOf(wParam, lParam, out down);
          if(btn != 0){
            if(mode == 1 && down){
              try{ Console.Out.Write("BTN:" + CurMods() + "-" + btn + "\n"); Console.Out.Flush(); }catch(Exception){}
              PostThreadMessage(mainTid, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
              return (IntPtr)1;                  // swallow the press that was used to bind
            }
            if(mode == 2){
              int idx;
              if(down && binds.TryGetValue("m" + CurMods() + "-" + btn, out idx)){
                /* Remember the button, not the combination: a modifier may well be
                   released before the button is, and a release we fail to swallow
                   leaves the target seeing half a click. */
                swallowedBtn.Add(btn);
                PostThreadMessage(mainTid, WM_APP_SEND, (IntPtr)idx, IntPtr.Zero);
                return (IntPtr)1;
              }
              if(!down && swallowedBtn.Remove(btn)) return (IntPtr)1;
            }
          }
        }
      }
    }catch(Exception){}
    return CallNextHookEx(hook, nCode, wParam, lParam);
  }

  static IntPtr KeyCallback(int nCode, IntPtr wParam, IntPtr lParam){
    try{
      if(nCode >= 0){
        int msg = wParam.ToInt32();
        bool down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        bool up   = msg == WM_KEYUP   || msg == WM_SYSKEYUP;
        KBDLLHOOKSTRUCT k = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
        if((k.flags & LLKHF_INJECTED) == 0 && !IsModifierVk(k.vkCode)){
          if(mode == 1 && down){
            try{ Console.Out.Write("KEY:" + CurMods() + "-" + k.vkCode + "\n"); Console.Out.Flush(); }catch(Exception){}
            PostThreadMessage(mainTid, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
            return (IntPtr)1;
          }
          if(mode == 2){
            int idx;
            if(down && binds.TryGetValue("k" + CurMods() + "-" + k.vkCode, out idx)){
              swallowed.Add(k.vkCode);           // eat the matching KEYUP as well
              PostThreadMessage(mainTid, WM_APP_SEND, (IntPtr)idx, IntPtr.Zero);
              return (IntPtr)1;
            }
            if(up && swallowed.Remove(k.vkCode)) return (IntPtr)1;
          }
        }
      }
    }catch(Exception){}
    return CallNextHookEx(kbHook, nCode, wParam, lParam);
  }

  /* "m4=altf4", "m1-4=tau" (Ctrl + X1), "k3-84=tau", "m5=seq:13,13,39,13,13@120"
     Unparsable entries are skipped rather than fatal — one bad bind must never cost the
     user the others. A bare "m4" is the pre-1.15 form and means "no modifiers". */
  static void ParseBind(string spec){
    int eq = spec.IndexOf('=');
    if(eq <= 0 || eq == spec.Length - 1) return;
    string trigger = spec.Substring(0, eq).Trim();
    string action  = spec.Substring(eq + 1).Trim();

    Bind b = new Bind();
    if(action == "altf4") b.action = ACT_ALTF4;
    else if(action == "tau") b.action = ACT_TAU;
    else if(action.StartsWith("seq:")){
      b.action = ACT_SEQ;
      b.gap = 90;
      string body = action.Substring(4);
      int at = body.LastIndexOf('@');
      if(at >= 0){
        int g;
        if(int.TryParse(body.Substring(at + 1), out g) && g >= 0 && g <= 2000) b.gap = g;
        body = body.Substring(0, at);
      }
      /* Split(new char[]{','}), never Split(','). The single-char overload is
         String.Split(char, StringSplitOptions), which exists in Mono's BCL — the one
         this is cross-compiled against — but NOT in .NET Framework 4.x, which is what
         runs it on Windows. The JIT resolves every token in a method before executing
         it, so that one call made the whole of ParseBind throw MissingMethodException
         on its first invocation, killing the helper 53 ms in with exit 0xE0434352 —
         even though the seq: branch below was never taken. See build-check.sh. */
      string[] parts = body.Split(new char[]{','});
      List<ushort> keys = new List<ushort>();
      foreach(string part in parts){
        int vk;
        if(!int.TryParse(part.Trim(), out vk) || vk <= 0 || vk > 255) return;   // all or nothing
        keys.Add((ushort)vk);
      }
      if(keys.Count == 0 || keys.Count > 32) return;
      b.keys = keys.ToArray();
    }else return;

    string key = null;
    if(trigger.Length > 1 && trigger[0] == 'm'){
      int dash = trigger.IndexOf('-');
      int mods = 0, btn;
      if(dash > 0){
        if(!int.TryParse(trigger.Substring(1, dash - 1), out mods) || mods < 0 || mods > 15) return;
        if(!int.TryParse(trigger.Substring(dash + 1), out btn)) return;
      }else if(!int.TryParse(trigger.Substring(1), out btn)) return;
      if(btn < 3 || btn > 5) return;
      key = "m" + mods + "-" + btn;             // normalised, so "m4" and "m0-4" are one bind
    }else if(trigger.Length > 1 && trigger[0] == 'k'){
      int dash = trigger.IndexOf('-');
      if(dash <= 1) return;
      int mods, vk;
      if(!int.TryParse(trigger.Substring(1, dash - 1), out mods) || mods < 0 || mods > 15) return;
      if(!int.TryParse(trigger.Substring(dash + 1), out vk) || vk <= 0 || vk > 255) return;
      key = "k" + mods + "-" + vk;
    }else return;

    bindList.Add(b);
    binds[key] = bindList.Count - 1;
  }

  /* A helper that dies of an unhandled exception used to leave nothing behind but a
     numeric exit code — 0xE0434352, "a managed exception happened", which says only
     that something threw. It now writes the exception itself where the app can read
     it, so the shortcuts menu can name the fault instead of the category.

     Deliberately plain 4.0-era BCL: this file is cross-compiled on Linux against
     Mono's class library but RUNS on .NET Framework, and a member that exists only
     in the former throws exactly the failure this code is here to report. */
  static string CrashPath(){
    try{
      string b = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
      if(b == null || b.Length == 0) return null;
      return System.IO.Path.Combine(System.IO.Path.Combine(b, "RecCheck"), "rc-tbind-crash.txt");
    }catch(Exception){ return null; }
  }
  static void WriteCrash(string where, Exception e){
    try{
      string p = CrashPath();
      if(p == null) return;
      System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(p));
      System.IO.File.WriteAllText(p,
        VER + " " + where + " " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\r\n" +
        (e == null ? "(no exception object)" : e.ToString()) + "\r\n");
    }catch(Exception){}
  }
  /* Cleared on every successful start, so what the app reads is always this run's. */
  static void ClearCrash(){
    try{ string p = CrashPath(); if(p != null) System.IO.File.Delete(p); }catch(Exception){}
  }

  const string VER = "v7";

  static int Main(string[] args){
    int parentPid;
    if(args.Length >= 1 && args[0] == "ping"){
      /* Reached only if the file exists, is allowed to execute and the runtime is
         present. Anything that stops those says so by this line never arriving. */
      try{ Console.Out.Write("RCTBIND OK " + VER + "\n"); Console.Out.Flush(); }catch(Exception){}
      return 0;
    }
    if(args.Length >= 2 && args[0] == "detect"){
      mode = 1;
      if(!int.TryParse(args[1], out parentPid)) return 2;
    }else if(args.Length >= 2 && args[0] == "diag"){
      /* Run the real shortcut against whatever the user brings to the foreground and
         print every step. No hooks are installed; this only observes and reports. */
      if(!int.TryParse(args[1], out parentPid)) return 2;
      int wait = 5000;
      if(args.Length >= 3) int.TryParse(args[2], out wait);
      DIAG = new StringBuilder();
      D("rc-tbind " + VER + " diagnostic");
      D("waited " + wait + " ms for you to bring the target window forward");
      Thread.Sleep(wait);
      try{ SendGreekT(); }catch(Exception e){ D("  EXCEPTION: " + e.Message); }
      D("");
      D("If the hop failed above, the layout request is being refused by that window.");
      try{ Console.Out.Write(DIAG.ToString()); Console.Out.Flush(); }catch(Exception){}
      return 0;
    }else if(args.Length >= 3 && args[0] == "bind"){
      mode = 2;
      if(!int.TryParse(args[1], out parentPid)) return 2;
      for(int i = 2; i < args.Length; i++) ParseBind(args[i]);
      if(binds.Count == 0) return 2;
    }else return 2;

    ClearCrash();
    try{
      AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs ue){
        WriteCrash("unhandled", ue.ExceptionObject as Exception);
      };
    }catch(Exception){}

    try{
      return Run(parentPid);
    }catch(Exception e){
      WriteCrash("main", e);
      return 5;                                // "it crashed", with the reason on disk
    }
  }

  static int Run(int parentPid){
    mainTid = GetCurrentThreadId();

    watchdog = new Thread(delegate(){          // independent of the message loop by design
      for(;;){
        Thread.Sleep(2000);
        try{
          Process p = Process.GetProcessById(parentPid);
          if(p.HasExited) Environment.Exit(0);
        }catch(Exception){ Environment.Exit(0); }
      }
    });
    watchdog.IsBackground = true;
    watchdog.Start();

    IntPtr mod = GetModuleHandle(null);
    keepMouse = MouseCallback;
    keepKeys  = KeyCallback;
    hook = SetWindowsHookEx(WH_MOUSE_LL, keepMouse, mod, 0);
    // the keyboard hook is only worth installing when something actually needs it
    bool wantKeys = mode == 1;
    foreach(string key in binds.Keys) if(key.Length > 0 && key[0] == 'k') wantKeys = true;
    if(wantKeys) kbHook = SetWindowsHookEx(WH_KEYBOARD_LL, keepKeys, mod, 0);
    if(hook == IntPtr.Zero && kbHook == IntPtr.Zero) return 3;

    MSG msg;
    while(GetMessage(out msg, IntPtr.Zero, 0, 0) > 0){
      /* One bad message must not cost the user their shortcuts for the rest of the
         night. Record it and keep pumping. */
      try{
        if(msg.message == WM_APP_SEND){ QueueSend(msg.wParam.ToInt32()); continue; }
        TranslateMessage(ref msg);
        DispatchMessage(ref msg);
      }catch(Exception e){ WriteCrash("loop", e); }
    }
    if(hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
    if(kbHook != IntPtr.Zero) UnhookWindowsHookEx(kbHook);
    return 0;
  }
}
