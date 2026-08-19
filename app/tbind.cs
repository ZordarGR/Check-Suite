// rc-tbind — RecCheck helper: bind a mouse button to typing the Greek letter τ.
// Modes:
//   rc-tbind.exe detect <parentPid>      -> waits for middle/X1/X2 press, prints "BTN:<code>", exits
//   rc-tbind.exe bind <code> <parentPid> -> swallows that button system-wide and types τ instead
// Codes: 3 = middle, 4 = X1 (Back), 5 = X2 (Forward). Left/right are never bindable.
// The helper exits by itself when the parent process (RecCheck) is gone.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;

static class TBind {
  const int WH_MOUSE_LL   = 14;
  const int WM_MBUTTONDOWN = 0x0207, WM_MBUTTONUP = 0x0208;
  const int WM_XBUTTONDOWN = 0x020B, WM_XBUTTONUP = 0x020C;
  const uint KEYEVENTF_UNICODE = 0x0004, KEYEVENTF_KEYUP = 0x0002;
  const char TAU = 'τ';

  delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hk);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);

  [StructLayout(LayoutKind.Sequential)]
  struct MSLLHOOKSTRUCT { public int x, y; public uint mouseData, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)]
  struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)]
  struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)]
  struct INPUT { public uint type; public InputUnion u; }

  static HookProc keepAlive;             // prevents the delegate from being garbage-collected
  static IntPtr hook = IntPtr.Zero;
  static int mode = 0;                   // 1 = detect, 2 = bind
  static int boundBtn = 0;

  static int ButtonOf(IntPtr wParam, IntPtr lParam, out bool down){
    int msg = (int)wParam;
    down = msg == WM_MBUTTONDOWN || msg == WM_XBUTTONDOWN;
    if(msg == WM_MBUTTONDOWN || msg == WM_MBUTTONUP) return 3;
    if(msg == WM_XBUTTONDOWN || msg == WM_XBUTTONUP){
      var info = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
      int x = (int)(info.mouseData >> 16) & 0xFFFF;
      return x == 2 ? 5 : 4;
    }
    return 0;
  }

  static void SendTau(){
    var inputs = new INPUT[2];
    inputs[0].type = 1; // INPUT_KEYBOARD
    inputs[0].u.ki = new KEYBDINPUT { wVk = 0, wScan = (ushort)TAU, dwFlags = KEYEVENTF_UNICODE, time = 0, dwExtraInfo = IntPtr.Zero };
    inputs[1].type = 1;
    inputs[1].u.ki = new KEYBDINPUT { wVk = 0, wScan = (ushort)TAU, dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time = 0, dwExtraInfo = IntPtr.Zero };
    SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
  }

  static IntPtr Callback(int nCode, IntPtr wParam, IntPtr lParam){
    if(nCode >= 0){
      bool down;
      int btn = ButtonOf(wParam, lParam, out down);
      if(btn != 0){
        if(mode == 1 && down){
          Console.Out.Write("BTN:" + btn + "\n");
          Console.Out.Flush();
          Application.Exit();
          return (IntPtr)1;                      // swallow the press that was used to bind
        }
        if(mode == 2 && btn == boundBtn){
          if(down) SendTau();
          return (IntPtr)1;                      // swallow both down and up of the bound button
        }
      }
    }
    return CallNextHookEx(hook, nCode, wParam, lParam);
  }

  static void WatchParent(int pid){
    var t = new Timer();
    t.Interval = 4000;
    t.Tick += delegate {
      try{ Process.GetProcessById(pid); }
      catch{ Application.Exit(); }
    };
    t.Start();
  }

  [STAThread]
  static int Main(string[] args){
    if(args.Length < 2) return 2;
    int parentPid;
    if(args[0] == "detect"){
      mode = 1;
      if(!int.TryParse(args[1], out parentPid)) return 2;
    }else if(args[0] == "bind" && args.Length >= 3){
      mode = 2;
      if(!int.TryParse(args[1], out boundBtn) || !int.TryParse(args[2], out parentPid)) return 2;
      if(boundBtn < 3 || boundBtn > 5) return 2;
    }else return 2;

    keepAlive = Callback;
    hook = SetWindowsHookEx(WH_MOUSE_LL, keepAlive, GetModuleHandle(null), 0);
    if(hook == IntPtr.Zero) return 3;
    WatchParent(parentPid);
    Application.Run();
    UnhookWindowsHookEx(hook);
    return 0;
  }
}
