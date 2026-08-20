// rc-tbind — RecCheck helper: bind a mouse button to typing the Greek letter τ.
//   rc-tbind.exe detect <parentPid>      -> waits for middle/X1/X2 press, prints "BTN:<code>", exits
//   rc-tbind.exe bind <code> <parentPid> -> swallows that button system-wide and types τ instead
// Codes: 3 = middle, 4 = X1 (Back), 5 = X2 (Forward). Left/right are never bindable.
//
// Design notes (v2 — the v1 pump could stall and throttle the whole desktop's mouse):
//   * raw Win32 GetMessage loop — no frameworks, nothing else runs on the hook thread
//   * the hook callback ONLY classifies and returns; the actual SendInput happens on the
//     message loop via PostThreadMessage, never inside the hook
//   * the parent watchdog is an independent thread that hard-exits the process,
//     so the helper dies with RecCheck even if the loop is somehow wedged
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

static class TBind {
  const int WH_MOUSE_LL    = 14;
  const int WM_MBUTTONDOWN = 0x0207, WM_MBUTTONUP = 0x0208;
  const int WM_XBUTTONDOWN = 0x020B, WM_XBUTTONUP = 0x020C;
  const uint WM_QUIT       = 0x0012;
  const uint WM_APP_SEND   = 0x8000 + 1;
  const uint KEYEVENTF_UNICODE = 0x0004, KEYEVENTF_KEYUP = 0x0002;
  const uint WM_INPUTLANGCHANGEREQUEST = 0x0050;
  const uint KLF_ACTIVATE = 1;
  const ushort VK_T = 0x54;
  const char TAU = 'τ';

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
  [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);

  [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }
  [StructLayout(LayoutKind.Sequential)] struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }

  static HookProc keepAlive;           // prevents the delegate from being garbage-collected
  static IntPtr hook = IntPtr.Zero;
  static int mode = 0;                 // 1 = detect, 2 = bind
  static int boundBtn = 0;
  static uint mainTid = 0;
  static Thread watchdog;              // static ref so it can never be collected

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

  static void PressKeys(ushort vk, ushort scan, uint flags){
    var inputs = new INPUT[2];
    inputs[0].type = 1; // INPUT_KEYBOARD
    inputs[0].u.ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags, time = 0, dwExtraInfo = IntPtr.Zero };
    inputs[1].type = 1;
    inputs[1].u.ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags | KEYEVENTF_KEYUP, time = 0, dwExtraInfo = IntPtr.Zero };
    SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
  }
  /* a real press of the T KEY under the GREEK layout — protel and friends see a genuine
     keystroke (WM_KEYDOWN VK_T + WM_CHAR 'τ'), not a pasted character. If the foreground
     window is on another layout, hop it to Greek for the press and hop it right back. */
  static void SendGreekT(){
    IntPtr fg = GetForegroundWindow();
    IntPtr cur = IntPtr.Zero;
    if(fg != IntPtr.Zero){
      uint pid;
      cur = GetKeyboardLayout(GetWindowThreadProcessId(fg, out pid));
    }
    bool isGreek = ((long)cur & 0xFFFF) == 0x0408;
    ushort sc = (ushort)MapVirtualKey(VK_T, 0);
    if(isGreek){ PressKeys(VK_T, sc, 0); return; }
    IntPtr grk = IntPtr.Zero;
    try{ grk = LoadKeyboardLayout("00000408", KLF_ACTIVATE); }catch(Exception){}
    if(fg == IntPtr.Zero || grk == IntPtr.Zero){
      PressKeys(0, (ushort)TAU, KEYEVENTF_UNICODE);       // no Greek layout installed — type τ as text
      return;
    }
    PostMessage(fg, WM_INPUTLANGCHANGEREQUEST, IntPtr.Zero, grk);
    Thread.Sleep(90);                                      // let the app process the layout switch
    PressKeys(VK_T, sc, 0);
    if(cur != IntPtr.Zero){
      Thread.Sleep(90);
      PostMessage(fg, WM_INPUTLANGCHANGEREQUEST, IntPtr.Zero, cur);   // put the user's layout back
    }
  }
  static readonly object sendLock = new object();
  static void QueueSend(){                                 // off the hook thread — sleeps must never stall the mouse
    ThreadPool.QueueUserWorkItem(delegate {
      try{ lock(sendLock){ SendGreekT(); } }catch(Exception){}
    });
  }

  static IntPtr Callback(int nCode, IntPtr wParam, IntPtr lParam){
    try{
      if(nCode >= 0){
        bool down;
        int btn = ButtonOf(wParam, lParam, out down);
        if(btn != 0){
          if(mode == 1 && down){
            try{ Console.Out.Write("BTN:" + btn + "\n"); Console.Out.Flush(); }catch(Exception){}
            PostThreadMessage(mainTid, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
            return (IntPtr)1;                    // swallow the press that was used to bind
          }
          if(mode == 2 && btn == boundBtn){
            if(down) PostThreadMessage(mainTid, WM_APP_SEND, IntPtr.Zero, IntPtr.Zero);
            return (IntPtr)1;                    // swallow both down and up of the bound button
          }
        }
      }
    }catch(Exception){}
    return CallNextHookEx(hook, nCode, wParam, lParam);
  }

  static int Main(string[] args){
    int parentPid;
    if(args.Length >= 2 && args[0] == "detect"){
      mode = 1;
      if(!int.TryParse(args[1], out parentPid)) return 2;
    }else if(args.Length >= 3 && args[0] == "bind"){
      mode = 2;
      if(!int.TryParse(args[1], out boundBtn) || !int.TryParse(args[2], out parentPid)) return 2;
      if(boundBtn < 3 || boundBtn > 5) return 2;
    }else return 2;

    mainTid = GetCurrentThreadId();

    watchdog = new Thread(delegate(){          // independent of the message loop by design
      for(;;){
        Thread.Sleep(2000);
        try{
          var p = Process.GetProcessById(parentPid);
          if(p.HasExited) Environment.Exit(0);
        }catch(Exception){ Environment.Exit(0); }
      }
    });
    watchdog.IsBackground = true;
    watchdog.Start();

    keepAlive = Callback;
    hook = SetWindowsHookEx(WH_MOUSE_LL, keepAlive, GetModuleHandle(null), 0);
    if(hook == IntPtr.Zero) return 3;

    MSG msg;
    while(GetMessage(out msg, IntPtr.Zero, 0, 0) > 0){
      if(msg.message == WM_APP_SEND){ QueueSend(); continue; }
      TranslateMessage(ref msg);
      DispatchMessage(ref msg);
    }
    UnhookWindowsHookEx(hook);
    return 0;
  }
}
