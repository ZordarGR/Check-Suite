// rc-tbind — RecCheck helper: bind mouse buttons or keyboard combos to protel shortcuts.
//   rc-tbind.exe detect <parentPid>
//       -> waits for a middle/X1/X2 press or a key combo, prints "BTN:<code>"
//          or "KEY:<mods>-<vk>", exits
//   rc-tbind.exe bind <parentPid> <trigger>=<action> [<trigger>=<action> ...]
//       -> swallows each trigger system-wide and performs its action instead
//
// Triggers: m3 = middle, m4 = X1 (Back), m5 = X2 (Forward)
//           k<mods>-<vk>   mods bitmask: 1 = Ctrl, 2 = Alt, 4 = Shift, 8 = Win
// Actions:  tau   = a real Greek τ keypress (verified layout hop)
//           altf4 = a real Alt+F4 (closes the focused window)
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
using System.Threading;

static class TBind {
  const int WH_MOUSE_LL    = 14, WH_KEYBOARD_LL = 13;
  const int WM_MBUTTONDOWN = 0x0207, WM_MBUTTONUP = 0x0208;
  const int WM_XBUTTONDOWN = 0x020B, WM_XBUTTONUP = 0x020C;
  const int WM_KEYDOWN     = 0x0100, WM_KEYUP = 0x0101;
  const int WM_SYSKEYDOWN  = 0x0104, WM_SYSKEYUP = 0x0105;
  const uint WM_QUIT       = 0x0012;
  const uint WM_APP_SEND   = 0x8000 + 1;
  const uint KEYEVENTF_UNICODE = 0x0004, KEYEVENTF_KEYUP = 0x0002;
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

  const int ACT_TAU = 1, ACT_ALTF4 = 2;

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

  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
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
  static readonly Dictionary<string, int> binds = new Dictionary<string, int>();
  static readonly HashSet<uint> swallowed = new HashSet<uint>();   // keys whose KEYUP we must eat too

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

  static IntPtr grkCached = IntPtr.Zero;
  static IntPtr GreekHKL(){
    if(grkCached == IntPtr.Zero){
      try{ grkCached = LoadKeyboardLayout("00000408", KLF_ACTIVATE); }catch(Exception){}
    }
    return grkCached;
  }

