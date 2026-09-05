/* The helper's capture path — WinEventCallback and EvServiceReads — driven as SHIPPED.

   Nothing here could be exercised until now: the callback needs user32. This lifts the
   whole of app/tbind.cs by text, replaces exactly three user32 calls (GetClassName,
   GetWindowText, GetAncestor) with a fake window table, replaces the list reader, the
   file writer, the log writer and the clock with fakes that record, renames Main, and
   appends a Main of its own inside the class — then compiles the result with mcs and runs
   it under Mono. Everything that decides what is read is the real code.

   What it holds the line on, in the order the faults were found:
   * v24 put the log's de-dupe ABOVE the capture request, so a report shown before it had
     rows was read once, found empty, and never asked for again; v25 writes the request
     first, and a request landing inside the 4 s cooldown waits instead of being dropped.
   * v26, his decision of 05/09 — "re-read on a real open, keep the 4s cooldown": a SHOW
     of a list whose caption was already taken is read again; a NAMECHANGE restating an
     unchanged caption still is not; and a restatement arriving while an open is waiting
     out the cooldown must not lose the open.
   * A Static or Button restating its label never arms a read, and never reaches the log.

   Skipped, with a line saying so, where there is no mcs. */
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
const which = b => { try{ cp.execSync("command -v " + b, {stdio: "ignore"}); return true; }catch(e){ return false; } };
if(!which("mcs") || !which("mono")){ console.log("  skipped — no mcs/mono on this machine"); process.exit(0); }

let src = fs.readFileSync("app/tbind.cs", "utf8");
const rep = (re, to, what) => { const n = (src.match(re) || []).length; if(n !== 1) throw new Error("rig: expected 1 match for " + what + ", found " + n); src = src.replace(re, to); };
rep(/\[DllImport\("user32\.dll"\)\] static extern IntPtr GetAncestor\(IntPtr h, uint flags\);/,
    'static IntPtr GetAncestor(IntPtr h, uint flags){ return FAKE.Root(h); }', "GetAncestor");
rep(/\[DllImport\("user32\.dll", CharSet = CharSet\.Unicode\)\] static extern int GetWindowText\(IntPtr hWnd, StringBuilder s, int n\);/,
    'static int GetWindowText(IntPtr hWnd, StringBuilder s, int n){ s.Append(FAKE.Title(hWnd)); return s.Length; }', "GetWindowText");
rep(/\[DllImport\("user32\.dll", CharSet = CharSet\.Unicode\)\] static extern int GetClassName\(IntPtr hWnd, StringBuilder s, int n\);/,
    'static int GetClassName(IntPtr hWnd, StringBuilder s, int n){ s.Append(FAKE.Cls(hWnd)); return s.Length; }', "GetClassName");
