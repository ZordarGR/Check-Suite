// rc-tbind — RecCheck helper: bind mouse buttons or keyboard combos to protel shortcuts.
//   rc-tbind.exe detect <parentPid>
//       -> waits for a middle/X1/X2 press or a key combo, prints "BTN:<code>"
//          or "KEY:<mods>-<vk>", exits
//   rc-tbind.exe run
//       -> THE STANDALONE. Starts at Windows login, owes RecCheck nothing, and never
//          exits because RecCheck closed. It does two unrelated jobs:
//
//          CAPS LOCK, ALWAYS. This keyboard has no Caps Lock light and the PC draws no
//          OSD, so the state flips silently mid-passport. The keyboard hook is always
//          installed and always draws the indicator, RecCheck running or not.
//
//          PROTEL SHORTCUTS, ONLY ALONGSIDE RECCHECK. The bindings live in a file
//          RecCheck writes (see BindsPath). The MOUSE hook is installed only while
//          RecCheck.exe is actually running and taken back out the moment it is not, so
//          a machine with RecCheck closed carries no mouse hook at all -- exactly the
//          scope it had when RecCheck spawned this as a child. Keyboard triggers are
//          gated the same way, by an explicit check, because that hook stays up for the
//          Caps Lock job.
//
//          With focus=<needle> in the binds file a trigger only fires while the window
//          in front matches that needle on its process name, class or title; anywhere
//          else the press is passed through untouched, so the button stays a button. A
//          window we cannot read anything about is allowed: the gate never blocks what
//          it cannot see.
//   rc-tbind.exe scan <parentPid> [delayMs]
//       -> waits, then prints the control tree of whatever window is in front: class,
//          control id, size, caption, and for list controls the row count INCLUDING rows
//          scrolled out of sight. READ-ONLY in the strict sense: every message is a
//          getter, nothing is written, and protel's state is identical afterwards. It is
//          not zero-touch — asking a control a question makes code run in protel's UI
//          thread — so it reports its own cost at the end, and it runs only when asked.
//   rc-tbind.exe install / uninstall / stop / status
//       -> add or remove the login entry (HKCU Run: no admin, nothing installed), and
//          report "RCTBIND <on|off> <running|stopped> <version>"
//   rc-tbind.exe fg <parentPid> [delayMs]
//       -> waits, then prints "FG<tab>exe<tab>class<tab>title" for whatever is in front,
//          so the gate can be pointed at the real protel window instead of a guess
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
//           altn           = a real Alt+N (protel's "new" when entering a passport)
//           tau:<ms>       = the same, then Enter <ms> after the layout is back
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
// Design notes (v10 — it stands on its own):
//   * ONE background process, one hook per job, one login entry. A second program for
//     the Caps Lock icon would have meant a second keyboard hook on the machine.
//   * the mouse hook's lifetime still matches RecCheck's, so nothing about what sits in
//     protel's mouse path changed when this became a login program
//   * the drawing is raw gdi32 by hand -- no WinForms, no System.Drawing. Mono's class
//     library is larger than .NET Framework 4.8's and a member that exists only in Mono
//     compiles here and kills the method on first call there. P/Invoke carries no such
//     risk. See build-check.py.
//   * the hook callbacks still only classify and post; the drawing happens on the
//     message loop. A hook that draws is a hook that can wedge the desktop.
//
// Design notes (v8 — the shortcuts belong to protel):
//   * the focus check runs on the hook thread, so it is cached per window handle and
//     the process lookup happens once per window rather than once per press
//   * a blocked trigger is reported to the message loop and written to the press log
//     from there, one line per window: the hook thread never touches the disk
//   * blocking must be invisible — nothing is swallowed, so the DOWN and the UP both
//     reach the application under the cursor exactly as they would with no helper
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
using Microsoft.Win32;

static class TBind {
  const int WH_MOUSE_LL    = 14, WH_KEYBOARD_LL = 13;
  const int WM_MBUTTONDOWN = 0x0207, WM_MBUTTONUP = 0x0208;
  const int WM_XBUTTONDOWN = 0x020B, WM_XBUTTONUP = 0x020C;
  const int WM_KEYDOWN     = 0x0100, WM_KEYUP = 0x0101;
  const int WM_SYSKEYDOWN  = 0x0104, WM_SYSKEYUP = 0x0105;
  const uint WM_QUIT       = 0x0012;
  const uint WM_APP_SEND   = 0x8000 + 1;
  const uint WM_APP_BLOCK  = 0x8000 + 2;
  const uint WM_APP_CAPS   = 0x8000 + 3;   // Caps Lock changed; the loop draws it
  const uint WM_APP_HOST   = 0x8000 + 4;   // RecCheck came up or went away
  const uint WM_APP_BINDS  = 0x8000 + 5;   // the binds file changed; re-read it
  /* ---- the zero-touch half of the live protel read (v13) ----
     SetWinEventHook with WINEVENT_OUTOFCONTEXT: the callback runs in THIS process and
     Windows marshals the events to us. Nothing is injected into protel, no message is
     sent to it, and protel does not run a line of our code.

     Both reads in the callback are message-free as well. GetClassName answers from the
     window class, kernel side. GetWindowText on a TOP-LEVEL window belonging to another
     process returns the caption Windows already has cached and does NOT send WM_GETTEXT
     — which is only true for top-level windows, and is the reason this refuses anything
     with an ancestor. So this half costs protel literally nothing, which is why it is
     the half being built first.

     It runs on its OWN THREAD with its own message pump, never the loop thread. A
     low-level hook callback that is late gets its hook torn down by Windows, and the
     loop thread is where the mouse and keyboard hooks live — protel's shortcuts are the
     critical half of this program and nothing here may be able to delay them. */
  const uint EVENT_OBJECT_SHOW      = 0x8002;
  const uint EVENT_OBJECT_HIDE      = 0x8003;
  const uint WINEVENT_OUTOFCONTEXT  = 0x0000;
  const uint WINEVENT_SKIPOWNPROCESS= 0x0002;
  const int  OBJID_WINDOW           = 0;
  const uint GA_ROOT                = 2;
  const uint GW_HWNDNEXT            = 2;
  const uint GW_CHILD               = 5;
  const uint PM_REMOVE              = 1;
  const int  WATCH_MAX              = 4000;   // one shift of windows, with room to spare
  const uint EVENT_OBJECT_NAMECHANGE= 0x800C;   // a window's caption changed
  /* MDI puts the MAXIMISED child's title into the FRAME's caption:
     "… protel Hotel Management Suite 2024 - [Departure Report for 02/09/26]". The frame is
     top-level, so reading that caption costs protel nothing — which makes a name change on
     it the free way to know which report he just opened, and on which date. */

  /* ---- reading a list's rows (v21) ----
     LVM_GETITEMTEXT fills a caller-supplied buffer, and for a control in ANOTHER process
     that buffer has to live in that process — hence OpenProcess/VirtualAllocEx/Write/Read.
     This is the part that is NOT free, and it is why the probe reports its own cost.

     It was nearly built on MSAA instead, which allocates nothing in protel. That was
     rejected after trying it: Mono here ships no Accessibility.dll, so IAccessible would
     have to be hand-declared as a COM vtable that cannot be tested anywhere in this
     container — and a slot declared one position out does not fail, it calls a DIFFERENT
     method on protel. accSelect and accDoDefaultAction are in that vtable. Every call
     below is a documented getter with a signature the compiler checks; the worst a
     mistake here can do is read nothing. */
  const uint LVM_GETITEMTEXTW = 0x1073, LVM_GETITEMTEXTA = 0x102D, LVM_GETHEADER = 0x101F;
  const uint HDM_GETITEMCOUNT = 0x1200;
  const uint PROCESS_VM_OPERATION = 0x0008, PROCESS_VM_READ = 0x0010, PROCESS_VM_WRITE = 0x0020;
  /* IsWow64Process REQUIRES a query right on the handle. Without it the call fails, and a
     failed call that nobody checks decides protel's bitness by accident. */
  const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
  const uint MEM_COMMIT = 0x1000, MEM_RESERVE = 0x2000, MEM_RELEASE = 0x8000, PAGE_READWRITE = 0x04;
  /* Stop reading well before RecCheck would give up on the helper and kill it. A kill
     cannot be caught, and the scratch pages would stay in protel until protel closes. */
  const int READ_BUDGET_MS = 5000;
  const uint KEYEVENTF_UNICODE = 0x0004, KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_EXTENDEDKEY = 0x0001;
  const uint WM_INPUTLANGCHANGEREQUEST = 0x0050;
  const uint KLF_ACTIVATE = 1;
  const uint SMTO_ABORTIFHUNG = 0x0002;
  const uint QS_KEY = 0x0001;
  const uint LLMHF_INJECTED = 0x0001, LLKHF_INJECTED = 0x0010;
  const ushort VK_T = 0x54, VK_F4 = 0x73, VK_RETURN = 0x0D, VK_N = 0x4E;
  const int VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12;
  const int VK_LWIN = 0x5B, VK_RWIN = 0x5C;
  const int VK_CAPITAL = 0x14;
  const uint WM_GETTEXT = 0x000D, WM_GETTEXTLENGTH = 0x000E;
  const uint LVM_GETITEMCOUNT = 0x1004, LB_GETCOUNT = 0x018B, CB_GETCOUNT = 0x0146, TVM_GETCOUNT = 0x1105;

  /* ---- the Caps Lock indicator's window ---- */
  const string CAPS_CLASS = "RcTbindCapsWnd";
  const string RUNK = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  const string RUNV = "RecCheckHelper";
  const uint WS_POPUP = 0x80000000;
  const uint WS_EX_LAYERED = 0x00080000, WS_EX_TRANSPARENT = 0x00000020;
  const uint WS_EX_TOPMOST = 0x00000008, WS_EX_TOOLWINDOW = 0x00000080;
  const uint WS_EX_NOACTIVATE = 0x08000000;
  const uint LWA_COLORKEY = 0x00000001, LWA_ALPHA = 0x00000002;
  const uint SWP_NOACTIVATE = 0x0010, SWP_SHOWWINDOW = 0x0040;
  const uint WM_DESTROY = 0x0002, WM_PAINT = 0x000F, WM_TIMER = 0x0113, WM_CLOSE = 0x0010;
  const int  SW_HIDE = 0, SM_CXSCREEN = 0, SM_CYSCREEN = 1;
  const uint PS_GEOMETRIC = 0x00010000, PS_SOLID = 0, BS_SOLID = 0;
  const int  ALTERNATE = 1, NULL_PEN = 8;
  const int  NULL_BRUSH_ = 5;                    // GDI stock object, hollow fill
  const uint PS_ENDCAP_ROUND_ = 0x00000000;      // the default cap; named for what it is
  const int  CAPS_W = 170, CAPS_H = 170;
  /* The installation overlay. Its palette is the update button's own, so the two read as
     one thing: #101d33 behind, #2f5f9e for the ring it travels on, and the glow #286edc
     for the arc itself. COLORREF is 0x00BBGGRR, hence the reversed bytes. */
  const string SPLASH_CLASS = "RcTbindSplashWnd";
  const int  SPLASH_W = 260, SPLASH_H = 260;
  const int  SPLASH_CX = 130, SPLASH_CY = 130;   // centre of that window
  const int  SPLASH_R  = 96;                     // ring radius
  const int  SPLASH_PEN = 12;                    // ring thickness
  const int  SPLASH_DX = 45, SPLASH_DY = 49;     // moves the 170-wide glyph to the centre
  const uint SPLASH_BACK  = 0x00331D10;          // #101d33
  const uint SPLASH_TRACK = 0x009E5F2F;          // #2f5f9e
  const uint SPLASH_ARC   = 0x00DC6E28;          // #286edc
  const int  SPLASH_STEP_MS = 40;                // one frame
  const int  SPLASH_SWEEP = 70;                  // degrees of arc that travel
  const int  AD_CLOCKWISE = 2;
  const uint IMAGE_ICON = 1, LR_DEFAULTCOLOR = 0, DI_NORMAL = 3;
  const int  SPLASH_ICON = 120;                  // fits inside the ring, corner to corner
  const byte CAPS_ALPHA = 89;               // 35% of 255, the spec
  const uint CAPS_KEY   = 0x00FF00FF;       // colour-keyed away; never drawn by the glyph
  const uint CAPS_DARK  = 0x00161210;       // COLORREF is 0x00BBGGRR -> #101216
  const uint CAPS_WHITE = 0x00FFFFFF;
  const uint CAPS_HOLD_MS = 1500, CAPS_FADE_MS = 40;

  /* Measured on his machine, 02/09: a tau press cost 922-1656 ms, of which the Enter gap
     he had been tuning was 10-20 ms. These three numbers are where the time actually
     went. Do NOT reorder Win+Space behind SendMessageTimeout to chase more — v7 put it
     first because asking protel directly failed, and that ordering is a fix. */
  const int ARRIVE_MS = 30;                  // was 150, and it observed nothing in 6 of 6
  const int HOP_MS = 5, HOP_TICKS = 40;      // was 20 x 10 — the same 200 ms window
  const char TAU = 'τ';
  const long GREEK = 0x0408;

  const int ACT_TAU = 1, ACT_ALTF4 = 2, ACT_SEQ = 3, ACT_ALTN = 4;

  delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc fn, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hk);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);
  [DllImport("user32.dll")] static extern bool PeekMessage(out MSG msg, IntPtr hWnd, uint min, uint max, uint remove);
  delegate void WinEventProc(IntPtr hHook, uint ev, IntPtr hwnd, int idObject, int idChild, uint tid, uint time);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr mod, WinEventProc fn, uint pid, uint tid, uint flags);
  [DllImport("user32.dll")] static extern bool UnhookWinEvent(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr VirtualAllocEx(IntPtr proc, IntPtr addr, UIntPtr size, uint type, uint protect);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool VirtualFreeEx(IntPtr proc, IntPtr addr, UIntPtr size, uint type);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool WriteProcessMemory(IntPtr proc, IntPtr addr, byte[] buf, UIntPtr n, out UIntPtr wrote);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadProcessMemory(IntPtr proc, IntPtr addr, byte[] buf, UIntPtr n, out UIntPtr read);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsWow64Process(IntPtr proc, out bool wow64);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
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
  [DllImport("user32.dll")] static extern short GetKeyState(int vk);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc fn, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hWnd, EnumProc fn, IntPtr lParam);
  [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr hWnd);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr hWnd);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "SendMessageTimeoutW")]
  static extern IntPtr SendMessageTimeoutText(IntPtr hWnd, uint msg, IntPtr wParam, StringBuilder lParam,
                                              uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern ushort RegisterClassEx(ref WNDCLASSEX c);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern IntPtr CreateWindowEx(uint exStyle, string cls, string name, uint style,
                                      int x, int y, int w, int h,
                                      IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr DefWindowProc(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string name);
  [DllImport("user32.dll")] static extern void PostQuitMessage(int code);
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr h, uint key, byte alpha, uint flags);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool InvalidateRect(IntPtr h, IntPtr r, bool erase);
  [DllImport("user32.dll")] static extern IntPtr SetTimer(IntPtr h, IntPtr id, uint ms, IntPtr fn);
  [DllImport("user32.dll")] static extern bool KillTimer(IntPtr h, IntPtr id);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] static extern IntPtr BeginPaint(IntPtr h, out PAINTSTRUCT ps);
  [DllImport("user32.dll")] static extern bool EndPaint(IntPtr h, ref PAINTSTRUCT ps);
  [DllImport("user32.dll")] static extern int FillRect(IntPtr hdc, ref RECT r, IntPtr brush);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("gdi32.dll")] static extern IntPtr CreateSolidBrush(uint color);
  [DllImport("gdi32.dll")] static extern bool Arc(IntPtr hdc, int l, int t, int r, int b, int xs, int ys, int xe, int ye);
  [DllImport("gdi32.dll")] static extern bool Ellipse(IntPtr hdc, int l, int t, int r, int b);
  [DllImport("gdi32.dll")] static extern int SetArcDirection(IntPtr hdc, int dir);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr LoadImage(IntPtr inst, string name, uint type, int cx, int cy, uint load);
  [DllImport("user32.dll")] static extern bool DrawIconEx(IntPtr hdc, int x, int y, IntPtr icon, int cx, int cy, uint step, IntPtr brush, uint flags);
  [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
  [DllImport("gdi32.dll")] static extern IntPtr GetStockObject(int i);
  [DllImport("gdi32.dll")] static extern IntPtr ExtCreatePen(uint style, uint width, ref LOGBRUSH lb, uint n, IntPtr a);
  [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
  [DllImport("gdi32.dll")] static extern int SetPolyFillMode(IntPtr hdc, int mode);
  [DllImport("gdi32.dll")] static extern bool PolyPolygon(IntPtr hdc, CPOINT[] pts, int[] counts, int n);
  [DllImport("gdi32.dll")] static extern bool MoveToEx(IntPtr hdc, int x, int y, IntPtr old);
  [DllImport("gdi32.dll")] static extern bool LineTo(IntPtr hdc, int x, int y);
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
  [StructLayout(LayoutKind.Sequential)] struct CPOINT { public int x, y; public CPOINT(int a, int b){ x = a; y = b; } }
  [StructLayout(LayoutKind.Sequential)] struct LOGBRUSH { public uint lbStyle; public uint lbColor; public IntPtr lbHatch; }
  [StructLayout(LayoutKind.Sequential)] struct PAINTSTRUCT { public IntPtr hdc; public int fErase; public RECT rcPaint;
    public int fRestore, fIncUpdate;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst = 32)] public byte[] rgbReserved; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct WNDCLASSEX {
    public uint cbSize, style; public IntPtr lpfnWndProc; public int cbClsExtra, cbWndExtra;
    public IntPtr hInstance, hIcon, hCursor, hbrBackground;
    public string lpszMenuName, lpszClassName; public IntPtr hIconSm; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }

  static HookProc keepMouse, keepKeys;   // prevent the delegates from being garbage-collected
  delegate IntPtr WndProcD(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  static WndProcD keepWndProc;           // same reason: the OS holds a raw pointer to it

  /* ---- Caps Lock: always on, RecCheck or no RecCheck ----
     The state is TRACKED, not read back. A low-level hook fires BEFORE Windows applies
     the toggle, so reading the key there returns the value the press is about to
     replace. Seeded once from GetKeyState at start and flipped on each press; the hook
     sees every press on the machine, injected ones included, so it cannot drift.
     capsDown is here because auto-repeat sends a run of DOWNs for one physical press. */
  static bool capsOn = false, capsDown = false;
  static IntPtr capsWnd = IntPtr.Zero;
  static byte capsAlpha = CAPS_ALPHA;
  static readonly IntPtr T_HOLD = (IntPtr)1, T_FADE = (IntPtr)2;

  /* ---- is RecCheck up? ----
     The shortcuts are RecCheck's; the Caps Lock icon is not. Only the first is gated. */
  static volatile bool hostUp = false;

  /* The capital A the laptop OSDs draw, as one polygon with the counter punched out.
     Coordinates are the app icon's 150-unit glyph offset by a 10-unit margin, so the
     two are the same shape. ALTERNATE fill makes the second contour a hole. */
  static readonly CPOINT[] GLYPH = new CPOINT[] {
    new CPOINT( 85,  30), new CPOINT(128, 132), new CPOINT(110, 132), new CPOINT(100, 109),
    new CPOINT( 70, 109), new CPOINT( 60, 132), new CPOINT( 42, 132),
    new CPOINT( 76,  93), new CPOINT( 94,  93), new CPOINT( 85,  72)
  };
  static readonly int[] GLYPH_N = new int[] { 7, 3 };
  static IntPtr hook = IntPtr.Zero, kbHook = IntPtr.Zero;
  static int mode = 0;                   // 1 = detect, 2 = bind
  static uint mainTid = 0;
  static Thread watchdog;                // static ref so it can never be collected
  class Bind { public int action; public ushort[] keys; public int gap; public bool thenEnter; }
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

  /* ---- the shortcuts belong to protel, and to nothing else ----
     A bound side button is still a mouse button everywhere else on this machine. When
     a target window is configured, a trigger only fires while that window is in front;
     anywhere else the press is passed straight through, NOT swallowed, so the button
     keeps doing whatever it normally does.

     Three things are matched, any of which is enough: the foreground process name, the
     window class and the window title. If NONE of them can be read — a window we have
     no rights to ask about, which is what an elevated protel looks like from here — the
     press is allowed. A gate that cannot see must never be the reason a shortcut stops
     working. */
  static string focusNeedle = null;                 // null = no gate at all
  static IntPtr fgWnd = IntPtr.Zero;                // last window we decided about …
  static bool fgOk = true;                          // … and what we decided
  static string fgWhat = "";
  static string ForegroundOf(IntPtr fg, out string exe, out string cls, out string txt){
    exe = ""; cls = ""; txt = "";
    try{
      uint pid;
      GetWindowThreadProcessId(fg, out pid);
      if(pid != 0) exe = Process.GetProcessById((int)pid).ProcessName;
    }catch(Exception){}
    try{ StringBuilder b = new StringBuilder(160); GetClassName(fg, b, b.Capacity); cls = b.ToString(); }catch(Exception){}
    try{ StringBuilder b = new StringBuilder(320); GetWindowText(fg, b, b.Capacity); txt = b.ToString(); }catch(Exception){}
    return exe + " | " + cls + " | " + txt;
  }
  /* The decision itself, kept free of Win32 so it can be tested off Windows. A window
     that told us nothing at all is allowed through — see above. */
  static bool MatchesNeedle(string exe, string cls, string txt){
    if(focusNeedle == null) return true;
    if(exe == null) exe = ""; if(cls == null) cls = ""; if(txt == null) txt = "";
    if(exe.Length == 0 && cls.Length == 0 && txt.Length == 0) return true;
    return (exe + "\n" + cls + "\n" + txt).ToUpperInvariant().IndexOf(focusNeedle) >= 0;
  }
  /* Runs on the hook thread, so it is cached per window handle: the expensive half is
     the process lookup, and the foreground window does not change between two presses. */
  static bool TargetFocused(out string what){
    what = "";
    if(focusNeedle == null) return true;
    IntPtr fg = IntPtr.Zero;
    try{ fg = GetForegroundWindow(); }catch(Exception){}
    if(fg == IntPtr.Zero) return true;
    if(fg == fgWnd){ what = fgWhat; return fgOk; }
    string exe, cls, txt;
    string all = ForegroundOf(fg, out exe, out cls, out txt);
    bool ok = MatchesNeedle(exe, cls, txt);
    fgWnd = fg; fgOk = ok; fgWhat = all;
    what = all;
    return ok;
  }
  static string lastBlocked = "";
  static void LogBlocked(){
    /* One line per window, not per press: the button under a chat client is going to be
       pressed more than once and the log is there to be read. */
    string what = fgWhat;
    if(what == lastBlocked) return;
    lastBlocked = what;
    AppendTauLog("=== " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                 + "  trigger ignored: protel was not in front\n"
                 + "    in front: " + what + "\n"
                 + "    looking for: " + focusNeedle + "\n\n");
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
      /* Same 200 ms window as before, checked every 5 ms instead of every 20. The shell
         usually lands the switch well inside the first tick, and the old granularity
         meant paying up to 20 ms for a hop that had already happened — three times per
         press, since the restore polls the same way. */
      for(int w = 0; w < HOP_TICKS; w++){
        Thread.Sleep(HOP_MS);
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
    if(ThreadHasLang(tid, cur)) return;
    /* Being left on Greek is the worst thing this shortcut can do to a night: every
       later keystroke in every program comes out wrong until somebody notices. If the
       polite routes have all failed, cycle the shell switcher until it is back, because
       that one needs nothing from the application. */
    D("  restore still not done — cycling Win+Space directly");
    try{
      int count = 0;
      try{ count = GetKeyboardLayoutList(0, null); }catch(Exception){}
      int tries = count > 1 ? (count > 4 ? 4 : count) : 2;
      for(int i = 0; i < tries && !ThreadHasLang(tid, cur); i++){
        PressWinSpace();
        for(int w = 0; w < HOP_TICKS && !ThreadHasLang(tid, cur); w++) Thread.Sleep(HOP_MS);
      }
    }catch(Exception){}
    if(!ThreadHasLang(tid, cur))
      D("  COULD NOT RESTORE the layout; it is left on " + Hex(GetKeyboardLayout(tid)));
    else D("  restored by cycling Win+Space");
  }
  /* the T we SendInput is TRANSLATED under whatever layout is active when the target
     pulls it off the queue — never hop back before it has been consumed */
  static bool KeyQueued(){ return (GetQueueStatus(QS_KEY) >> 16) != 0; }
  static void WaitKeyDrained(bool attached){
    if(!attached){
      Thread.Sleep(90);                            // can't observe the queue — v2 delay
      D("  waited 90 ms for the key (queue not observable without the attach)");
      return;
    }
    /* The old loop checked the queue with ZERO delay after SendInput and returned the
       instant it looked empty — but SendInput hands the key to the raw input thread, so
       an empty queue a microsecond later means "has not arrived yet", not "already
       consumed". It therefore returned immediately having waited for nothing, and the
       restore flipped the layout back before the target had translated the key. Whether
       the tau survived was a scheduling coin flip: intermittent from English, never a
       problem from Greek because that path neither hops nor restores.

       So: wait for the key to APPEAR, then for it to LEAVE, then settle. */
    /* 150 ms here, and on his machine it NEVER observed the key: six consecutive presses
       from the 02/09 log all report "never showed up", and all six then had the key taken
       in ~0 ms. It was 150 ms of pure waste on every single press. Cut to 30, which still
       covers a key that genuinely does show up late; the wait that actually protects the
       tau is the DRAIN loop below, which is untouched. */
    int t = 0;
    for(; t < ARRIVE_MS && !KeyQueued(); t += 3) Thread.Sleep(3);   // arrive
    if(!KeyQueued() && t >= ARRIVE_MS)
      D("  the key never showed up in the queue within " + t + " ms");
    else D("  key reached the queue after ~" + t + " ms");
    /* Generous on purpose. A busy protel — one still drawing the preview of the invoice
       just printed — can leave the key sitting in the queue for a long time, and the
       moment we stop waiting the layout goes back to English and that key becomes a
       Latin t. Waiting is only ever a slower shortcut; not waiting is a wrong one. */
    int d = 0;
    for(; d < 1200 && KeyQueued(); d += 5) Thread.Sleep(5);         // leave
    D(KeyQueued() ? "  the target still has not taken the key after " + d + " ms"
                  : "  target took the key after ~" + d + " ms");
    /* TranslateMessage runs just after GetMessage, and an embedded browser control
       (protel's list is one) routes the key on again before the character is resolved.
       The layout must still be Greek for all of that, not just for the dequeue. */
    Thread.Sleep(25);
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
  /* Alt + one key. The trigger may itself be a modifier+button combination, so whatever
     the user is physically holding has to come up first or protel sees Ctrl+Alt+N. */
  static void SendAltKey(ushort vk){
    int m = CurMods();
    ushort scCtrl = (ushort)MapVirtualKey(VK_CONTROL, 0), scShift = (ushort)MapVirtualKey(VK_SHIFT, 0);
    ushort scAlt = (ushort)MapVirtualKey(VK_MENU, 0), scKey = (ushort)MapVirtualKey(vk, 0);
    if((m & 1) != 0) KeyEvent(VK_CONTROL, scCtrl, KEYEVENTF_KEYUP);
    if((m & 4) != 0) KeyEvent(VK_SHIFT, scShift, KEYEVENTF_KEYUP);
    if((m & 8) != 0){
      KeyEvent(VK_LWIN, (ushort)MapVirtualKey(VK_LWIN, 0), KEYEVENTF_KEYUP);
      KeyEvent(VK_RWIN, (ushort)MapVirtualKey(VK_RWIN, 0), KEYEVENTF_KEYUP);
    }
    bool altHeld = (m & 2) != 0;                  // already down: reuse it, don't double it
    if(!altHeld) KeyEvent(VK_MENU, scAlt, 0);
    KeyEvent(vk, scKey, 0);
    KeyEvent(vk, scKey, KEYEVENTF_KEYUP);
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
        /* How long this press waited for the previous one matters: the shortcut can take
           the better part of a second against a busy protel, and a second press made
           while the first is still running queues here rather than doing nothing. That
           looks, from the desk, exactly like "it did not work the first time". */
        int queued = 0;
        if(!Monitor.TryEnter(sendLock)){
          int t0 = Environment.TickCount;
          Monitor.Enter(sendLock);
          queued = Environment.TickCount - t0;
        }
        try{
          if(b.action == ACT_ALTF4){ SendAltKey(VK_F4); return; }
          if(b.action == ACT_ALTN){ SendAltKey(VK_N); return; }
          if(b.action == ACT_SEQ){ SendSequence(b); return; }
          StringBuilder keep = DIAG;
          DIAG = new StringBuilder();
          int start = Environment.TickCount;
          try{
            SendGreekT();
            if(b.thenEnter){
              /* After the layout is back, so this is a plain Enter under whatever
                 keyboard the user was on. */
              D("  then Enter, " + b.gap + " ms later");
              Thread.Sleep(b.gap);
              PressKeys(VK_RETURN, (ushort)MapVirtualKey(VK_RETURN, 0), 0);
            }
          }
          finally{
            int took = Environment.TickCount - start;
            StringBuilder rep = DIAG;
            DIAG = keep;
            AppendTauLog("=== tau press " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                         + "  took " + took + " ms"
                         + (queued > 0 ? "  (waited " + queued + " ms for the previous press)" : "")
                         + "\r\n" + rep.ToString().Replace("\n", "\r\n") + "\r\n");
          }
        }finally{ Monitor.Exit(sendLock); }
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
              /* The shortcuts are RecCheck's. With RecCheck closed the button is just a
                 button. The mouse hook is normally taken out entirely in that state --
                 this is the belt to that pair of braces, for the instant between
                 RecCheck exiting and the loop unhooking. The release bookkeeping below
                 stays OUTSIDE the gate: a press swallowed while RecCheck was up must
                 still have its release swallowed after it goes away, or the target sees
                 half a click. */
              if(down && hostUp && binds.TryGetValue("m" + CurMods() + "-" + btn, out idx)){
                /* Not protel in front: let the button be a button. Nothing is swallowed
                   here, so the release below is not swallowed either. */
                string what;
                if(!TargetFocused(out what)){
                  PostThreadMessage(mainTid, WM_APP_BLOCK, IntPtr.Zero, IntPtr.Zero);
                  return CallNextHookEx(hook, nCode, wParam, lParam);
                }
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
        /* CAPS LOCK, before every other test and outside the injected filter: a Caps
           Lock toggled by anything at all is still one the user needs to see, and this
           job does not care whether RecCheck is running. Nothing is returned from here
           -- the key carries on to whatever has the focus, untouched. */
        if(k.vkCode == VK_CAPITAL){
          if(down){
            if(!capsDown){
              capsDown = true;
              capsOn = !capsOn;
              PostUi(WM_APP_CAPS, IntPtr.Zero);
            }
          }else if(up) capsDown = false;
        }
        if((k.flags & LLKHF_INJECTED) == 0 && !IsModifierVk(k.vkCode)){
          if(mode == 1 && down){
            try{ Console.Out.Write("KEY:" + CurMods() + "-" + k.vkCode + "\n"); Console.Out.Flush(); }catch(Exception){}
            PostThreadMessage(mainTid, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
            return (IntPtr)1;
          }
          if(mode == 2){
            int idx;
            /* Same gate as the mouse. This hook stays installed with RecCheck closed
               because Caps Lock needs it, so the check has to be explicit here. */
            if(down && hostUp && binds.TryGetValue("k" + CurMods() + "-" + k.vkCode, out idx)){
              string what;
              if(!TargetFocused(out what)){
                PostThreadMessage(mainTid, WM_APP_BLOCK, IntPtr.Zero, IntPtr.Zero);
                return CallNextHookEx(kbHook, nCode, wParam, lParam);
              }
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

  /* ---------------- the Caps Lock indicator ---------------- */

  static void CapsFlash(){
    if(capsWnd == IntPtr.Zero) return;         // no window: no icon, everything else fine
    KillTimer(capsWnd, T_HOLD);
    KillTimer(capsWnd, T_FADE);
    capsAlpha = CAPS_ALPHA;
    SetLayeredWindowAttributes(capsWnd, CAPS_KEY, capsAlpha, LWA_COLORKEY | LWA_ALPHA);
    /* the screen can change size under us, so centre on every flash rather than once */
    int x = (GetSystemMetrics(SM_CXSCREEN) - CAPS_W) / 2;
    int y = (GetSystemMetrics(SM_CYSCREEN) - CAPS_H) / 2;
    SetWindowPos(capsWnd, (IntPtr)(-1), x, y, CAPS_W, CAPS_H, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    InvalidateRect(capsWnd, IntPtr.Zero, true);
    SetTimer(capsWnd, T_HOLD, CAPS_HOLD_MS, IntPtr.Zero);
  }

  static void CapsPaint(){
    PAINTSTRUCT ps;
    IntPtr hdc = BeginPaint(capsWnd, out ps);
    IntPtr keyBrush = IntPtr.Zero, fill = IntPtr.Zero, white = IntPtr.Zero;
    IntPtr pen = IntPtr.Zero, penHi = IntPtr.Zero, penLo = IntPtr.Zero;
    IntPtr oldPen = IntPtr.Zero, oldBrush = IntPtr.Zero;
    try{
      RECT rc;
      GetClientRect(capsWnd, out rc);
      keyBrush = CreateSolidBrush(CAPS_KEY);
      FillRect(hdc, ref rc, keyBrush);       // everything not drawn on becomes transparent

      LOGBRUSH lb = new LOGBRUSH();
      lb.lbStyle = BS_SOLID; lb.lbColor = CAPS_WHITE; lb.lbHatch = IntPtr.Zero;
      pen   = ExtCreatePen(PS_GEOMETRIC | PS_SOLID, 9, ref lb, 0, IntPtr.Zero);
      white = CreateSolidBrush(CAPS_WHITE);
      fill  = CreateSolidBrush(CAPS_DARK);
      SetPolyFillMode(hdc, ALTERNATE);
      /* TWO PASSES, and the order is the point. GDI strokes ON TOP of its fill, which
         closes the counter of the A up almost solid at this pen width. The app's icon
         puts the stroke BEHIND the fill (SVG paint-order="stroke"), so: pass one draws
         the silhouette in white, pen and brush both, giving the outline; pass two lays
         the exact glyph over it in dark with no pen, which reopens the counter. Checked
         against the app's own icon side by side in a browser before shipping. */
      oldPen = SelectObject(hdc, pen);
      oldBrush = SelectObject(hdc, white);
      PolyPolygon(hdc, GLYPH, GLYPH_N, 2);
      SelectObject(hdc, GetStockObject(NULL_PEN));
      SelectObject(hdc, fill);
      PolyPolygon(hdc, GLYPH, GLYPH_N, 2);

      if(!capsOn){
        /* struck through for off — white with a dark core, so it stays readable where
           it crosses the letter */
        lb.lbColor = CAPS_WHITE;
        penHi = ExtCreatePen(PS_GEOMETRIC | PS_SOLID, 17, ref lb, 0, IntPtr.Zero);
        SelectObject(hdc, penHi);
        MoveToEx(hdc, 32, 138, IntPtr.Zero); LineTo(hdc, 138, 32);
        lb.lbColor = CAPS_DARK;
        penLo = ExtCreatePen(PS_GEOMETRIC | PS_SOLID, 8, ref lb, 0, IntPtr.Zero);
        SelectObject(hdc, penLo);
        MoveToEx(hdc, 32, 138, IntPtr.Zero); LineTo(hdc, 138, 32);
      }
      if(oldPen   != IntPtr.Zero) SelectObject(hdc, oldPen);
      if(oldBrush != IntPtr.Zero) SelectObject(hdc, oldBrush);
    }catch(Exception){
      /* a failed paint must never cost the hooks or the loop */
    }finally{
      if(pen      != IntPtr.Zero) DeleteObject(pen);
      if(penHi    != IntPtr.Zero) DeleteObject(penHi);
      if(penLo    != IntPtr.Zero) DeleteObject(penLo);
      if(fill     != IntPtr.Zero) DeleteObject(fill);
      if(white    != IntPtr.Zero) DeleteObject(white);
      if(keyBrush != IntPtr.Zero) DeleteObject(keyBrush);
      EndPaint(capsWnd, ref ps);
    }
  }

  static IntPtr CapsWndProc(IntPtr h, uint msg, IntPtr w, IntPtr l){
    try{
      if(msg == WM_APP_CAPS){ CapsFlash(); return IntPtr.Zero; }
      if(msg == WM_PAINT){ CapsPaint(); return IntPtr.Zero; }
      if(msg == WM_TIMER){
        if(w == T_HOLD){
          KillTimer(capsWnd, T_HOLD);
          SetTimer(capsWnd, T_FADE, CAPS_FADE_MS, IntPtr.Zero);
          return IntPtr.Zero;
        }
        if(w == T_FADE){
          int a = capsAlpha - 12;
          if(a <= 0){
            KillTimer(capsWnd, T_FADE);
            ShowWindow(capsWnd, SW_HIDE);
            capsAlpha = CAPS_ALPHA;
          }else{
            capsAlpha = (byte)a;
            SetLayeredWindowAttributes(capsWnd, CAPS_KEY, capsAlpha, LWA_COLORKEY | LWA_ALPHA);
          }
          return IntPtr.Zero;
        }
      }
      if(msg == WM_APP_HOST){ SetHost(w != IntPtr.Zero); return IntPtr.Zero; }
      if(msg == WM_APP_BINDS){ LoadBinds(); return IntPtr.Zero; }
      if(msg == WM_CLOSE || msg == WM_DESTROY){ PostQuitMessage(0); return IntPtr.Zero; }
    }catch(Exception){}
    return DefWindowProc(h, msg, w, l);
  }

  /* RecCheck came up or went away. The MOUSE hook's lifetime is tied to it, so a
     machine with RecCheck closed carries no mouse hook at all — the same scope it had
     when RecCheck spawned this as its own child. The keyboard hook is not touched: it
     belongs to the Caps Lock job, which does not care. Runs on the loop thread, because
     a low-level hook belongs to the thread that installs it and only this one pumps. */
  /* Route to the window when there is one, and to the message loop when there is not.
     If the indicator's window cannot be created, that must cost the Caps Lock icon and
     NOTHING ELSE — protel's shortcuts are the critical half of this program and they do
     not need a window at all. */
  static void PostUi(uint msg, IntPtr w){
    if(capsWnd != IntPtr.Zero) PostMessage(capsWnd, msg, w, IntPtr.Zero);
    else PostThreadMessage(mainTid, msg, w, IntPtr.Zero);
  }

  static void SetHost(bool up){
    if(up == hostUp) return;
    hostUp = up;
    try{
      if(up){
        if(hook == IntPtr.Zero) hook = SetWindowsHookEx(WH_MOUSE_LL, keepMouse, GetModuleHandle(null), 0);
        LoadBinds();                 // they may have changed while we were not watching
      }else{
        if(hook != IntPtr.Zero){ UnhookWindowsHookEx(hook); hook = IntPtr.Zero; }
        swallowedBtn.Clear();        // nothing may stay half-swallowed across the change
      }
    }catch(Exception){}
  }

  /* ---- the installation overlay (v18) ----

     What he asked for, 04/09: "when installing, it would be nice to have an overlay
     (during the installation process) that shows the installation progress instead of
     nothingness, im thinking it would be cool to have the icon in the middle and the
     progress bar being a donut around it, the progress bar's color should be blue to
     match the update ui's theme."

     WHY IT IS ITS OWN PROCESS, AND NOT rc-tbind.exe ITSELF. The installer's very first
     act is `taskkill /F /IM rc-tbind.exe` (reccheck.nsi), because Windows will not
     overwrite a running exe. The notes had the helper drawing this; the installer rules
     that out by design. So RecCheck copies the helper to TEMP under ANOTHER NAME before
     it exits, and runs that. `taskkill /IM` matches the image name, so the copy is not
     what it is looking for, and nothing in TEMP is touched by the install.

     WHAT THE RING CAN HONESTLY SHOW. Nothing. `spawn(setup, ["/S"])` is a silent NSIS
     run: it reports no progress to anybody, and RecCheck is gone a fraction of a second
     later anyway. A ring filling 0->100 here would be a number invented to look like a
     measurement, which is the one thing his rules forbid outright. So the arc TRAVELS
     rather than fills: it says work is happening, which is exactly the "instead of
     nothingness" he asked for, and it claims nothing it does not know. The download,
     which does have a real percentage, already shows it in the app before this starts.

     It ends when RecCheck comes back -- the installer relaunches it as its last act --
     and on a hard timeout regardless, so a failed install cannot leave this on screen.
     Click-through and never activated, so it cannot take a keystroke or a click from
     anything, protel included. If it fails to draw at all, the install is unaffected:
     nothing depends on it. */
  static IntPtr splashWnd = IntPtr.Zero;
  static int splashAngle = 0;
  static int splashLeftMs = 0;
  static bool splashSawGone = false;
  static bool splashBack = false, splashDone = false;
  static int splashBackMs = 0, splashPollMs = 0, splashTotalMs = 0;
  static IntPtr splashIcon = IntPtr.Zero;      // loaded once, not per frame
  static WndProcD keepSplashProc;
  static void SplashPaint(){
    PAINTSTRUCT ps;
    IntPtr hdc = BeginPaint(splashWnd, out ps);
    IntPtr keyBrush = IntPtr.Zero, back = IntPtr.Zero, white = IntPtr.Zero;
    IntPtr track = IntPtr.Zero, arc = IntPtr.Zero;
    try{
      RECT rc;
      GetClientRect(splashWnd, out rc);
      keyBrush = CreateSolidBrush(CAPS_KEY);
      FillRect(hdc, ref rc, keyBrush);          // anything not drawn on is keyed away

      /* the disc the glyph sits on */
      back = CreateSolidBrush(SPLASH_BACK);
      SelectObject(hdc, GetStockObject(NULL_PEN));
      SelectObject(hdc, back);
      Ellipse(hdc, SPLASH_CX - SPLASH_R + SPLASH_PEN, SPLASH_CY - SPLASH_R + SPLASH_PEN,
                   SPLASH_CX + SPLASH_R - SPLASH_PEN, SPLASH_CY + SPLASH_R - SPLASH_PEN);

      int l = SPLASH_CX - SPLASH_R, t = SPLASH_CY - SPLASH_R;
      int r = SPLASH_CX + SPLASH_R, b = SPLASH_CY + SPLASH_R;
      LOGBRUSH lb = new LOGBRUSH();
      lb.lbStyle = BS_SOLID; lb.lbHatch = IntPtr.Zero;

      /* the whole ring, dim: the track the arc travels on */
      lb.lbColor = SPLASH_TRACK;
      track = ExtCreatePen(PS_GEOMETRIC | PS_SOLID, (uint)SPLASH_PEN, ref lb, 0, IntPtr.Zero);
      SelectObject(hdc, track);
      SelectObject(hdc, GetStockObject(NULL_BRUSH_));
      Ellipse(hdc, l, t, r, b);

      /* and the bright arc on top of it */
      SetArcDirection(hdc, AD_CLOCKWISE);
      lb.lbColor = SPLASH_ARC;
      arc = ExtCreatePen(PS_GEOMETRIC | PS_SOLID | PS_ENDCAP_ROUND_, (uint)SPLASH_PEN, ref lb, 0, IntPtr.Zero);
      SelectObject(hdc, arc);
      double a0 = splashAngle * Math.PI / 180.0;
      double a1 = (splashAngle + SPLASH_SWEEP) * Math.PI / 180.0;
      int xs = SPLASH_CX + (int)(SPLASH_R * Math.Cos(a0));
      int ys = SPLASH_CY - (int)(SPLASH_R * Math.Sin(a0));
      int xe = SPLASH_CX + (int)(SPLASH_R * Math.Cos(a1));
      int ye = SPLASH_CY - (int)(SPLASH_R * Math.Sin(a1));
      Arc(hdc, l, t, r, b, xs, ys, xe, ye);

      /* HIS ICON, not a letter.

         The first cut drew the Caps Lock indicator's glyph -- a capital A -- because the
         comment beside it mentions "the app's icon". That comment is about the DRAWING
         TECHNIQUE (stroke behind fill, the way the icon's SVG does it), not about the
         shape, and I read it as licence without looking. RecCheck's icon is a receipt.
         He saw the A on the first install and asked what it was doing there.

         So the real thing is blitted instead of approximated: the .ico is embedded in this
         exe at build time, LoadImage picks the size closest to what is wanted out of the
         group and scales it, and DrawIconEx composites it over the disc already drawn. If
         it cannot be loaded the ring is drawn alone -- an honest empty middle beats a
         wrong picture. */
      if(splashIcon == IntPtr.Zero)
        try{ splashIcon = LoadImage(GetModuleHandle(null), "#32512", IMAGE_ICON,
                                    SPLASH_ICON, SPLASH_ICON, LR_DEFAULTCOLOR); }catch(Exception){}
      if(splashIcon != IntPtr.Zero)
        try{ DrawIconEx(hdc, SPLASH_CX - SPLASH_ICON / 2, SPLASH_CY - SPLASH_ICON / 2,
                        splashIcon, SPLASH_ICON, SPLASH_ICON, 0, IntPtr.Zero, DI_NORMAL); }catch(Exception){}
      /* Everything must be OUT of the DC before the finally deletes it. GDI silently
         refuses to delete an object that is still selected, and this paints 25 times a
         second for as long as the install takes -- one leaked brush per frame walks into
         the 10,000-object quota, after which CreateSolidBrush starts returning null and
         the overlay quietly falls apart. */
      SelectObject(hdc, GetStockObject(NULL_PEN));
      SelectObject(hdc, GetStockObject(NULL_BRUSH_));
    }catch(Exception){
    }finally{
      if(track    != IntPtr.Zero) DeleteObject(track);
      if(arc      != IntPtr.Zero) DeleteObject(arc);
      if(white    != IntPtr.Zero) DeleteObject(white);
      if(back     != IntPtr.Zero) DeleteObject(back);
      if(keyBrush != IntPtr.Zero) DeleteObject(keyBrush);
      EndPaint(splashWnd, ref ps);
    }
  }
  /* RecCheck has to GO before its return means anything -- it is still running when this
     starts, for the fraction of a second it takes to exit. */
  static bool RecCheckRunning(){
    try{
      Process[] all = Process.GetProcessesByName("RecCheck");
      bool any = all.Length > 0;
      for(int i = 0; i < all.Length; i++){ try{ all[i].Dispose(); }catch(Exception){} }
      return any;
    }catch(Exception){ return false; }
  }
  /* ONCE A SECOND, not once a frame. Walking the whole process table 25 times a second,
     on the machine, while it is extracting 300 MB, is a cost paid for nothing: RecCheck
     does not come and go inside 40 ms. */
  static bool SplashPollDue(int step){
    splashPollMs -= step;
    if(splashPollMs <= 0){ splashPollMs = 1000; return true; }
    return false;
  }
  /* WHEN THIS ENDS, kept out of the window procedure so it can be driven without Windows.
     Every one of its three exits is a case that only ever happens on his machine, mid
     install, with nobody watching the code:

       - RecCheck went away and came back  -> the normal one, after a moment for its
         window to paint.
       - RecCheck never went away          -> the update did not start. Twenty seconds is
         already generous; waiting the full timeout would leave a ring on his screen for
         four minutes over nothing.
       - neither                           -> the hard timeout, so a failed install can
         never strand it.

     `splashBack` is a FLAG and the test is `<= 0`, deliberately. The first version ended
     on `splashBackMs == 0` exactly, which works only because 40 happens to divide 1200 --
     change either number to something that does not and the overlay would have hung until
     the timeout. */
  static bool SplashStep(int step, bool polled, bool here){
    splashLeftMs -= step;
    if(polled){
      if(!splashSawGone){
        if(!here) splashSawGone = true;
        else if((splashTotalMs - splashLeftMs) > 20000) splashDone = true;
      }else if(here && !splashBack){ splashBack = true; splashBackMs = 1200; }
    }
    if(splashBack){
      splashBackMs -= step;
      if(splashBackMs <= 0) splashDone = true;
    }
    return splashLeftMs <= 0 || splashDone;
  }
  static IntPtr SplashWndProc(IntPtr h, uint msg, IntPtr w, IntPtr l){
    try{
      if(msg == WM_PAINT){ SplashPaint(); return IntPtr.Zero; }
      if(msg == WM_TIMER){
        splashAngle = (splashAngle + 6) % 360;
        bool polled = SplashPollDue(SPLASH_STEP_MS);
        bool here = polled && RecCheckRunning();
        if(SplashStep(SPLASH_STEP_MS, polled, here)){
          KillTimer(splashWnd, T_HOLD);
          PostQuitMessage(0);
          return IntPtr.Zero;
        }
        InvalidateRect(splashWnd, IntPtr.Zero, false);
        return IntPtr.Zero;
      }
      if(msg == WM_DESTROY){ PostQuitMessage(0); return IntPtr.Zero; }
    }catch(Exception){}
    return DefWindowProc(h, msg, w, l);
  }
  static int RunSplash(int maxSeconds){
    if(maxSeconds < 5) maxSeconds = 5;
    if(maxSeconds > 600) maxSeconds = 600;
    /* one at a time: a second overlay on top of the first helps nobody */
    try{ if(FindWindow(SPLASH_CLASS, null) != IntPtr.Zero) return 0; }catch(Exception){}
    try{
      IntPtr inst = GetModuleHandle(null);
      keepSplashProc = SplashWndProc;
      WNDCLASSEX wc = new WNDCLASSEX();
      wc.cbSize = (uint)Marshal.SizeOf(typeof(WNDCLASSEX));
      wc.lpfnWndProc = Marshal.GetFunctionPointerForDelegate(keepSplashProc);
      wc.hInstance = inst;
      wc.lpszClassName = SPLASH_CLASS;
      if(RegisterClassEx(ref wc) == 0) return 1;
      splashWnd = CreateWindowEx(
        WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        SPLASH_CLASS, "RecCheck is updating", WS_POPUP,
        (GetSystemMetrics(SM_CXSCREEN) - SPLASH_W) / 2,
        (GetSystemMetrics(SM_CYSCREEN) - SPLASH_H) / 2, SPLASH_W, SPLASH_H,
        IntPtr.Zero, IntPtr.Zero, inst, IntPtr.Zero);
      if(splashWnd == IntPtr.Zero) return 1;
      SetLayeredWindowAttributes(splashWnd, CAPS_KEY, 235, LWA_COLORKEY | LWA_ALPHA);
      splashLeftMs = maxSeconds * 1000;
      splashTotalMs = splashLeftMs;
      SetWindowPos(splashWnd, (IntPtr)(-1),
                   (GetSystemMetrics(SM_CXSCREEN) - SPLASH_W) / 2,
                   (GetSystemMetrics(SM_CYSCREEN) - SPLASH_H) / 2,
                   SPLASH_W, SPLASH_H, SWP_NOACTIVATE | SWP_SHOWWINDOW);
      SetTimer(splashWnd, T_HOLD, (uint)SPLASH_STEP_MS, IntPtr.Zero);
      MSG m;
      while(GetMessage(out m, IntPtr.Zero, 0, 0) > 0){
        TranslateMessage(ref m);
        DispatchMessage(ref m);
      }
    }catch(Exception e){ WriteCrash("splash", e); return 1; }
    return 0;
  }
  static bool CreateCapsWindow(){
    try{
      IntPtr inst = GetModuleHandle(null);
      keepWndProc = CapsWndProc;
      WNDCLASSEX wc = new WNDCLASSEX();
      wc.cbSize = (uint)Marshal.SizeOf(typeof(WNDCLASSEX));
      wc.lpfnWndProc = Marshal.GetFunctionPointerForDelegate(keepWndProc);
      wc.hInstance = inst;
      wc.lpszClassName = CAPS_CLASS;
      if(RegisterClassEx(ref wc) == 0) return false;
      capsWnd = CreateWindowEx(
        WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        CAPS_CLASS, "RecCheck Caps Lock", WS_POPUP,
        (GetSystemMetrics(SM_CXSCREEN) - CAPS_W) / 2,
        (GetSystemMetrics(SM_CYSCREEN) - CAPS_H) / 2, CAPS_W, CAPS_H,
        IntPtr.Zero, IntPtr.Zero, inst, IntPtr.Zero);
      if(capsWnd == IntPtr.Zero) return false;
      SetLayeredWindowAttributes(capsWnd, CAPS_KEY, CAPS_ALPHA, LWA_COLORKEY | LWA_ALPHA);
      capsOn = (GetKeyState(VK_CAPITAL) & 1) != 0;   // the one read of the OS's own toggle
      return true;
    }catch(Exception){ return false; }
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
    else if(action == "altn") b.action = ACT_ALTN;     // protel's "new" on the passport screen
    else if(action == "tau") b.action = ACT_TAU;
    /* "tau:120" — press the tau, then Enter after that many milliseconds. protel needs a
       moment to react to the tau before it will take the Enter, and a person pressing it
       by hand beats it there. The helper is the only one who can wait reliably. */
    else if(action.StartsWith("tau:")){
      b.action = ACT_TAU;
      int ms;
      if(!int.TryParse(action.Substring(4), out ms) || ms < 0 || ms > 5000) return;
      b.thenEnter = true;
      b.gap = ms;
    }
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
  /* Every real press records what it did. The diagnostic only ever ran a synthetic
     attempt against an idle protel, which is exactly the condition under which this
     shortcut has never once failed — so it kept coming back clean while the live press
     went on misbehaving. This writes the same step-by-step report the diagnostic prints,
     for the presses that actually happen, with how long each took and whether the press
     had to queue behind one still running. */
  static string TauLogPath(){
    try{
      string b = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
      if(b == null || b.Length == 0) return null;
      return System.IO.Path.Combine(System.IO.Path.Combine(b, "RecCheck"), "rc-tbind-tau.log");
    }catch(Exception){ return null; }
  }
  static void AppendTauLog(string entry){
    try{
      string p = TauLogPath();
      if(p == null) return;
      System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(p));
      string prev = "";
      try{ if(System.IO.File.Exists(p)) prev = System.IO.File.ReadAllText(p); }catch(Exception){}
      // keep it small and self-trimming: the last ~40 KB is many nights of presses
      if(prev.Length > 40000) prev = prev.Substring(prev.Length - 30000);
      System.IO.File.WriteAllText(p, prev + entry);
    }catch(Exception){}
  }
  static void ClearCrash(){
    try{ string p = CrashPath(); if(p != null) System.IO.File.Delete(p); }catch(Exception){}
  }

  /* ---- what the window in front is made of ----
     Answers the one question a screenshot cannot: are protel's lists real Windows
     controls, or does protel paint them itself? If they are real, a list control reports
     its row count even for rows scrolled out of sight — which decides whether anything
     built on this can know a WHOLE list or only the part on screen. If nothing comes
     back, the next stop is UI Automation, then OCR.

     READ-ONLY, in his sense of the word: every call is a question, nothing is written,
     and protel holds exactly what it held before. It is NOT zero-touch — asking a control
     for its text or its row count runs code on protel's UI thread that would not
     otherwise have run. That is why it counts its own messages and times itself: he ships
     this to a live desk on the understanding that if it makes protel slower the code
     comes out again, and that decision needs a number, not a feeling.

     The structural half (enumerate, class, id, rectangle, visibility) sends nothing at
     all and costs protel literally zero — if the cost ever has to go, that half can stay. */
  static StringBuilder SCAN = null;
  static int scanSeen = 0, scanMsgs = 0;
  const int SCAN_MAX = 500;
  static int Depth(IntPtr h, IntPtr root){
    int d = 0;
    for(IntPtr p = h; p != IntPtr.Zero && p != root && d < 20; p = GetParent(p)) d++;
    return d;
  }
  static string CtrlText(IntPtr h){
    try{
      IntPtr res;
      scanMsgs++;
      if(SendMessageTimeout(h, WM_GETTEXTLENGTH, IntPtr.Zero, IntPtr.Zero,
                            SMTO_ABORTIFHUNG, 120, out res) == IntPtr.Zero) return "";
      int len = res.ToInt32();
      if(len <= 0) return "";
      if(len > 300) len = 300;
      StringBuilder b = new StringBuilder(len + 2);
      scanMsgs++;
      SendMessageTimeoutText(h, WM_GETTEXT, (IntPtr)(len + 1), b, SMTO_ABORTIFHUNG, 200, out res);
      return b.ToString().Replace("\r", " ").Replace("\n", " ").Replace("\t", " ");
    }catch(Exception){ return ""; }
  }
  /* the number the whole idea depends on: rows HELD, not rows visible. One message and
     one integer back, whether the list holds ten rows or ten thousand. */
  static int RowCount(IntPtr h, string cls){
    uint msg = 0;
    string c = cls.ToUpperInvariant();
    if(c.IndexOf("SYSLISTVIEW32") >= 0) msg = LVM_GETITEMCOUNT;
    else if(c.IndexOf("SYSTREEVIEW32") >= 0) msg = TVM_GETCOUNT;
    else if(c.IndexOf("COMBOBOX") >= 0) msg = CB_GETCOUNT;
    else if(c.IndexOf("LISTBOX") >= 0) msg = LB_GETCOUNT;
    if(msg == 0) return -1;                     // not a list: nothing is sent at all
    try{
      IntPtr res;
      scanMsgs++;
      if(SendMessageTimeout(h, msg, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 250, out res) == IntPtr.Zero)
        return -1;
      return res.ToInt32();
    }catch(Exception){ return -1; }
  }
  static void ScanOne(IntPtr h, IntPtr root){
    StringBuilder cls = new StringBuilder(160);
    try{ GetClassName(h, cls, cls.Capacity); }catch(Exception){}
    RECT r = new RECT();
    try{ GetWindowRect(h, out r); }catch(Exception){}
    int id = 0;
    try{ id = GetDlgCtrlID(h); }catch(Exception){}
    bool vis = false;
    try{ vis = IsWindowVisible(h); }catch(Exception){}
    int rows = RowCount(h, cls.ToString());
    string txt = CtrlText(h);
    if(txt.Length > 120) txt = txt.Substring(0, 120) + "\u2026";
    SCAN.Append(new string(' ', Depth(h, root) * 2));
    SCAN.Append(Hex(h) + "\tid=" + id + "\t" + cls
                + "\t" + (r.right - r.left) + "x" + (r.bottom - r.top)
                + (vis ? "" : "\thidden")
                + (rows >= 0 ? "\tROWS=" + rows : "")
                + (txt.Length > 0 ? "\t\"" + txt + "\"" : "")
                + "\n");
  }
  static void ScanForeground(){
    IntPtr fg = IntPtr.Zero;
    try{ fg = GetForegroundWindow(); }catch(Exception){}
    if(fg == IntPtr.Zero){ SCAN.Append("no foreground window\n"); return; }
    string exe, cls, txt;
    ForegroundOf(fg, out exe, out cls, out txt);
    SCAN.Append("rc-tbind " + VER + " window scan  " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\n");
    SCAN.Append("front: " + exe + " | " + cls + " | " + txt + "\n\n");
    scanSeen = 0; scanMsgs = 0;
    int t0 = Environment.TickCount;
    ScanOne(fg, fg);
    EnumProc keep = delegate(IntPtr h, IntPtr lp){
      if(scanSeen++ >= SCAN_MAX) return false;
      ScanOne(h, fg);
      return true;
    };
    try{ EnumChildWindows(fg, keep, IntPtr.Zero); }
    catch(Exception e){ SCAN.Append("enumerate failed: " + e.Message + "\n"); }
    int took = Environment.TickCount - t0;
    SCAN.Append("\n" + scanSeen + " child window(s)"
                + (scanSeen >= SCAN_MAX ? " \u2014 stopped at the cap" : "") + "\n");
    /* THE COST, in his own terms. This is the line that decides whether the probe stays. */
    SCAN.Append(scanMsgs + " message(s) asked of protel, whole sweep took " + took + " ms\n");
    SCAN.Append("Nothing was written. If protel felt slower during that, this is what did it.\n");
    if(scanSeen == 0)
      SCAN.Append("\nNo child windows at all, so this window is painted rather than built from\n"
                  + "controls: there is nothing here to read by window. UI Automation next.\n");
  }

  /* ---------------- the binds file, the login entry, and RecCheck ---------------- */

  /* RecCheck used to hand the bindings over on the command line, because RecCheck
     started this process. It does not any more — this one starts at login — so the
     bindings arrive in a file instead, in the same folder as the logs. One token per
     line, exactly the words that used to be arguments:
         focus=PROTEL
         m4=tau:50
         m3=altf4
     Re-read whenever the file's write time changes, so changing a binding in the app
     takes effect without restarting anything. */
  static string BindsPath(){
    try{
      string b = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
      if(b == null || b.Length == 0) return null;
      return System.IO.Path.Combine(System.IO.Path.Combine(b, "RecCheck"), "rc-tbind-binds.txt");
    }catch(Exception){ return null; }
  }
  static DateTime bindsStamp = DateTime.MinValue;
  static bool BindsChanged(){
    try{
      string f = BindsPath();
      if(f == null) return false;
      DateTime t = System.IO.File.Exists(f) ? System.IO.File.GetLastWriteTimeUtc(f) : DateTime.MinValue;
      if(t == bindsStamp) return false;
      bindsStamp = t;
      return true;
    }catch(Exception){ return false; }
  }
  /* Read on the message-loop thread, never on the watcher: the hook callbacks run on
     this thread too, so rebuilding the table here cannot race one of them. */
  static void LoadBinds(){
    try{
      string f = BindsPath();
      binds.Clear();
      bindList.Clear();
      focusNeedle = null;
      if(f == null || !System.IO.File.Exists(f)) return;
      foreach(string raw in System.IO.File.ReadAllLines(f)){
        string line = (raw ?? "").Trim();
        if(line.Length == 0 || line[0] == '#') continue;
        if(line.StartsWith("focus=")){
          string needle = line.Substring(6).Trim();
          focusNeedle = needle.Length > 0 ? needle.ToUpperInvariant() : null;
          continue;
        }
        ParseBind(line);
      }
    }catch(Exception){}
  }

  /* RecCheck's own process. Nothing is read from it and nothing is sent to it — its
     mere presence is the whole signal. */
  static bool HostRunning(){
    try{
      Process[] ps = Process.GetProcessesByName("RecCheck");
      bool any = ps.Length > 0;
      foreach(Process q in ps){ try{ q.Dispose(); }catch(Exception){} }
      return any;
    }catch(Exception){ return false; }
  }

  /* ================= reading a list's rows — this one is NOT free =================
     A probe, and deliberately only a probe: it reads a few rows out of the list in the
     window in front and reports them WITH ITS OWN COST, the same terms the window scan
     shipped on. Nothing is wired to the ledger until this has been seen to work on his
     machine, because none of it can be run in the container it was written in.

     Every message sent is a documented getter. The buffer LVM_GETITEMTEXT fills has to
     live in the target's address space, so a scratch page is allocated there and freed
     again; protel's own memory is never written. */
  static StringBuilder READ = new StringBuilder();
  static int readMsgs = 0;

  /* The LVITEM the control will read. Its layout is the TARGET's, not ours: pszText is a
     pointer, so a 64-bit helper talking to 32-bit protel must lay out 32-bit fields or the
     control reads the text pointer out of the padding and returns nothing. */
  static byte[] BuildLvItem(bool target64, int row, int col, IntPtr text, int cch){
    byte[] b = new byte[target64 ? 64 : 48];
    PutI(b, 0, 1);                       // mask = LVIF_TEXT
    PutI(b, 4, row);
    PutI(b, 8, col);
    if(target64){
      PutL(b, 24, text.ToInt64());
      PutI(b, 32, cch);
    }else{
      PutI(b, 20, (int)text.ToInt64());
      PutI(b, 24, cch);
    }
    return b;
  }
  static void PutI(byte[] b, int at, int v){
    b[at] = (byte)v; b[at+1] = (byte)(v >> 8); b[at+2] = (byte)(v >> 16); b[at+3] = (byte)(v >> 24);
  }
  static void PutL(byte[] b, int at, long v){
    for(int i = 0; i < 8; i++) b[at+i] = (byte)(v >> (8*i));
  }

  /* Kept free of Win32 so the harness can pin the DECISION, not only the two layouts.
     test/lvitem.cs proved both layouts were built correctly and still missed that the
     wrong one was being picked — a test of the parts that never tested the choice. */
  static bool TargetIs64(bool osIs64, bool targetWow){
    if(!osIs64) return false;      // 32-bit Windows: nothing on it is 64-bit
    return !targetWow;             // 64-bit Windows: WOW64 means the target is 32-bit
  }
  /* WHICH list the read is pointed at.

     protel is MDI. The frame's caption names a report only while that report is
     MAXIMISED; restore it and the frame says nothing about it, while the biggest
     list under the frame stays whatever is sitting behind. He hit exactly that on
     04/09: the arrival list was open but not maximised, and the read came back with
     the in-house list's 250 rows under a caption that named neither list. Reading the
     wrong list is not a display fault -- those rows go straight into the ledger.

     So a read is scoped to the ACTIVE MDI child and reports THAT window's caption.
     GetWindow(client, GW_CHILD) is the topmost child in Z-order, which for an MDI
     client is the active one; invisible ones are stepped over. Nothing here sends
     protel a message: class names, captions and Z-order all come from the window
     manager, not from protel's message queue.

     With no MDI client under the front window -- a dialog, or a popup, which is
     top-level and is itself the foreground window -- the scope stays the front window
     and this changes nothing. */
  static IntPtr mdiClient = IntPtr.Zero;
  static bool MdiPick(IntPtr h, IntPtr p){
    if(mdiClient != IntPtr.Zero) return false;
    try{
      StringBuilder c = new StringBuilder(80);
      GetClassName(h, c, c.Capacity);
      /* Contains, not equals: protel is Borland OWL, and an OWL frame's client has been
         seen registered under its own name. A miss here is safe -- the scope falls back
         to the front window and the page then refuses a caption that names no list --
         but a miss also means the fix never engages, so the match is the tolerant one. */
      if(c.ToString().ToUpperInvariant().IndexOf("MDICLIENT") >= 0 && IsWindowVisible(h)){ mdiClient = h; return false; }
    }catch(Exception){}
    return true;
  }
  static IntPtr ActiveMdiChild(IntPtr frame){
    mdiClient = IntPtr.Zero;
    try{ EnumChildWindows(frame, MdiPick, IntPtr.Zero); }catch(Exception){}
    if(mdiClient == IntPtr.Zero) return IntPtr.Zero;
    IntPtr h = IntPtr.Zero;
    try{ h = GetWindow(mdiClient, GW_CHILD); }catch(Exception){ return IntPtr.Zero; }
    int guard = 0;
    while(h != IntPtr.Zero && guard++ < 64){
      bool vis = false;
      try{ vis = IsWindowVisible(h); }catch(Exception){}
      if(vis) return h;
      try{ h = GetWindow(h, GW_HWNDNEXT); }catch(Exception){ return IntPtr.Zero; }
    }
    return IntPtr.Zero;
  }
  /* The window a read covers, and the caption that HONESTLY names it. */
  static IntPtr ReadScope(IntPtr fg, string frameText, out string caption){
    caption = frameText == null ? "" : frameText.Trim();
    IntPtr child = ActiveMdiChild(fg);
    if(child == IntPtr.Zero) return fg;
    StringBuilder t = new StringBuilder(320);
    try{ GetWindowText(child, t, t.Capacity); }catch(Exception){}
    string own = t.ToString().Trim();
    if(own.Length > 0) caption = own;
    return child;
  }
  static IntPtr BiggestListView(IntPtr root){
    listBest = IntPtr.Zero; listBestArea = 0;
    try{ EnumChildWindows(root, ListPick, IntPtr.Zero); }catch(Exception){}
    return listBest;
  }
  static IntPtr listBest = IntPtr.Zero;
  static long listBestArea = 0;
  static bool ListPick(IntPtr h, IntPtr p){
    try{
      StringBuilder c = new StringBuilder(80);
      GetClassName(h, c, c.Capacity);
      if(c.ToString().ToUpperInvariant().IndexOf("SYSLISTVIEW32") < 0) return true;
      RECT r;
      if(!GetWindowRect(h, out r)) return true;
      long area = (long)(r.right - r.left) * (r.bottom - r.top);
      if(area > listBestArea){ listBestArea = area; listBest = h; }
    }catch(Exception){}
    return true;
  }

  static void ReadForeground(int maxRows){
    int t0 = Environment.TickCount;
    readMsgs = 0;
    IntPtr fg = GetForegroundWindow();
    if(fg == IntPtr.Zero){ READ.Append("nothing is in front.\n"); return; }
    string exe, cls, txt;
    ForegroundOf(fg, out exe, out cls, out txt);
    READ.Append("front: " + exe + " | " + cls + " | " + txt + "\n");
    if(!MatchesNeedle(exe, cls, txt)){
      READ.Append("That is not the window this is pointed at (focus=" + (focusNeedle == null ? "(none)" : focusNeedle)
                  + "). Nothing was read.\n");
      return;
    }
    string cap;
    IntPtr scope = ReadScope(fg, txt, out cap);
    /* Says which of the two it got, so a probe run answers whether the MDI scoping
       engaged at all rather than leaving it to be assumed. */
    READ.Append("list window: " + cap
                + (scope == fg ? "   (no MDI child under it — the front window itself)" : "   (the active MDI child)")
                + "\n\n");
    IntPtr lv = BiggestListView(scope);
    if(lv == IntPtr.Zero){ READ.Append("No SysListView32 anywhere in that window. Nothing was read.\n"); return; }

    IntPtr res;
    readMsgs++;
    int rows = 0;
    if(SendMessageTimeout(lv, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 250, out res) != IntPtr.Zero)
      rows = res.ToInt32();
    int cols = 0;
    readMsgs++;
    if(SendMessageTimeout(lv, LVM_GETHEADER, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 250, out res) != IntPtr.Zero
       && res != IntPtr.Zero){
      readMsgs++;
      IntPtr hres;
      if(SendMessageTimeout(res, HDM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 250, out hres) != IntPtr.Zero)
        cols = hres.ToInt32();
    }
    if(cols <= 0) cols = 8;
    if(cols > 16) cols = 16;
    READ.Append("list " + Hex(lv) + "   " + rows + " row(s), " + cols + " column(s)\n\n");
    if(rows <= 0){ READ.Append("Empty list. Nothing further was read.\n"); return; }

    uint pid;
    GetWindowThreadProcessId(lv, out pid);
    IntPtr proc = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE
                              | PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if(proc == IntPtr.Zero){
      READ.Append("Could not open that process to give the control somewhere to write.\n"
                + "Usually that means protel runs with more rights than RecCheck does.\n"
                + "Nothing was read, and nothing was left behind.\n");
      return;
    }
    /* protel's bitness decides the LVITEM layout, and getting it wrong hands the control a
       null pointer to write its answer into. So it is ESTABLISHED, never assumed:
       IsWow64Process is asked about the target AND about us, both return values are
       checked, and if either call fails the read is refused rather than guessed.

       This was wrong before the audit caught it. OpenProcess asked for no query right, so
       IsWow64Process failed silently, its BOOL was discarded, `wow` stayed false, and a
       64-bit helper laid out a 64-bit LVITEM for 32-bit protel — pszText read out of the
       alignment padding as NULL. On an owner-drawn list that null reaches protel's own
       LVN_GETDISPINFO handler. */
    bool selfWow = false, targetWow = false, okSelf = false, okTarget = false;
    try{ okSelf = IsWow64Process(GetCurrentProcess(), out selfWow); }catch(Exception){}
    try{ okTarget = IsWow64Process(proc, out targetWow); }catch(Exception){}
    if(!okSelf || !okTarget){
      READ.Append("Could not establish whether protel is 32-bit or 64-bit.\n"
                + "Guessing that decides where the list writes its answer, so nothing was read.\n");
      CloseHandle(proc);
      return;
    }
    bool osIs64 = (IntPtr.Size == 8) || selfWow;
    bool target64 = TargetIs64(osIs64, targetWow);
    READ.Append("protel is " + (target64 ? "64-bit" : "32-bit") + ", this helper is "
                + (IntPtr.Size == 8 ? "64-bit" : "32-bit") + ", Windows is "
                + (osIs64 ? "64-bit" : "32-bit") + "\n\n");

    const int CCH = 512;
    IntPtr text = VirtualAllocEx(proc, IntPtr.Zero, (UIntPtr)(CCH * 2), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    IntPtr item = VirtualAllocEx(proc, IntPtr.Zero, (UIntPtr)64, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if(text == IntPtr.Zero || item == IntPtr.Zero){
      READ.Append("Could not get a scratch page in that process. Nothing was read.\n");
      if(text != IntPtr.Zero) VirtualFreeEx(proc, text, UIntPtr.Zero, MEM_RELEASE);
      if(item != IntPtr.Zero) VirtualFreeEx(proc, item, UIntPtr.Zero, MEM_RELEASE);
      CloseHandle(proc);
      return;
    }
    int show = rows < maxRows ? rows : maxRows;
    bool wide = true, everGot = false;
    bool ranOut = false;
    /* try/FINALLY, not try/catch-then-free. A page allocated in ANOTHER process is not
       reclaimed when this one exits — it stays in protel until protel closes. So the
       frees must run on every path out of here, and the work must finish well inside the
       window in which RecCheck would kill this helper for taking too long: a kill cannot
       be caught, and it would leave those pages behind in protel for the rest of the day.
       READ_BUDGET_MS is what keeps us far away from that. */
    try{
      /* Decide the character width on the WHOLE first row, not on its first cell. A list
         whose first column is a checkbox or an icon has an empty cell 0 legitimately, and
         deciding on that alone would flip to ANSI on a Unicode control and read garbage
         for the rest of the night. Only a first row that comes back entirely empty is
         evidence of the wrong message. */
      string[] first = ReadRow(proc, lv, target64, 0, cols, text, item, CCH, true);
      if(!AnyText(first)){
        string[] alt = ReadRow(proc, lv, target64, 0, cols, text, item, CCH, false);
        if(AnyText(alt)){ wide = false; first = alt; }
      }
      everGot = AnyText(first);
      READ.Append("  row 0:  " + Join(first) + "\n");
      for(int r = 1; r < show; r++){
        if(Environment.TickCount - t0 > READ_BUDGET_MS){ ranOut = true; show = r; break; }
        string[] cells = ReadRow(proc, lv, target64, r, cols, text, item, CCH, wide);
        if(AnyText(cells)) everGot = true;
        READ.Append("  row " + r + ":  " + Join(cells) + "\n");
      }
    }catch(Exception e){ READ.Append("EXCEPTION while reading: " + e.Message + "\n"); }
    finally{
      VirtualFreeEx(proc, text, UIntPtr.Zero, MEM_RELEASE);
      VirtualFreeEx(proc, item, UIntPtr.Zero, MEM_RELEASE);
      CloseHandle(proc);
    }
    int took = Environment.TickCount - t0;
    if(ranOut)
      READ.Append("\nStopped after " + READ_BUDGET_MS + " ms rather than keep asking. protel was\n"
                + "answering slowly, and being killed mid-read would leave a page behind in it.\n");
    READ.Append("\nread " + show + " of " + rows + " row(s) as " + (wide ? "Unicode" : "ANSI") + "\n");
    READ.Append(readMsgs + " message(s) asked of protel, whole read took " + took + " ms\n");
    READ.Append("A scratch page was allocated in protel and freed again. protel's own memory\n"
              + "was never written, and every message sent was a getter.\n");
    if(!everGot)
      READ.Append("\nNOTHING CAME BACK. The list is real and counts its rows, but its text did not\n"
                + "arrive — that is the answer this probe exists to get, and it means this route\n"
                + "is the wrong one rather than that something is broken.\n");
  }
  /* The in-house list, machine-readable, and ONLY the columns RecCheck uses.
     0 name, 2 room, 4 occupancy, 5 arrival, 6 departure, 11 status — confirmed by him on
     04/09 against a real read. The group and the travel agent (12-14) are not read at
     all: he does not want them, and not reading them is also four fewer messages a row.
     Sixteen columns over 250 rows is 4000 messages; six is 1500.

     Tab-separated because ReadCell already turns any tab in a cell into a space, so a tab
     here can only be a separator. */
  /* Built element by element on purpose. A static array INITIALISER makes the compiler
     emit a <PrivateImplementationDetails> blob whose field name is a HASH OF THE CONTENTS,
     so the build guard's allow-list would need a new entry every time a column moved — and
     an allow-list that has to be regenerated is one that stops being read. */
  static int[] IhCols(){
    int[] c = new int[6];
    c[0] = IH_NAME; c[1] = IH_ROOM; c[2] = IH_OCC; c[3] = IH_ARR; c[4] = IH_DEP; c[5] = IH_STATUS;
    return c;
  }
  /* THE OTHER THREE LISTS. Their shapes all differ and none of them is the in-house one —
     confirmed against his 04/09 23:17 reads, and against the panels on protel's own home
     screen, where the Arrivals column reads Dep. and the Departures column reads Arr.

     ARRIVALS  "Arrival Report for the 04/09/26", 16 columns, name at 1 and room at 3.
               There is no arrival column: the arrival IS the report's date, in the caption.
     DEPARTURES "Departure Report for 04/09/26", 16 columns, name at 0 and room at 2, and
               the date it carries is the ARRIVAL. The departure is the report's date.
     MOVES     "Perform Move for Date 04/09/26", a #32770 dialog, 8 columns, all of them
               read because it is the narrowest list and the cheapest to take whole.
               Column 5 is protel's X — his words: "the mark that the move is okay for
               protel to visualize it". WHICH END OF THE MOVE IS WHICH IS UNCONFIRMED, so
               nothing here records a move; only the missing X is acted on. */
  static int[] ArrCols(){
    int[] c = new int[5];
    c[0] = 1; c[1] = 3; c[2] = 5; c[3] = 6; c[4] = 10;      // name, room, occ, departure, status
    return c;
  }
  static int[] DepCols(){
    int[] c = new int[5];
    c[0] = 0; c[1] = 2; c[2] = 4; c[3] = 5; c[4] = 10;      // name, room, occ, arrival, status
    return c;
  }
  static int[] MvCols(){
    int[] c = new int[8];
    for(int i = 0; i < 8; i++) c[i] = i;
    return c;
  }
  static int[] ColsFor(string tag){
    if(tag == "AR") return ArrCols();
    if(tag == "DP") return DepCols();
    if(tag == "MV") return MvCols();
    return IhCols();
  }
  static string NeedleFor(string tag){
    if(tag == "AR") return "ARRIVALREPORT";
    if(tag == "DP") return "DEPARTUREREPORT";
    if(tag == "MV") return "PERFORMMOVE";
    return "INHOUSE";
  }
  static string MissingFor(string tag){
    if(tag == "AR") return "the arrival report is not open in protel";
    if(tag == "DP") return "the departure report is not open in protel";
    if(tag == "MV") return "the move window is not open in protel";
    return "the in-house list is not open in protel";
  }
  const int IH_NAME = 0, IH_ROOM = 2, IH_OCC = 4, IH_ARR = 5, IH_DEP = 6, IH_STATUS = 11;
  /* FINDING the in-house list, without asking what is in front.

     This is the bug he found by asking the obvious question: "does it take the list from
     whatever window is in front?" It did -- and CLICKING THE BUTTON PUTS RECCHECK IN
     FRONT. So the read looked at RecCheck, saw no protel, and gave up. DEBUG's readlist
     gets away with the foreground because it counts down first and he switches over; a
     button cannot.

     So the button does not use the foreground at all. It hunts for the window BY ITS
     CAPTION -- an MDI child, under any top-level window, whose title says in-house and
     which actually has a list under it. That also makes the guard structural rather than
     a check bolted on afterwards: the wrong list cannot be read, because the right one is
     what was searched for.

     Still nothing sent to protel. Top-level enumeration, class names, captions and
     Z-order are all window-manager reads. Only the list found at the end is messaged. */
  static IntPtr ihFound = IntPtr.Zero;
  static IntPtr ihList = IntPtr.Zero;
  static string ihCaption = "";
  static uint[] ihPids = null;             // null = look everywhere, not only at protel
  /* The caption a hunt is looking for, normalised the same way on both sides so spacing
     and case cannot decide it: "Guests in-house:" and "Guests inhouse:" read alike. */
  static string huntNeedle = "INHOUSE";
  static string Squash(string s){
    if(s == null) return "";
    string u = s.ToUpperInvariant();
    StringBuilder b = new StringBuilder(u.Length);
    for(int i = 0; i < u.Length; i++){
      char c = u[i];
      if(c == ' ' || c == '-' || c == '_') continue;
      b.Append(c);
    }
    return b.ToString();
  }
  static bool CaptionMatches(string s){
    return Squash(s).IndexOf(huntNeedle) >= 0;
  }
  /* A window is the one we want only if its caption names it AND it holds a list. A
     dialog merely NAMED after a report is not the report. */
  static bool TakeIfMatch(IntPtr h){
    StringBuilder t = new StringBuilder(320);
    try{ GetWindowText(h, t, t.Capacity); }catch(Exception){}
    string cap = t.ToString().Trim();
    if(!CaptionMatches(cap)) return false;
    IntPtr lv = BiggestListView(h);
    if(lv == IntPtr.Zero) return false;
    ihFound = h; ihList = lv; ihCaption = cap;
    return true;
  }
  /* TWO ROUTES, and which one applies is decided by the window, not guessed.

     protel's reports are MDI children of the FO frame, so under a frame that has an
     MDIClient only its children are considered — testing the frame's own caption there
     would bring back the pre-v16 bug, because a maximised report puts its name on the
     frame while the biggest list under that frame may be something else entirely.

     But "Perform Move for Date 04/09/26" is a #32770 DIALOG. It is top-level, it has no
     MDIClient under it, and it names itself. So a window with no MDI client is tested on
     its own caption. His moves list is only reachable this way. */
  static bool ListUnder(IntPtr frame){
    mdiClient = IntPtr.Zero;
    try{ EnumChildWindows(frame, MdiPick, IntPtr.Zero); }catch(Exception){}
    if(mdiClient == IntPtr.Zero) return TakeIfMatch(frame);
    IntPtr h = IntPtr.Zero;
    try{ h = GetWindow(mdiClient, GW_CHILD); }catch(Exception){ return false; }
    int guard = 0;
    while(h != IntPtr.Zero && guard++ < 128){
      if(TakeIfMatch(h)) return true;
      try{ h = GetWindow(h, GW_HWNDNEXT); }catch(Exception){ return false; }
    }
    return false;
  }
  static bool TopHunt(IntPtr h, IntPtr p){
    if(ihFound != IntPtr.Zero) return false;
    try{
      if(!IsWindowVisible(h)) return true;
      if(ihPids != null){
        uint pid = 0;
        GetWindowThreadProcessId(h, out pid);
        if(!InArray(ihPids, pid)) return true;
      }
      if(ListUnder(h)) return false;
    }catch(Exception){}
    return true;
  }
  /* protel's windows first when there is a focus target to name them by, then everywhere.
     The second pass is what keeps this working for someone who never set one -- "not
     every user is me", and a helper that only works on his machine is not a helper. */
  static IntPtr FindTaggedList(string needle, out string caption){
    huntNeedle = needle;
    caption = "";
    ihFound = IntPtr.Zero; ihList = IntPtr.Zero; ihCaption = "";
    uint[] pids = ProtelPids();
    if(pids.Length > 0){
      ihPids = pids;
      try{ EnumWindows(TopHunt, IntPtr.Zero); }catch(Exception){}
    }
    if(ihFound == IntPtr.Zero){
      ihPids = null;
      try{ EnumWindows(TopHunt, IntPtr.Zero); }catch(Exception){}
    }
    caption = ihCaption;
    return ihList;
  }
  /* ---- the PING (v20) ----

     His idea, 04/09, and it is a better one than reading every cell to find out whether
     anything changed: "how feasible would it be to have a ping for the header alone and if
     it matches the departure arrival or in house list to then make the more thorough
     probe?"

     Very. And it is cheaper than it sounds, because of where the cost actually is:

       finding the window     ZERO messages. EnumWindows, GetClassName, GetWindowText and
                              GetWindow are window-manager reads; a caption of another
                              process's window comes from the cached title with no
                              WM_GETTEXT sent.
       the row count          ONE message (LVM_GETITEMCOUNT).
       the column count       TWO (LVM_GETHEADER, then HDM_GETITEMCOUNT).
       every cell after that  four operations each, two of them writes into protel's own
                              address space.

     So a ping is three messages against roughly fifteen hundred for a full read of the
     in-house list, and -- the part that matters most -- IT NEVER OPENS PROTEL'S PROCESS AND
     NEVER ALLOCATES ANYTHING IN IT. OpenProcess and VirtualAllocEx belong to the cell path
     alone. A ping leaves no footprint in protel at all.

     The column count is not decoration: each tag's column map assumes a shape, and a list
     answering to the same caption with a different one must not be read with the wrong
     map. The page refuses on the shape before it asks for a single cell. */
  static void PeekTagged(string tag){
    string cap;
    IntPtr lv = FindTaggedList(NeedleFor(tag), out cap);
    /* tagged, because a ping of all four comes back in one answer and an untagged TITLE
       would belong to whichever list the reader guessed */
    if(lv == IntPtr.Zero){ READ.Append("GONE\t" + tag + "\n"); return; }
    READ.Append("HEAD\t" + tag + "\t" + cap + "\n");
    IntPtr res;
    int rows = -1, cols = -1;
    if(SendMessageTimeout(lv, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 250, out res) != IntPtr.Zero)
      rows = res.ToInt32();
    if(SendMessageTimeout(lv, LVM_GETHEADER, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 250, out res) != IntPtr.Zero
       && res != IntPtr.Zero){
      IntPtr hres;
      if(SendMessageTimeout(res, HDM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 250, out hres) != IntPtr.Zero)
        cols = hres.ToInt32();
    }
    READ.Append("PEEK\t" + tag + "\t" + rows + "\t" + cols + "\n");
  }
  static void ReadInhouse(int maxRows){ ReadTagged("IH", maxRows); }
  static void ReadTagged(string tag, int maxRows){
    int t0 = Environment.TickCount;
    readMsgs = 0;
    string cap;
    IntPtr lv = FindTaggedList(NeedleFor(tag), out cap);
    if(lv == IntPtr.Zero){ READ.Append("ERR\t" + MissingFor(tag) + "\n"); return; }
    READ.Append("TITLE\t" + cap + "\n");
    IntPtr res;
    readMsgs++;
    int rows = 0;
    if(SendMessageTimeout(lv, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero, SMTO_ABORTIFHUNG, 250, out res) != IntPtr.Zero)
      rows = res.ToInt32();
    if(rows <= 0){ READ.Append("ERR\tthe list is empty\n"); return; }
    uint pid;
    GetWindowThreadProcessId(lv, out pid);
    IntPtr proc = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE
                              | PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    if(proc == IntPtr.Zero){ READ.Append("ERR\tprotel would not let this process read it\n"); return; }
    bool selfWow = false, targetWow = false, okSelf = false, okTarget = false;
    try{ okSelf = IsWow64Process(GetCurrentProcess(), out selfWow); }catch(Exception){}
    try{ okTarget = IsWow64Process(proc, out targetWow); }catch(Exception){}
    if(!okSelf || !okTarget){
      READ.Append("ERR\tcould not establish whether protel is 32-bit or 64-bit\n");
      CloseHandle(proc); return;
    }
    bool target64 = TargetIs64((IntPtr.Size == 8) || selfWow, targetWow);
    const int CCH = 512;
    IntPtr text = VirtualAllocEx(proc, IntPtr.Zero, (UIntPtr)(CCH * 2), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    IntPtr item = VirtualAllocEx(proc, IntPtr.Zero, (UIntPtr)64, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
    if(text == IntPtr.Zero || item == IntPtr.Zero){
      READ.Append("ERR\tno scratch page in protel\n");
      if(text != IntPtr.Zero) VirtualFreeEx(proc, text, UIntPtr.Zero, MEM_RELEASE);
      if(item != IntPtr.Zero) VirtualFreeEx(proc, item, UIntPtr.Zero, MEM_RELEASE);
      CloseHandle(proc); return;
    }
    int show = rows < maxRows ? rows : maxRows, got = 0;
    bool wide = true, ranOut = false;
    try{
      /* the encoding question, settled on the first row and then left alone */
      int[] cols = ColsFor(tag);
      /* Probe on the TAG'S OWN first column, not column 0. The arrivals list has an EMPTY
         column 0 — probing there reads nothing, and "nothing came back as Unicode" is
         exactly how this decides the control is ANSI. It would have flipped the whole
         read to the wrong encoding on the one list whose name is not first. */
      string probe0 = ReadCell(proc, lv, target64, 0, cols[0], text, item, CCH, true);
      if(probe0.Length == 0){
        string alt = ReadCell(proc, lv, target64, 0, cols[0], text, item, CCH, false);
        if(alt.Length > 0) wide = false;
      }
      for(int r = 0; r < show; r++){
        if(Environment.TickCount - t0 > READ_BUDGET_MS){ ranOut = true; break; }
        StringBuilder line = new StringBuilder(tag);
        for(int c = 0; c < cols.Length; c++)
          line.Append("\t" + ReadCell(proc, lv, target64, r, cols[c], text, item, CCH, wide));
        READ.Append(line.ToString() + "\n");
        got++;
      }
    }catch(Exception e){ READ.Append("ERR\t" + e.Message + "\n"); }
    finally{
      VirtualFreeEx(proc, text, UIntPtr.Zero, MEM_RELEASE);
      VirtualFreeEx(proc, item, UIntPtr.Zero, MEM_RELEASE);
      CloseHandle(proc);
    }
    READ.Append("DONE\t" + got + "\t" + rows + "\t" + readMsgs + "\t"
                + (Environment.TickCount - t0) + "\t" + (wide ? "unicode" : "ansi")
                + "\t" + (ranOut ? "cut-short" : "complete") + "\n");
  }

  static string[] ReadRow(IntPtr proc, IntPtr lv, bool target64, int row, int cols,
                         IntPtr text, IntPtr item, int cch, bool wide){
    string[] out2 = new string[cols];
    for(int c = 0; c < cols; c++) out2[c] = ReadCell(proc, lv, target64, row, c, text, item, cch, wide);
    return out2;
  }
  static bool AnyText(string[] cells){
    for(int i = 0; i < cells.Length; i++) if(cells[i] != null && cells[i].Length > 0) return true;
    return false;
  }
  static string Join(string[] cells){
    StringBuilder b = new StringBuilder();
    for(int i = 0; i < cells.Length; i++) b.Append("[" + cells[i] + "] ");
    return b.ToString();
  }
  static string ReadCell(IntPtr proc, IntPtr lv, bool target64, int row, int col,
                         IntPtr text, IntPtr item, int cch, bool wide){
    try{
      byte[] zero = new byte[cch * 2];
      UIntPtr n;
      WriteProcessMemory(proc, text, zero, (UIntPtr)(uint)zero.Length, out n);
      byte[] li = BuildLvItem(target64, row, col, text, cch);
      if(!WriteProcessMemory(proc, item, li, (UIntPtr)(uint)li.Length, out n)) return "";
      IntPtr res;
      readMsgs++;
      if(SendMessageTimeout(lv, wide ? LVM_GETITEMTEXTW : LVM_GETITEMTEXTA,
                            (IntPtr)row, item, SMTO_ABORTIFHUNG, 250, out res) == IntPtr.Zero) return "";
      byte[] back = new byte[cch * 2];
      if(!ReadProcessMemory(proc, text, back, (UIntPtr)(uint)back.Length, out n)) return "";
      string got = wide ? System.Text.Encoding.Unicode.GetString(back)
                        : System.Text.Encoding.Default.GetString(back);
      int z = got.IndexOf('\0');
      if(z >= 0) got = got.Substring(0, z);
      return got.Replace("\r", " ").Replace("\n", " ").Replace("\t", " ");
    }catch(Exception){ return ""; }
  }

  /* ================= the window watcher — reads nothing from protel =================
     What it records: that a protel window opened or closed, when, its class and the
     caption Windows already holds for it. No field is read, no control is asked
     anything, nothing is written anywhere near protel.

     Retention is his decision of 03/09: TONIGHT ONLY, CLEARED AT 07:00. That is the
     SHIFT boundary — the same clock as the checklist ticks — and deliberately not the
     03:30 working night: the wipe follows the shift being stood. The file names the
     shift it belongs to, so a helper restarted mid-shift keeps that night's lines and
     the first write of a new shift throws the old ones away.

     His other decision was to record the protel user where protel shows it. Nothing on
     this half exposes a user — a caption is all there is — so there is nothing to record
     yet. It arrives with the half that reads fields, and it is not to be softened. */
  /* One hook PER protel process. It used to be one hook on the first process whose name
     matched, which is fine on his PC — PROT32 is a single process — and wrong anywhere
     protel is launched as more than one. His words: "not every user is me". */
  static readonly System.Collections.Generic.Dictionary<uint, IntPtr> evHooks =
    new System.Collections.Generic.Dictionary<uint, IntPtr>();
  static WinEventProc keepEv;                    // must outlive the hooks or the GC eats it
  static volatile uint[] watchWantPids = new uint[0];
  const int WATCH_MAX_PIDS = 8;                  // a needle that matches half the machine hooks nothing silly
  static int watchSeen = 0;
  static string watchShift = "";
  static string watchCapShift = "";        // the shift the CAP is counting, kept off the log path
  /* NOT "". The empty string is what PidsKey returns for "watching nothing", which is the
     one state most worth a line — and with "" as the starting value it compared equal and
     was the only state that never printed. A sentinel no key can be. */
  static string watchPidsSaid = "?";       // the hooked set the log last named
  static string lastTitle = "";
  static Thread watchThread;

  /* 07:00, the shift boundary. Mirrors SHIFT_ROLLOVER_H in the page — change one, change
     both. Not the 03:30 working night. */
  static string ShiftKey(){
    try{ return DateTime.Now.AddHours(-7.0).ToString("yyyy-MM-dd"); }catch(Exception){ return ""; }
  }
  /* ---- reading a list THE MOMENT PROTEL OPENS IT (v21) ----

     His words, 04/09: "when a user opens protel the tool knows and scans the list opened".

     This helper is already resident -- it is what serves the tau shortcut -- and it
     already holds a WinEvent hook on protel's SHOW, HIDE and NAMECHANGE. It is therefore
     TOLD, in milliseconds, when a list appears. Nothing has to poll for it, nothing has to
     be launched, and a list he opens for two seconds is caught: the rows are taken at the
     moment it opens and written to a file, so RecCheck can pick them up long after the
     window has gone.

     THE READ DOES NOT HAPPEN IN THE CALLBACK, and that is not a detail. A WinEvent
     callback runs on the hook thread; a full read is ~1500 SendMessageTimeout calls into
     protel, and doing that inside the callback would stall the delivery of every later
     event and put a long synchronous conversation with protel in the worst possible place.
     The callback does one field write. WatchLoop -- the same thread, but between pumps --
     does the reading.

     Two guards on top, both about protel rather than about us: the same list is not re-read
     within EV_COOLDOWN_MS however many times protel shows it, and a caption that has not
     changed since the last successful read is not read again at all. */
  const int EV_COOLDOWN_MS = 4000;
  static string evWantTag = "", evWantCap = "";
  static readonly System.Collections.Generic.Dictionary<string,string> evLastCap =
    new System.Collections.Generic.Dictionary<string,string>();
  static readonly System.Collections.Generic.Dictionary<string,int> evLastAt =
    new System.Collections.Generic.Dictionary<string,int>();
  /* Which of the four a caption names, or "" for anything else. Same normalisation the
     hunt uses, so the two can never disagree about what a window is. */
  static string TagOfCaption(string cap){
    string u = Squash(cap);
    if(u.IndexOf("INHOUSE") >= 0) return "IH";
    if(u.IndexOf("PERFORMMOVE") >= 0) return "MV";
    if(u.IndexOf("ARRIVALREPORT") >= 0) return "AR";
    if(u.IndexOf("DEPARTUREREPORT") >= 0) return "DP";
    return "";
  }
  static string ListPath(string tag){
    try{
      string b = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
      if(b == null || b.Length == 0) return null;
      return System.IO.Path.Combine(System.IO.Path.Combine(b, "RecCheck"), "rc-list-" + tag + ".tsv");
    }catch(Exception){ return null; }
  }
  /* Written beside and moved, so RecCheck can never read half a list. */
  static void WriteList(string tag, string body){
    try{
      string p = ListPath(tag);
      if(p == null) return;
      System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(p));
      string tmp = p + ".tmp";
      System.IO.File.WriteAllText(tmp, body, new System.Text.UTF8Encoding(false));
      if(System.IO.File.Exists(p)) System.IO.File.Delete(p);
      System.IO.File.Move(tmp, p);
    }catch(Exception){}
  }
  /* Runs on the pump thread, never in the callback. */
  static void EvServiceReads(){
    string tag = evWantTag, cap = evWantCap;
    if(tag.Length == 0) return;
    try{
      int now = Environment.TickCount;
      int last;
      /* Inside the cooldown the request STAYS ARMED and is looked at again next tick. It
         used to be cleared before this test, so a list opened within four seconds of the
         last read of its kind was dropped, not deferred — and with the capture no longer
         riding on the log's accidental retries, a dropped request was a list never read. */
      if(evLastAt.TryGetValue(tag, out last) && now - last < EV_COOLDOWN_MS) return;
      evWantTag = "";
      string had;
      if(evLastCap.TryGetValue(tag, out had) && had == cap) return;   // same window, already taken
      evLastAt[tag] = now;
      READ = new StringBuilder();
      ReadTagged(tag, 2000);
      string body = READ.ToString();
      READ = new StringBuilder();
      /* only a read that actually produced rows replaces what is on disk */
      if(body.IndexOf("\n" + tag + "\t") >= 0 || body.StartsWith(tag + "\t")){
        evLastCap[tag] = cap;
        WriteList(tag, body);
        AppendWatch(DateTime.Now.ToString("HH:mm:ss") + "  READ   " + tag
                    + "  title=\"" + cap + "\"\r\n");
      }
    }catch(Exception e){ WriteCrash("evread", e); }
  }
  static string WatchPath(){
    try{
      string b = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
      if(b == null || b.Length == 0) return null;
      return System.IO.Path.Combine(System.IO.Path.Combine(b, "RecCheck"), "rc-tbind-watch.log");
    }catch(Exception){ return null; }
  }
  static void AppendWatch(string line){
    try{
      string p = WatchPath();
      if(p == null) return;
      string k = ShiftKey();
      System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(p));
      /* First write of this run: adopt the shift the file already names, so a restart
         mid-shift does not throw away what the shift has seen so far. */
      if(watchShift.Length == 0 && System.IO.File.Exists(p)){
        try{
          using(System.IO.StreamReader sr = new System.IO.StreamReader(p)){
            string first = sr.ReadLine();
            if(first != null && k.Length > 0 && first.IndexOf(k) >= 0) watchShift = k;
          }
        }catch(Exception){}
      }
      if(watchShift != k){
        watchShift = k;
        watchSeen = 0;
        /* the new shift's file must state what is hooked too: the HOOKS line is written
           only when the set changes, and a header rewrite is not a change of set — so
           it is asked for again here, and WatchLoop restates it on its next tick */
        watchPidsSaid = "?";
        System.IO.File.WriteAllText(p, "rc-tbind watch " + VER + "  shift of " + k
          + "  (cleared at 07:00, nothing is read from protel)\r\n");
      }
      System.IO.File.AppendAllText(p, line);
    }catch(Exception){}
  }
  /* Runs on the watcher thread. Everything it touches is message-free — see the note by
     the constants for why that is true only for TOP-LEVEL windows. */
  /* CHILD WINDOWS ARE INCLUDED. They were dropped on the belief that reading one would
     cost protel a message, and that was wrong in the way that mattered: Windows
     documents GetWindowText as returning ANOTHER PROCESS'S cached caption without
     sending WM_GETTEXT, and it is only a window owned by the CALLING process that gets
     a message. Top-level or child makes no difference to that; having a caption does.
     A child control with text but no caption comes back empty, which is exactly the
     entry we do not want anyway.

     This is why protel's reports were invisible. protel is MDI: "Departure Report for
     02/09/26" is an OWL_Window child of MDIClient, so the old guard dropped every report
     he opened and kept only popups and dialogs.

     Documented behaviour, not measured here — there is no Windows in this container. If
     the log fills with report names and protel does not slow down, it held.

     Nothing without a caption is recorded now, open or close. With children included
     that is not tidying, it is what keeps the log readable at all. */
  static void WinEventCallback(IntPtr hHook, uint ev, IntPtr hwnd, int idObject, int idChild, uint tid, uint time){
    try{
      /* The hook spans SHOW..NAMECHANGE because a name change is the one that tells us
         which report is open; everything between them is filtered out here rather than
         by a second hook per process. The marshalling is Windows' cost in OUR process,
         not protel's. */
      if(ev != EVENT_OBJECT_SHOW && ev != EVENT_OBJECT_HIDE && ev != EVENT_OBJECT_NAMECHANGE) return;
      if(idObject != OBJID_WINDOW || idChild != 0) return;   // a part of a control is not a window
      if(hwnd == IntPtr.Zero) return;
      StringBuilder cls = new StringBuilder(160), txt = new StringBuilder(320);
      try{ GetClassName(hwnd, cls, cls.Capacity); }catch(Exception){}
      try{ GetWindowText(hwnd, txt, txt.Capacity); }catch(Exception){}
      string t = txt.ToString();
      if(t.Length == 0) return;                              // no caption, nothing to say
      bool top = false;
      try{ top = (GetAncestor(hwnd, GA_ROOT) == hwnd); }catch(Exception){}
      string what = ev == EVENT_OBJECT_SHOW ? "OPEN " : (ev == EVENT_OBJECT_HIDE ? "CLOSE" : "TITLE");
      /* A LABEL IS NOT A WINDOW PROTEL OPENED.

         His log, 05/09, 04:48:51 to 04:50:12 — eighty-one seconds of one guest checking
         out — is hundreds of lines like

           TITLE  child  class="Static"  title="Amount:"
           TITLE  child  class="Button"  title="Cancel"

         protel restates every Static and Button in an invoice dialog on each repaint, and
         each one is a DIFFERENT caption, so the lastTitle de-dupe below never catches
         them. Three or more lines a second, sustained, for as long as he is working at
         the desk. The log he is meant to read "what protel opened tonight" from is
         unreadable; four thousand lines of it roll past in about twenty minutes, and on
         every build before v23 that same rate spent the shift's whole budget inside half
         an hour and left the watcher deaf until the helper was restarted.

         Only two classes here are windows in the sense the log means: OWL_Window, which
         is what protel's reports and lists are, and #32770, its dialogs. A caption change
         on anything else is a control repainting itself.

         THIS GATES THE LOG AND THE DE-DUPE, NEVER THE CAPTURE — and v24 said that while
         doing the opposite. The de-dupe's `return` sat ABOVE the tag test, so once a
         report's caption was in lastTitle every restatement of it was dropped before the
         capture could see it. In v23 the Static/Button churn kept overwriting lastTitle
         and let those restatements through by accident; v24 stopped the churn touching
         lastTitle and with it the accidental retry. A list shown before it had rows was
         read once, found empty, never marked as taken and never asked for again until
         some OTHER window changed its caption. Found by the pre-merge check of 1.17.38.

         So the capture is written FIRST, before anything here can return. It is one field
         write; EvServiceReads has its own cooldown and its own "already taken" test, so a
         restatement of a list already on disk costs a string compare and nothing else. A
         Static labelled "Amount:" was never going to name one of the four lists — but "it
         cannot match because the captions happen not to look like that" is the kind of
         reasoning that has cost him twice, so nothing below decides what is read. */
      if(ev != EVENT_OBJECT_HIDE){
        string tg = TagOfCaption(t);
        if(tg.Length > 0){ evWantCap = t; evWantTag = tg; }
      }
      bool windowish = top || cls.ToString() == "OWL_Window" || cls.ToString() == "#32770";
      /* A caption that has not actually changed is not news. protel restates the frame's
         title often; only the changes are worth a line.

         THE COUNT USED TO BE TAKEN ABOVE THIS. Every one of those restatements — the ones
         this very comment says protel makes often — spent a unit of the shift's budget
         and produced no line, so the log's own length never showed how fast the budget
         was going. Counted after, only the events that actually say something cost
         anything. */
      if(ev == EVENT_OBJECT_NAMECHANGE && windowish){
        if(t == lastTitle) return;
        lastTitle = t;
      }
      /* THE CAP IS ON THE LOG, AND ON NOTHING ELSE.

         It used to sit at the top of this callback, above everything, and its only reset
         lived inside AppendWatch — which the cap itself made unreachable. So the four
         thousandth captioned event of the run did not end a shift's logging: it ended the
         watcher. No more lines, and no more evWantTag either, which is the field the whole
         automatic feed hangs on. The 07:00 reset could never fire again because the only
         code that could fire it was behind the return. The helper starts at login and is
         not restarted, so this was a one-way switch: some hours into a day protel could be
         opened all night and RecCheck would be told nothing, with an empty watch log as
         the only sign.

         The cap's stated purpose is to keep the log readable for one shift. So that is all
         it does now — the capture below is guarded by its own cooldown and its own
         caption check, and goes on working. */
      if(windowish && watchSeen < WATCH_MAX){
        /* Counted only while it is still being spent. Incrementing past the cap for the
           life of the process would leave an int climbing all day for no purpose, and an
           int that wraps starts logging again. */
        watchSeen++;
        AppendWatch(DateTime.Now.ToString("HH:mm:ss") + "  " + what
          + "  " + (top ? "window" : "child ") + "  class=\"" + cls.ToString() + "\"  title=\"" + t + "\"\r\n");
      }
      /* The capture request was written above, before the log could return early: this is
         the hook thread and the read is a long conversation with protel, so WatchLoop
         picks it up between pumps. */
    }catch(Exception){}
  }
  /* protel's process id, or 0. With no focus= target configured there is no protel to
     identify, and the watcher stays off rather than logging the whole desktop. */
  /* EVERY process matching the needle, not the first one found. With no focus= target
     configured there is no protel to identify, and the watcher stays off rather than
     logging the whole desktop. */
  static uint[] ProtelPids(){
    string needle = focusNeedle;
    if(needle == null || needle.Length == 0) return new uint[0];
    System.Collections.Generic.List<uint> found = new System.Collections.Generic.List<uint>();
    try{
      Process[] all = Process.GetProcesses();
      for(int i = 0; i < all.Length; i++){
        try{
          if(found.Count < WATCH_MAX_PIDS){
            string n = all[i].ProcessName;
            if(n != null && n.ToUpperInvariant().IndexOf(needle) >= 0) found.Add((uint)all[i].Id);
          }
        }catch(Exception){}
        try{ all[i].Dispose(); }catch(Exception){}
      }
    }catch(Exception){ return new uint[0]; }
    return found.ToArray();
  }
  /* Its own thread and its own pump. An out-of-context WinEvent is delivered to the
     thread that installed the hook and needs a message loop to arrive; PeekMessage is a
     message loop. A 100 ms tick is far inside the 400 ms the design waits before reading
     anything, and keeps every part of this off the thread the shortcuts live on. */
  static bool InArray(uint[] a, uint v){
    for(int i = 0; i < a.Length; i++) if(a[i] == v) return true;
    return false;
  }
  static string PidsKey(uint[] a){
    StringBuilder b = new StringBuilder();
    for(int i = 0; i < a.Length; i++){ if(i > 0) b.Append(","); b.Append(a[i]); }
    return b.ToString();
  }
  static void WatchLoop(){
    MSG m;
    keepEv = WinEventCallback;                                          // once, and it stays alive
    try{ PeekMessage(out m, IntPtr.Zero, 0, 0, 0); }catch(Exception){}   // force the queue to exist
    for(;;){
      try{
        /* The shift boundary for the CAP, decided here rather than inside AppendWatch.
           Where it used to live, the cap it resets could stop it being reached at all. */
        string sk = ShiftKey();
        if(watchCapShift != sk){ watchCapShift = sk; watchSeen = 0; }
        uint[] want = watchWantPids;
        /* processes that have gone away, or stopped matching */
        System.Collections.Generic.List<uint> drop = new System.Collections.Generic.List<uint>();
        foreach(uint have in evHooks.Keys) if(!InArray(want, have)) drop.Add(have);
        for(int i = 0; i < drop.Count; i++){
          IntPtr h = evHooks[drop[i]];
          if(h != IntPtr.Zero) UnhookWinEvent(h);
          evHooks.Remove(drop[i]);
        }
        /* processes newly worth watching */
        for(int i = 0; i < want.Length; i++){
          if(evHooks.ContainsKey(want[i])) continue;
          IntPtr h = SetWinEventHook(EVENT_OBJECT_SHOW, EVENT_OBJECT_NAMECHANGE, IntPtr.Zero, keepEv,
                                     want[i], 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);
          if(h != IntPtr.Zero) evHooks[want[i]] = h;
        }
        /* WHETHER IT IS WATCHING ANYTHING AT ALL, said out loud.

           The hooks went on and off in silence, so a watcher holding nothing and a protel
           nobody touched wrote the same empty log — and DEBUG then printed "Nothing
           recorded this shift", which is a claim about protel made from no evidence. This
           is the helper stating what it holds: no message is sent anywhere, the pids are
           already in hand, and it is one line only when the set changes. */
        /* WHAT IS HOOKED, not what was wanted. SetWinEventHook can answer null — a pid
           that exited between the scan and the call, or Windows refusing — and the line
           used to be built from `want`, so it could name a process on which no hook
           existed. It names the hooked set now, and the wanted-but-refused set apart. */
        System.Collections.Generic.List<uint> hookedL = new System.Collections.Generic.List<uint>();
        foreach(uint have in evHooks.Keys) hookedL.Add(have);
        uint[] hooked = hookedL.ToArray();
        System.Collections.Generic.List<uint> missedL = new System.Collections.Generic.List<uint>();
        for(int i = 0; i < want.Length; i++) if(!evHooks.ContainsKey(want[i])) missedL.Add(want[i]);
        string pk = PidsKey(hooked), mk = PidsKey(missedL.ToArray());
        string said = pk + "|" + mk;
        if(said != watchPidsSaid){
          watchPidsSaid = said;
          AppendWatch(DateTime.Now.ToString("HH:mm:ss") + "  HOOKS  "
            + (hooked.Length == 0
               ? "watching nothing \u2014 " + (want.Length == 0
                   ? (focusNeedle == null || focusNeedle.Length == 0
                      ? "no protel target is set (PROTEL SHORTCUTS \u2192 point it at protel)"
                      : "no running process matches \"" + focusNeedle + "\"")
                   : "Windows refused the hook on " + mk)
               : hooked.Length + " protel process(es): " + pk
                 + (missedL.Count > 0 ? "  (could not hook: " + mk + ")" : "")) + "\r\n");
        }
        while(PeekMessage(out m, IntPtr.Zero, 0, 0, PM_REMOVE)){
          TranslateMessage(ref m);
          DispatchMessage(ref m);
        }
        /* AFTER the pump, so the queue is drained before a read that takes tens of
           milliseconds, and outside the callback for the reason given at EvServiceReads. */
        EvServiceReads();
      }catch(Exception e){ WriteCrash("watch", e); }
      Thread.Sleep(100);
    }
  }

  static string ExePath(){
    try{ return Process.GetCurrentProcess().MainModule.FileName; }catch(Exception){ return null; }
  }
  static bool BootOn(){
    try{
      RegistryKey k = Registry.CurrentUser.OpenSubKey(RUNK, false);
      if(k == null) return false;
      object v = k.GetValue(RUNV);
      k.Close();
      return v != null;
    }catch(Exception){ return false; }
  }
  static bool BootSet(bool on){
    try{
      RegistryKey k = Registry.CurrentUser.CreateSubKey(RUNK);
      if(k == null) return false;
      if(on){
        string x = ExePath();
        if(x == null){ k.Close(); return false; }
        k.SetValue(RUNV, "\"" + x + "\" run");
      }else{
        try{ k.DeleteValue(RUNV, false); }catch(Exception){}
      }
      k.Close();
      return true;
    }catch(Exception){ return false; }
  }
  static bool AlreadyRunning(){ return FindWindow(CAPS_CLASS, null) != IntPtr.Zero; }
  static void StopRunning(){
    IntPtr other = FindWindow(CAPS_CLASS, null);
    if(other != IntPtr.Zero) PostMessage(other, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
  }
  static void SpawnSelf(){
    try{
      string x = ExePath();
      if(x == null) return;
      ProcessStartInfo si = new ProcessStartInfo(x, "run");
      si.UseShellExecute = false;
      si.CreateNoWindow = true;
      Process.Start(si);
    }catch(Exception){}
  }
  /* UTF-8 bytes, straight to the handle. Console.Out would encode through the console's
     code page, which on a Greek Windows is not UTF-8 — and RecCheck reads this pipe as
     UTF-8, so a guest name with Greek letters came back as mojibake. Nothing had carried
     a non-ASCII character out of here until the list read did, which is why it never
     showed. The stream is opened once and never disposed: Say is called more than once
     per run, and disposing it would silence everything after the first line. */
  static System.IO.Stream stdoutRaw = null;
  static void Say(string t){
    try{
      if(stdoutRaw == null) stdoutRaw = Console.OpenStandardOutput();
      byte[] b = new System.Text.UTF8Encoding(false).GetBytes(t + "\n");
      stdoutRaw.Write(b, 0, b.Length);
      stdoutRaw.Flush();
    }catch(Exception){}
  }

  const string VER = "v25";

  static int Main(string[] args){
    int parentPid;
    /* ---- the login entry. HKCU, so no admin and nothing is "installed". ---- */
    if(args.Length >= 1 && args[0] == "status"){
      Say("RCTBIND " + (BootOn() ? "on" : "off") + " "
                     + (AlreadyRunning() ? "running" : "stopped") + " " + VER);
      return 0;
    }
    if(args.Length >= 1 && args[0] == "install"){
      bool ok = BootSet(true);
      if(!AlreadyRunning()) SpawnSelf();
      Say("RCTBIND " + (ok ? "on" : "on-failed") + " running " + VER);
      return ok ? 0 : 1;
    }
    if(args.Length >= 1 && args[0] == "stop"){
      /* Stand down without touching the login entry. RecCheck asks for this while it
         listens for a button to bind, so the standalone's own hooks cannot swallow the
         press being detected. It is started again the moment detection finishes. */
      StopRunning();
      Say("RCTBIND " + (BootOn() ? "on" : "off") + " stopped " + VER);
      return 0;
    }
    if(args.Length >= 1 && args[0] == "uninstall"){
      bool ok = BootSet(false);
      StopRunning();
      Say("RCTBIND " + (ok ? "off" : "off-failed") + " stopped " + VER);
      return ok ? 0 : 1;
    }
    if(args.Length >= 1 && args[0] == "run"){
      ClearCrash();
      try{
        AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs ue){
          WriteCrash("unhandled", ue.ExceptionObject as Exception);
        };
      }catch(Exception){}
      try{ return RunStandalone(); }
      catch(Exception e){ WriteCrash("run", e); return 5; }
    }
    if(args.Length >= 2 && args[0] == "scan"){
      /* Read-only, one shot, installs nothing. Waits so the user can bring the window
         they care about to the front, then reports what it is built from. */
      int spid;
      if(!int.TryParse(args[1], out spid)) return 2;
      int swait = 5000;
      if(args.Length >= 3) int.TryParse(args[2], out swait);
      if(swait < 0) swait = 0;
      if(swait > 60000) swait = 60000;
      Thread.Sleep(swait);
      SCAN = new StringBuilder();
      try{ ScanForeground(); }catch(Exception e){ SCAN.Append("EXCEPTION: " + e.Message + "\n"); }
      /* NOT TrimEnd(): mcs binds it happily here, and whether .NET Framework 4.8 has the
         same overload is exactly the bet that killed ParseBind once. Say() adds its own
         newline and a spare one costs nothing. */
      Say(SCAN.ToString());
      return 0;
    }
    /* What protel opened tonight. Nothing was read from protel to produce it — see the
       note by the WinEvent constants. */
    /* Read a few rows out of the list in front. Not free — it says so itself. */
    if(args.Length >= 2 && args[0] == "readlist"){
      int rpid;
      if(!int.TryParse(args[1], out rpid)) return 2;
      int rwait = 5000, rmax = 5;
      if(args.Length >= 3) int.TryParse(args[2], out rwait);
      if(args.Length >= 4) int.TryParse(args[3], out rmax);
      if(rwait < 0) rwait = 0;
      if(rwait > 60000) rwait = 60000;
      if(rmax < 1) rmax = 1;
      if(rmax > 50) rmax = 50;
      LoadBinds();                       // so focus= is known and the gate can refuse
      Thread.Sleep(rwait);
      READ = new StringBuilder();
      READ.Append("rc-tbind " + VER + " list read  " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "\n");
      try{ ReadForeground(rmax); }catch(Exception e){ READ.Append("EXCEPTION: " + e.Message + "\n"); }
      Say(READ.ToString());
      return 0;
    }
    /* The overlay RecCheck runs from a copy of this exe in TEMP, just before it exits so
       the installer can replace it. Takes no parent pid: by design nothing is alive to
       be a parent by the time it matters. */
    if(args.Length >= 1 && args[0] == "splash"){
      int secs = 240;
      if(args.Length >= 2) int.TryParse(args[1], out secs);
      return RunSplash(secs);
    }
    /* The ping: which window is open, how many rows, how many columns. Three messages and
       nothing written anywhere. Everything else waits on what this says. */
    if(args.Length >= 2 && args[0] == "peek"){
      int ppid;
      if(!int.TryParse(args[1], out ppid)) return 2;
      string ptag = args.Length >= 3 ? args[2].ToUpperInvariant() : "ALL";
      LoadBinds();
      READ = new StringBuilder();
      /* All four in ONE process. The window sweep is the same pass whichever list is being
         looked for, and a launch of this exe costs his machine far more than the three
         messages a ping costs protel -- so asking about four lists at once is most of the
         saving, not the ping itself. */
      if(ptag == "ALL"){
        string[] tags = new string[4];
        tags[0] = "IH"; tags[1] = "MV"; tags[2] = "AR"; tags[3] = "DP";
        for(int i = 0; i < tags.Length; i++){
          try{ PeekTagged(tags[i]); }
          catch(Exception e){ READ.Append("ERR\t" + tags[i] + "\t" + e.Message + "\n"); }
        }
      }else{
        if(ptag != "IH" && ptag != "MV" && ptag != "AR" && ptag != "DP") ptag = "IH";
        try{ PeekTagged(ptag); }catch(Exception e){ READ.Append("ERR\t" + e.Message + "\n"); }
      }
      Say(READ.ToString());
      return 0;
    }
    /* The other three lists, same machinery and the same TSV. Their tags are what the
       page keys on, and each hunts its own caption. */
    if(args.Length >= 2 && (args[0] == "moves" || args[0] == "arrivals" || args[0] == "departures")){
      int tpid;
      if(!int.TryParse(args[1], out tpid)) return 2;
      int twait = 0, tmax = 400;
      if(args.Length >= 3) int.TryParse(args[2], out twait);
      if(args.Length >= 4) int.TryParse(args[3], out tmax);
      if(twait < 0) twait = 0;
      if(twait > 60000) twait = 60000;
      if(tmax < 1) tmax = 1;
      if(tmax > 2000) tmax = 2000;
      LoadBinds();
      if(twait > 0) Thread.Sleep(twait);
      READ = new StringBuilder();
      string tg = args[0] == "moves" ? "MV" : (args[0] == "arrivals" ? "AR" : "DP");
      try{ ReadTagged(tg, tmax); }catch(Exception e){ READ.Append("ERR\t" + e.Message + "\n"); }
      Say(READ.ToString());
      return 0;
    }
    /* The in-house list, straight into RecCheck. Same cost as readlist, fewer columns. */
    if(args.Length >= 2 && args[0] == "inhouse"){
      int ipid;
      if(!int.TryParse(args[1], out ipid)) return 2;
      int iwait = 0, imax = 400;
      if(args.Length >= 3) int.TryParse(args[2], out iwait);
      if(args.Length >= 4) int.TryParse(args[3], out imax);
      if(iwait < 0) iwait = 0;
      if(iwait > 60000) iwait = 60000;
      if(imax < 1) imax = 1;
      if(imax > 2000) imax = 2000;
      LoadBinds();
      if(iwait > 0) Thread.Sleep(iwait);
      READ = new StringBuilder();
      try{ ReadInhouse(imax); }catch(Exception e){ READ.Append("ERR\t" + e.Message + "\n"); }
      Say(READ.ToString());
      return 0;
    }
    if(args.Length >= 1 && args[0] == "watchlog"){
      try{
        string wp = WatchPath();
        if(wp == null || !System.IO.File.Exists(wp)) Say("(nothing recorded this shift)");
        else Say(System.IO.File.ReadAllText(wp));
      }catch(Exception e){ Say("watchlog failed: " + e.Message); }
      return 0;
    }
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
    }else if(args.Length >= 2 && args[0] == "fg"){
      /* What is in front right now — so the app can point the gate at protel from the
         real window rather than from a guess about what it is called. */
      if(!int.TryParse(args[1], out parentPid)) return 2;
      int fwait = 5000;
      if(args.Length >= 3) int.TryParse(args[2], out fwait);
      if(fwait < 0) fwait = 0;
      if(fwait > 60000) fwait = 60000;
      Thread.Sleep(fwait);
      try{
        IntPtr fg = GetForegroundWindow();
        string exe, cls, txt;
        ForegroundOf(fg, out exe, out cls, out txt);
        Console.Out.Write("FG\t" + exe + "\t" + cls + "\t" + txt + "\n");
        Console.Out.Flush();
      }catch(Exception){}
      return 0;
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

  /* THE STANDALONE. No parent, no watchdog that kills it: it starts at login and stays
     until Windows goes down or someone asks it to stop. */
  static int RunStandalone(){
    mainTid = GetCurrentThreadId();
    mode = 2;
    if(AlreadyRunning()) return 0;             // one instance; a boot launch wins
    /* Not fatal. Without the window there is no Caps Lock icon and no cross-process
       single-instance check, but the shortcuts still work, which matters more. */
    if(!CreateCapsWindow()) WriteCrash("caps-window", null);

    LoadBinds();
    BindsChanged();                            // prime the timestamp against a re-read

    IntPtr mod = GetModuleHandle(null);
    keepMouse = MouseCallback;
    keepKeys  = KeyCallback;
    /* the keyboard hook is unconditional: Caps Lock is this program's other job */
    kbHook = SetWindowsHookEx(WH_KEYBOARD_LL, keepKeys, mod, 0);
    if(kbHook == IntPtr.Zero) return 3;
    SetHost(HostRunning());                    // installs the mouse hook if RecCheck is up

    /* The window watcher lives on its own thread so nothing it does can delay a
       low-level hook callback and get the shortcuts torn down by Windows. */
    /* Answered once here so the watcher's first line names what it really found. The
       watchdog answers it again every two seconds; without this the first HOOKS line is
       always "watching nothing", because the watchdog has not run yet. */
    try{ watchWantPids = ProtelPids(); }catch(Exception){}
    watchThread = new Thread(new ThreadStart(WatchLoop));
    watchThread.IsBackground = true;
    watchThread.Start();

    watchdog = new Thread(delegate(){          // independent of the loop, by design
      for(;;){
        Thread.Sleep(2000);
        try{
          bool up = HostRunning();
          if(up != hostUp) PostUi(WM_APP_HOST, (IntPtr)(up ? 1 : 0));
          if(BindsChanged()) PostUi(WM_APP_BINDS, IntPtr.Zero);
          /* Which processes to watch, re-answered every two seconds: protel restarts, and
             a stale pid watches nothing. Costs one process enumeration, same as the
             RecCheck check above it. */
          watchWantPids = ProtelPids();
        }catch(Exception){}
      }
    });
    watchdog.IsBackground = true;
    watchdog.Start();

    MSG m;
    while(GetMessage(out m, IntPtr.Zero, 0, 0) > 0){
      /* One bad message must not cost the user their shortcuts for the rest of the
         night. Record it and keep pumping. */
      try{
        if(m.message == WM_APP_SEND){ QueueSend(m.wParam.ToInt32()); continue; }
        if(m.message == WM_APP_BLOCK){ LogBlocked(); continue; }
        /* These normally arrive at the window and are handled in CapsWndProc. They only
           come through here when there is no window — see PostUi. */
        if(m.hwnd == IntPtr.Zero){
          if(m.message == WM_APP_CAPS){ CapsFlash(); continue; }
          if(m.message == WM_APP_HOST){ SetHost(m.wParam != IntPtr.Zero); continue; }
          if(m.message == WM_APP_BINDS){ LoadBinds(); continue; }
        }
        TranslateMessage(ref m);
        DispatchMessage(ref m);
      }catch(Exception e){ WriteCrash("loop", e); }
    }
    if(hook   != IntPtr.Zero) UnhookWindowsHookEx(hook);
    if(kbHook != IntPtr.Zero) UnhookWindowsHookEx(kbHook);
    return 0;
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
        if(msg.message == WM_APP_BLOCK){ LogBlocked(); continue; }
        TranslateMessage(ref msg);
        DispatchMessage(ref msg);
      }catch(Exception e){ WriteCrash("loop", e); }
    }
    if(hook != IntPtr.Zero) UnhookWindowsHookEx(hook);
    if(kbHook != IntPtr.Zero) UnhookWindowsHookEx(kbHook);
    return 0;
  }
}