  /* switch the target thread's layout and return only when it has actually changed */
  static bool HopTo(IntPtr fg, uint tid, IntPtr hkl, bool attached){
    IntPtr res;
    if(SendMessageTimeout(fg, WM_INPUTLANGCHANGEREQUEST, IntPtr.Zero, hkl, SMTO_ABORTIFHUNG, 80, out res) != IntPtr.Zero
       && GetKeyboardLayout(tid) == hkl) return true;
    if(attached){
      ActivateKeyboardLayout(hkl, 0);
      if(GetKeyboardLayout(tid) == hkl) return true;
    }
    PostMessage(fg, WM_INPUTLANGCHANGEREQUEST, IntPtr.Zero, hkl);   // old v2 path, last resort
    for(int i = 0; i < 9; i++){
      Thread.Sleep(10);
      if(GetKeyboardLayout(tid) == hkl) return true;
    }
    return false;
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
    if(fg == IntPtr.Zero){ PressTau(); return; }
    uint pid;
    uint tid = GetWindowThreadProcessId(fg, out pid);
    // tid 0 would make GetKeyboardLayout report OUR thread — already Greek from
    // LoadKeyboardLayout(KLF_ACTIVATE) — and every hop check would pass bogusly.
    if(tid == 0){ PressTau(); return; }
    IntPtr cur = GetKeyboardLayout(tid);
    ushort sc = (ushort)MapVirtualKey(VK_T, 0);
    if(((long)cur & 0xFFFF) == GREEK){ PressKeys(VK_T, sc, 0); return; }
    IntPtr grk = GreekHKL();
    if(grk == IntPtr.Zero){ PressTau(); return; }        // no Greek layout installed
    bool attached = AttachThreadInput(GetCurrentThreadId(), tid, true);
    bool hopped = false;
    try{
      if(!HopTo(fg, tid, grk, attached)){ PressTau(); return; }   // app refuses to hop
      hopped = true;
      PressKeys(VK_T, sc, 0);
      WaitKeyDrained(attached);
    }finally{
      // the restore must survive an exception on the press — otherwise the user is
      // left typing Greek in every application until they notice and switch back
      if(hopped && cur != IntPtr.Zero){
        try{ HopTo(fg, tid, cur, attached); }catch(Exception){}
      }
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

  static readonly object sendLock = new object();
  static void QueueSend(int action){          // off the hook thread — sleeps must never stall the mouse
    ThreadPool.QueueUserWorkItem(delegate {
      try{
        lock(sendLock){
          if(action == ACT_ALTF4) SendAltF4();
          else SendGreekT();
        }
      }catch(Exception){}
    });
  }

  static IntPtr MouseCallback(int nCode, IntPtr wParam, IntPtr lParam){
    try{
      if(nCode >= 0){
        MSLLHOOKSTRUCT info = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
        if((info.flags & LLMHF_INJECTED) == 0){          // never react to our own output
          bool down;
          int btn = ButtonOf(wParam, lParam, out down);
          if(btn != 0){
            if(mode == 1 && down){
              try{ Console.Out.Write("BTN:" + btn + "\n"); Console.Out.Flush(); }catch(Exception){}
              PostThreadMessage(mainTid, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
              return (IntPtr)1;                  // swallow the press that was used to bind
            }
            int action;
            if(mode == 2 && binds.TryGetValue("m" + btn, out action)){
              if(down) PostThreadMessage(mainTid, WM_APP_SEND, (IntPtr)action, IntPtr.Zero);
              return (IntPtr)1;                  // swallow both down and up of the bound button
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
            int action;
            if(down && binds.TryGetValue("k" + CurMods() + "-" + k.vkCode, out action)){
              swallowed.Add(k.vkCode);           // eat the matching KEYUP as well
              PostThreadMessage(mainTid, WM_APP_SEND, (IntPtr)action, IntPtr.Zero);
              return (IntPtr)1;
            }
            if(up && swallowed.Remove(k.vkCode)) return (IntPtr)1;
          }
        }
      }
    }catch(Exception){}
    return CallNextHookEx(kbHook, nCode, wParam, lParam);
  }

  /* "m4=altf4" / "k3-84=tau" — unparsable entries are skipped, never fatal */
  static void ParseBind(string spec){
    int eq = spec.IndexOf('=');
    if(eq <= 0 || eq == spec.Length - 1) return;
    string trigger = spec.Substring(0, eq).Trim();
    string action  = spec.Substring(eq + 1).Trim();
    int act = action == "altf4" ? ACT_ALTF4 : action == "tau" ? ACT_TAU : 0;
    if(act == 0) return;
    if(trigger.Length > 1 && trigger[0] == 'm'){
      int btn;
      if(!int.TryParse(trigger.Substring(1), out btn) || btn < 3 || btn > 5) return;
      binds["m" + btn] = act;
      return;
    }
    if(trigger.Length > 1 && trigger[0] == 'k'){
      int dash = trigger.IndexOf('-');
      if(dash <= 1) return;
      int mods, vk;
      if(!int.TryParse(trigger.Substring(1, dash - 1), out mods) || mods < 0 || mods > 15) return;
      if(!int.TryParse(trigger.Substring(dash + 1), out vk) || vk <= 0 || vk > 255) return;
      binds["k" + mods + "-" + vk] = act;
    }
  }

  static int Main(string[] args){
    int parentPid;
    if(args.Length >= 2 && args[0] == "detect"){
      mode = 1;
      if(!int.TryParse(args[1], out parentPid)) return 2;
    }else if(args.Length >= 3 && args[0] == "bind"){
      mode = 2;
      if(!int.TryParse(args[1], out parentPid)) return 2;
      for(int i = 2; i < args.Length; i++) ParseBind(args[i]);
      if(binds.Count == 0) return 2;
    }else return 2;

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
      if(msg.message == WM_APP_SEND){ QueueSend(msg.wParam.ToInt32()); continue; }
      TranslateMessage(ref msg);
      DispatchMessage(ref msg);
    }
    if(hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
    if(kbHook != IntPtr.Zero) UnhookWindowsHookEx(kbHook);
    return 0;
  }
}