rep(/static void ReadTagged\(string tag, int maxRows\)\{/, 'static void ReadTaggedReal(string tag, int maxRows){', "ReadTagged");
rep(/static void WriteList\(string tag, string body\)\{/, 'static void WriteListReal(string tag, string body){', "WriteList");
rep(/static void AppendWatch\(string line\)\{/, 'static void AppendWatchReal(string line){', "AppendWatch");
rep(/static int Main\(string\[\] args\)\{/, 'static int RealMain(string[] args){', "Main");
src = src.replace(/Environment\.TickCount/g, "FAKE.Now()");

const rig = `
  /* ---- the rig: what the test controls ---- */
  static class FAKE {
    public static int now = 100000;
    public static int Now(){ return now; }
    public static System.Collections.Generic.Dictionary<IntPtr,string[]> win = new System.Collections.Generic.Dictionary<IntPtr,string[]>(); // hwnd -> {cls, title, root}
    public static System.Collections.Generic.Dictionary<string,string[]> rows = new System.Collections.Generic.Dictionary<string,string[]>();
    public static System.Collections.Generic.List<string> reads = new System.Collections.Generic.List<string>();
    public static System.Collections.Generic.List<string> written = new System.Collections.Generic.List<string>();
    public static System.Collections.Generic.List<string> log = new System.Collections.Generic.List<string>();
    public static string Cls(IntPtr h){ return win.ContainsKey(h) ? win[h][0] : ""; }
    public static string Title(IntPtr h){ return win.ContainsKey(h) ? win[h][1] : ""; }
    public static IntPtr Root(IntPtr h){ return win.ContainsKey(h) ? new IntPtr(int.Parse(win[h][2])) : h; }
  }
  static void ReadTagged(string tag, int maxRows){
    FAKE.reads.Add(tag);
    READ.Append("TITLE\\tfake " + tag + "\\n");
    string[] r; if(!FAKE.rows.TryGetValue(tag, out r) || r.Length == 0){ READ.Append("ERR\\tthe list is empty\\n"); return; }
    foreach(string x in r) READ.Append(tag + "\\t" + x + "\\n");
    READ.Append("DONE\\t" + r.Length + "\\t" + r.Length + "\\t9\\t5\\tunicode\\tcomplete\\n");
  }
  static void WriteList(string tag, string body){ FAKE.written.Add(tag); }
  static void AppendWatch(string line){ FAKE.log.Add(line); }

  static int bad = 0;
  static void Ck(string l, bool ok){ if(!ok) bad++; Console.WriteLine("  " + (ok ? "ok  " : "FAIL") + "  " + l); }
  static void Fire(uint ev, int h){ WinEventCallback(IntPtr.Zero, ev, new IntPtr(h), OBJID_WINDOW, 0, 0, 0); }
  static int Main(string[] args){
    const int FRAME = 10, DP = 11, STATIC = 12, BTN = 13, IH = 14;
    FAKE.win[new IntPtr(FRAME)]  = new string[]{"FO", "Kernos Hotel  protel Hotel Management Suite 2024", "10"};
    FAKE.win[new IntPtr(DP)]     = new string[]{"OWL_Window", "Departure Report for 05/09/26", "10"};
    FAKE.win[new IntPtr(STATIC)] = new string[]{"Static", "Amount:", "10"};
    FAKE.win[new IntPtr(BTN)]    = new string[]{"Button", "Cancel", "10"};
    FAKE.win[new IntPtr(IH)]     = new string[]{"OWL_Window", "Guests inhouse: 05/09/26", "10"};
    FAKE.rows["DP"] = new string[0];                       // shown before protel filled it
    FAKE.rows["IH"] = new string[]{"A\\t101\\t2/0/0/0/0\\t01/09/26\\t07/09/26\\tCI"};

    /* 1. a report shown empty: read once, nothing written, not marked taken */
    Fire(EVENT_OBJECT_SHOW, DP); EvServiceReads();
    Ck("a shown report is read", FAKE.reads.Count == 1 && FAKE.reads[0] == "DP");
    Ck("an empty read writes no file", FAKE.written.Count == 0);
    Ck("and is not marked as taken", !evLastCap.ContainsKey("DP"));

    /* 2. protel fills it and restates the caption after control churn (v25: the capture
          is written before the log's de-dupe can return) */
    FAKE.rows["DP"] = new string[]{"BAUMGARTNER ROLF\\t534\\t2/0/0/0/0\\t26/08/26\\tCO"};
    Fire(EVENT_OBJECT_NAMECHANGE, STATIC); Fire(EVENT_OBJECT_NAMECHANGE, BTN);
    Fire(EVENT_OBJECT_NAMECHANGE, DP);
    Ck("a restatement of an untaken caption arms the read, whatever the log did", evWant.ContainsKey("DP"));
    FAKE.now += 1000; EvServiceReads();
    Ck("inside the cooldown the request waits", FAKE.reads.Count == 1 && evWant.ContainsKey("DP"));
    FAKE.now += 4000; EvServiceReads();
    Ck("and is served once the cooldown has passed", FAKE.reads.Count == 2 && FAKE.written.Count == 1);
    Ck("a read with rows marks the caption taken", evLastCap.ContainsKey("DP"));
    Ck("and the request is cleared", evWant.Count == 0);

    /* 3. the open window restates its unchanged caption: not read again */
    Fire(EVENT_OBJECT_NAMECHANGE, DP); FAKE.now += 5000; EvServiceReads();
    Ck("a restatement of a taken caption is not re-read", FAKE.reads.Count == 2);

    /* 4. HIS DECISION, 05/09: a real open re-reads. He closes it and opens it again;
          the caption is the same, the rows may not be. */
    Fire(EVENT_OBJECT_HIDE, DP);
    Ck("a close arms nothing", evWant.Count == 0);
    Fire(EVENT_OBJECT_SHOW, DP); FAKE.now += 5000; EvServiceReads();
    Ck("a SHOW of a taken caption IS read again - a real open", FAKE.reads.Count == 3 && FAKE.written.Count == 2);

    /* 5. an open inside the cooldown waits, and a restatement arriving meanwhile must not
          turn it back into a restatement */
    Fire(EVENT_OBJECT_HIDE, DP); Fire(EVENT_OBJECT_SHOW, DP);
    FAKE.now += 1000; EvServiceReads();
    Ck("an open inside the cooldown waits", FAKE.reads.Count == 3 && evWant.ContainsKey("DP"));
    Fire(EVENT_OBJECT_NAMECHANGE, DP);                    // protel restates while it waits
    FAKE.now += 4000; EvServiceReads();
    Ck("and is still an open when served: read again", FAKE.reads.Count == 4);

    /* 5b. TWO LISTS: an open of one list waiting out its cooldown must not be lost to a
           restatement of the other — the single slot did exactly that */
    Fire(EVENT_OBJECT_HIDE, DP); Fire(EVENT_OBJECT_SHOW, DP);
    FAKE.now += 1000; EvServiceReads();
    Ck("the open waits", FAKE.reads.Count == 4 && evWant.ContainsKey("DP"));
    FAKE.win[new IntPtr(IH)][1] = "Guests inhouse: 05/09/26";
    Fire(EVENT_OBJECT_NAMECHANGE, IH);                    // the other window restates
    Ck("the other list's request sits beside it, not over it", evWant.ContainsKey("DP") && evWant.ContainsKey("IH"));
    FAKE.now += 4000; EvServiceReads(); EvServiceReads();
    Ck("and the waiting open is still read", FAKE.reads.Count >= 5 && FAKE.reads.Contains("DP"));
    int afterTwo = FAKE.reads.Count;
    FAKE.reads.Clear(); FAKE.written.Clear();

    /* 6. controls never arm; a different list does */
    Fire(EVENT_OBJECT_NAMECHANGE, STATIC); Fire(EVENT_OBJECT_SHOW, BTN);
    Ck("a Static or Button never arms a read", evWant.Count == 0);
    Fire(EVENT_OBJECT_SHOW, IH); FAKE.now += 5000; EvServiceReads();
    Ck("the in-house list is read on its own tag", FAKE.reads.Count == 1 && FAKE.reads[0] == "IH" && FAKE.written.Count == 1);

    /* 7. the log: windows only, one line per caption change */
    int before = FAKE.log.Count;
    Fire(EVENT_OBJECT_NAMECHANGE, STATIC); Fire(EVENT_OBJECT_NAMECHANGE, BTN);
    Ck("control restatements do not reach the log", FAKE.log.Count == before);
    FAKE.win[new IntPtr(DP)][1] = "Departure Report for 06/09/26";
    Fire(EVENT_OBJECT_NAMECHANGE, DP); Fire(EVENT_OBJECT_NAMECHANGE, DP);
    Ck("a window's caption change is logged once", FAKE.log.Count == before + 1);

    /* 8. the watcher's target comes from its own line, and an old binds file with only
          focus= still works (helper v27) */
    string bp = BindsPath();
    System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(bp));
    System.IO.File.WriteAllText(bp, "# test\\r\\nwatch=prot32\\r\\n");
    LoadBinds();
    Ck("watch= alone sets the watcher's target and no gate", WatchTarget() == "PROT32" && focusNeedle == null);
    System.IO.File.WriteAllText(bp, "focus=prot32\\r\\n");
    LoadBinds();
    Ck("an old file with only focus= still gives the watcher a target", WatchTarget() == "PROT32" && focusNeedle == "PROT32");
    System.IO.File.WriteAllText(bp, "focus=prot32\\r\\nwatch=other\\r\\n");
    LoadBinds();
    Ck("when both are present the watcher takes its own", WatchTarget() == "OTHER" && focusNeedle == "PROT32");
    System.IO.File.WriteAllText(bp, "# nothing picked\\r\\n");
    LoadBinds();
    Ck("nothing picked, nothing watched", WatchTarget() == null);

    Console.WriteLine(bad > 0 ? "\\n" + bad + " FAILURES" : "\\nall pass");
    return bad > 0 ? 1 : 0;
  }
`;
const end = src.lastIndexOf("}");
src = src.slice(0, end) + rig + "\n}\n";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcev-"));
fs.writeFileSync(path.join(dir, "rig.cs"), src);
try{
  cp.execSync("mcs -nowarn:0219,0414,0169,0649,0162 -out:" + path.join(dir, "evflow.exe") + " " + path.join(dir, "rig.cs"), {stdio: ["ignore", "pipe", "pipe"]});
}catch(e){ console.log("  rig does not compile:\n" + (e.stderr || e.stdout || "").toString().split("\n").filter(l => /error/.test(l)).slice(0, 8).join("\n")); process.exit(1); }
const r = cp.spawnSync("mono", [path.join(dir, "evflow.exe")], {encoding: "utf8", env: Object.assign({}, process.env, {HOME: dir})});
process.stdout.write(r.stdout || ""); if(r.stderr) process.stderr.write(r.stderr);
process.exit(r.status === 0 ? 0 : 1);
