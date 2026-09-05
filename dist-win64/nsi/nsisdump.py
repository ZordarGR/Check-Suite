#!/usr/bin/env python3
"""
nsisdump.py - decode the header of an NSIS 3 Unicode installer (solid LZMA).

Written 2026-09-05 to reconstruct RecCheck's lost reccheck.nsi from the
shipped 1.17.38 installer.  Everything here is written from knowledge of
NSIS 3.09  Source/exehead/fileform.h,  Source/exehead/util.c  (GetNSISString)
and Source/build.cpp;  where a number was not certain it is marked  "UNSURE"
and was cross-checked by compiling a calibration script with the local
makensis 3.09 and dumping that (see calibrate/ next to this file).

Usage:
    nsisdump.py FILE.exe [--no-raw] [--payload] [--strings]

  --no-raw    omit the raw integer args after each entry (for diffing)
  --payload   walk the data block and print size + sha256 of every item
  --strings   dump the whole string table in offset order
"""
import sys, struct, lzma, hashlib, argparse, os

FH_SIG = 0xDEADBEEF
FH_MAGIC = b"NullsoftInst"
FH_FLAGS = {1: "UNINSTALL", 2: "SILENT", 4: "NO_CRC", 8: "FORCE_CRC"}

# ----------------------------------------------------------------------------
# EW_* opcodes, NSIS 3.09 Source/exehead/fileform.h, default config.h.
# Every NSIS_SUPPORT_*/NSIS_CONFIG_* that guards an enum member is on by
# default EXCEPT NSIS_CONFIG_LOG, so EW_LOG is absent; the Unicode-only
# EW_FPUTWS/EW_FGETWS come last.  (My first draft had EW_LOG present and
# FPUTWS/FGETWS after FGETS - that was wrong by two in the 58..69 range.)
# Every number below was verified against two calibration builds compiled
# with the local makensis 3.09 (calibrate/cal.nsi, calibrate/cal2.nsi), e.g.
# EW_EXTRACTFILE=20, EW_REGISTERDLL=44, EW_CREATESHORTCUT=45, EW_WRITEREG=51,
# EW_FGETS=57, EW_FSEEK=58, EW_FINDFIRST=61, EW_WRITEUNINSTALLER=62,
# EW_SECTIONSET=63, EW_INSTTYPESET=64, EW_LOCKWINDOW=67, EW_FPUTWS=68, EW_FGETWS=69.
# ----------------------------------------------------------------------------
OPS = [
    "EW_INVALID_OPCODE",    # 0
    "EW_RET",               # 1
    "EW_NOP",               # 2  jump
    "EW_ABORT",             # 3
    "EW_QUIT",              # 4
    "EW_CALL",              # 5
    "EW_UPDATETEXT",        # 6
    "EW_SLEEP",             # 7
    "EW_BRINGTOFRONT",      # 8
    "EW_CHDETAILSVIEW",     # 9
    "EW_SETFILEATTRIBUTES", # 10
    "EW_CREATEDIR",         # 11
    "EW_IFFILEEXISTS",      # 12
    "EW_SETFLAG",           # 13
    "EW_IFFLAG",            # 14
    "EW_GETFLAG",           # 15
    "EW_RENAME",            # 16
    "EW_GETFULLPATHNAME",   # 17
    "EW_SEARCHPATH",        # 18
    "EW_GETTEMPFILENAME",   # 19
    "EW_EXTRACTFILE",       # 20
    "EW_DELETEFILE",        # 21
    "EW_MESSAGEBOX",        # 22
    "EW_RMDIR",             # 23
    "EW_STRLEN",            # 24
    "EW_ASSIGNVAR",         # 25
    "EW_STRCMP",            # 26
    "EW_READENVSTR",        # 27
    "EW_INTCMP",            # 28
    "EW_INTOP",             # 29
    "EW_INTFMT",            # 30
    "EW_PUSHPOP",           # 31
    "EW_FINDWINDOW",        # 32
    "EW_SENDMESSAGE",       # 33
    "EW_ISWINDOW",          # 34
    "EW_GETDLGITEM",        # 35
    "EW_SETCTLCOLORS",      # 36
    "EW_SETBRANDINGIMAGE",  # 37
    "EW_CREATEFONT",        # 38
    "EW_SHOWWINDOW",        # 39
    "EW_SHELLEXEC",         # 40
    "EW_EXECUTE",           # 41
    "EW_GETFILETIME",       # 42
    "EW_GETDLLVERSION",     # 43
    "EW_REGISTERDLL",       # 44  plugin calls
    "EW_CREATESHORTCUT",    # 45
    "EW_COPYFILES",         # 46
    "EW_REBOOT",            # 47
    "EW_WRITEINI",          # 48
    "EW_READINISTR",        # 49
    "EW_DELREG",            # 50
    "EW_WRITEREG",          # 51
    "EW_READREGSTR",        # 52
    "EW_REGENUM",           # 53
    "EW_FCLOSE",            # 54
    "EW_FOPEN",             # 55
    "EW_FPUTS",             # 56
    "EW_FGETS",             # 57
    "EW_FSEEK",             # 58
    "EW_FINDCLOSE",         # 59
    "EW_FINDNEXT",          # 60
    "EW_FINDFIRST",         # 61
    "EW_WRITEUNINSTALLER",  # 62
    # EW_LOG is guarded by NSIS_CONFIG_LOG, which the stock 3.09 build does
    # not define, so it is NOT in the enum (first draft of this table had it
    # at 63 and FPUTWS/FGETWS after FGETS; the calibration build showed
    # WriteUninstaller=62 and LockWindow=67, which only fits this layout).
    "EW_SECTIONSET",        # 63
    "EW_INSTTYPESET",       # 64
    "EW_GETLABELADDR",      # 65  compiler only
    "EW_GETFUNCTIONADDR",   # 66  compiler only
    "EW_LOCKWINDOW",        # 67
    "EW_FPUTWS",            # 68  Unicode only (appended at the end)
    "EW_FGETWS",            # 69  Unicode only
]

# Argument shapes.  s=string ptr, v=variable index, j=jump (entry index+1),
# r=registry root key, i=plain int, S=string ptr that may be a lang string.
SIG = {
    "EW_NOP":               "j",
    "EW_ABORT":             "s",
    "EW_CALL":              "ji",
    "EW_UPDATETEXT":        "si",
    "EW_SLEEP":             "s",
    "EW_CHDETAILSVIEW":     "ii",
    "EW_SETFILEATTRIBUTES": "si",
    "EW_CREATEDIR":         "sii",
    "EW_IFFILEEXISTS":      "sjj",
    "EW_SETFLAG":           "is",
    "EW_IFFLAG":            "jjii",
    "EW_GETFLAG":           "vi",
    "EW_RENAME":            "ssis",
    "EW_SEARCHPATH":        "vs",
    "EW_GETTEMPFILENAME":   "vs",
    "EW_EXTRACTFILE":       "isiiii",
    "EW_DELETEFILE":        "si",
    "EW_MESSAGEBOX":        "isiji j".replace(" ", ""),
    "EW_RMDIR":             "si",
    "EW_STRLEN":            "vs",
    "EW_ASSIGNVAR":         "vsss",
    "EW_STRCMP":            "ssjji",
    "EW_READENVSTR":        "vsi",
    "EW_INTCMP":            "ssjjji",
    "EW_INTOP":             "vssi",
    "EW_INTFMT":            "vssi",
    "EW_PUSHPOP":           None,   # special
    "EW_FINDWINDOW":        "vssss",
    "EW_SENDMESSAGE":       "vssssi",
    "EW_ISWINDOW":          "sjj",
    "EW_GETDLGITEM":        "vss",
    "EW_SETCTLCOLORS":      "si",
    "EW_SETBRANDINGIMAGE":  "sii",
    "EW_CREATEFONT":        "vsssi",
    "EW_SHOWWINDOW":        "ssii",
    "EW_SHELLEXEC":         "sssiis",   # [verb, file, params, showmode, SEE_MASK flags, log text]
    "EW_EXECUTE":           "siv",      # [cmd, wait, output var (only meaningful when wait=1)]
    "EW_GETFILETIME":       "vvs",
    "EW_GETDLLVERSION":     "vvsi",
    "EW_REGISTERDLL":       "sssii",
    "EW_CREATESHORTCUT":    "ssssis",
    "EW_COPYFILES":         "ssis",
    "EW_REBOOT":            "i",
    "EW_WRITEINI":          "ssssi",
    "EW_READINISTR":        "vsss",
    "EW_DELREG":            "irssi",    # 3.x: [reserved, rootkey, key, valuename(0=key), flags] (calibration)
    "EW_WRITEREG":          None,   # special (data is string or int by type)
    "EW_READREGSTR":        "vrssi",
    "EW_REGENUM":           "vrssi",
    # file/find ops: handle args are variable indices (calibration cal2.nsi)
    "EW_FCLOSE":            "v",
    "EW_FOPEN":             "viis",     # [handle var, access, create disposition, name]
    "EW_FPUTS":             "vsi",
    "EW_FGETS":             "vvsi",
    "EW_FPUTWS":            "vsi",
    "EW_FGETWS":            "vvsi",
    "EW_FSEEK":             "vvsi",     # [handle var, output var(-1), offset, mode]
    "EW_FINDCLOSE":         "v",
    "EW_FINDNEXT":          "vv",
    "EW_FINDFIRST":         "vvs",      # [output var, handle var, filespec]
    "EW_GETFULLPATHNAME":   "svi",
    "EW_WRITEUNINSTALLER":  "siis",     # [name, data offset, data size, "$INSTDIR\name"] (calibration)
    "EW_LOG":               "si",
    "EW_SECTIONSET":        "sisi",
    "EW_INSTTYPESET":       "ssii",
    "EW_GETLABELADDR":      "vi",
    "EW_GETFUNCTIONADDR":   "vi",
    "EW_LOCKWINDOW":        "i",
}

# Built-in variables, order from CEXEBuild::CEXEBuild (build.cpp).
# 0-9 $0..$9, 10-19 $R0..$R9, then the fixed ones; user 'Var's from 32.
# (Verified by the calibration build: 'Var Foo' -> index 32.)
VARS = ["$%d" % i for i in range(10)] + ["$R%d" % i for i in range(10)] + [
    "$CMDLINE", "$INSTDIR", "$OUTDIR", "$EXEDIR", "$LANGUAGE", "$TEMP",
    "$PLUGINSDIR", "$EXEPATH", "$EXEFILE", "$HWNDPARENT", "$_CLICK", "$_OUTDIR"]

# Shell folder constants: {CSIDL current user, CSIDL all users} -> name
# (m_ShellConstants in build.cpp).  Matched as an unordered pair because
# the byte order inside the wchar is checked empirically, not assumed.
SHELL = {
    (0x24, 0x24): "$WINDIR", (0x25, 0x25): "$SYSDIR",
    (0x26, 0x26): "$PROGRAMFILES", (0x2A, 0x2A): "$PROGRAMFILES32",
    (0x2B, 0x2B): "$COMMONFILES", (0x2C, 0x2C): "$COMMONFILES32",
    (0x10, 0x19): "$DESKTOP", (0x02, 0x17): "$SMPROGRAMS",
    (0x07, 0x18): "$SMSTARTUP", (0x05, 0x2E): "$DOCUMENTS",
    (0x09, 0x09): "$SENDTO", (0x08, 0x08): "$RECENT",
    (0x06, 0x1F): "$FAVORITES", (0x0D, 0x35): "$MUSIC",
    (0x27, 0x36): "$PICTURES", (0x0E, 0x37): "$VIDEOS",
    (0x13, 0x13): "$NETHOOD", (0x14, 0x14): "$FONTS",
    (0x15, 0x2D): "$TEMPLATES", (0x1A, 0x23): "$APPDATA",
    (0x1C, 0x23): "$LOCALAPPDATA", (0x1B, 0x1B): "$PRINTHOOD",
    (0x20, 0x20): "$INTERNET_CACHE", (0x21, 0x21): "$COOKIES",
    (0x22, 0x22): "$HISTORY", (0x28, 0x28): "$PROFILE",
    (0x30, 0x2F): "$ADMINTOOLS", (0x38, 0x38): "$RESOURCES",
    (0x39, 0x39): "$RESOURCES_LOCALIZED", (0x3B, 0x3B): "$CDBURN_AREA",
    (0x0B, 0x16): "$STARTMENU",
    # These four do not carry plain CSIDLs: the low byte has bit 7 set and
    # the exehead resolves them through the ProgramFilesDir/CommonFilesDir
    # registry values.  Pairs taken from the calibration build, not derived.
    (0x81, 0x20): "$PROGRAMFILES", (0xC1, 0x31): "$PROGRAMFILES64",
    (0x91, 0x34): "$COMMONFILES", (0x1A, 0x1A): "$QUICKLAUNCH",
}

ROOTKEYS = {0x80000000: "HKCR", 0x80000001: "HKCU", 0x80000002: "HKLM",
            0x80000003: "HKU", 0x80000004: "HKPD", 0x80000005: "HKCC",
            0x80000006: "HKDD"}

BLOCK_NAMES = ["pages", "sections", "entries", "strings", "langtables",
               "ctlcolors", "bgfont", "data"]


def u32(b, o): return struct.unpack_from("<I", b, o)[0]
def i32(b, o): return struct.unpack_from("<i", b, o)[0]


def find_firstheader(data):
    i = data.find(FH_MAGIC)
    while i != -1:
        off = i - 8
        if off >= 0:
            flags, sig = struct.unpack_from("<II", data, off)
            if sig == FH_SIG and (flags & ~0xF) == 0:
                return off
        i = data.find(FH_MAGIC, i + 1)
    raise SystemExit("no NSIS firstheader found")


def lzma_solid(data, start, end):
    """NSIS lzma stream: 1 props byte, LE32 dict size, then raw LZMA1."""
    props = data[start]
    dict_size = u32(data, start + 1)
    lc = props % 9
    rem = props // 9
    lp = rem % 5
    pb = rem // 5
    dec = lzma.LZMADecompressor(format=lzma.FORMAT_RAW, filters=[
        {"id": lzma.FILTER_LZMA1, "lc": lc, "lp": lp, "pb": pb,
         "dict_size": dict_size}])
    out = bytearray()
    pos = start + 5
    CH = 1 << 20
    note = ""
    try:
        while pos < end and not dec.eof:
            out += dec.decompress(data[pos:min(pos + CH, end)])
            pos += CH
    except lzma.LZMAError as e:
        note = "LZMA decoder stopped: %s (after %d bytes out)" % (e, len(out))
    return bytes(out), (lc, lp, pb, dict_size), note


class Header:
    def __init__(self, hdr):
        self.raw = hdr
        self.flags = u32(hdr, 0)
        self.blocks = [(i32(hdr, 4 + 8 * k), i32(hdr, 8 + 8 * k)) for k in range(8)]
        o = 68
        (self.install_reg_rootkey, self.install_reg_key_ptr,
         self.install_reg_value_ptr) = struct.unpack_from("<iii", hdr, o); o += 12
        (self.bg_color1, self.bg_color2, self.bg_textcolor, self.lb_bg,
         self.lb_fg, self.langtable_size) = struct.unpack_from("<iiiiii", hdr, o); o += 24
        self.license_bg = i32(hdr, o); o += 4
        self.callbacks = struct.unpack_from("<10i", hdr, o); o += 40
        self.install_types = struct.unpack_from("<33i", hdr, o); o += 132
        self.install_directory_ptr, self.install_directory_auto_append = \
            struct.unpack_from("<ii", hdr, o); o += 8
        self.str_uninstchild, self.str_uninstcmd = struct.unpack_from("<ii", hdr, o); o += 8
        self.str_wininit = i32(hdr, o); o += 4
        self.size = o  # 300
        # blocks
        so, _ = self.blocks[3]
        lo, ln = self.blocks[4]
        self.str_off = so
        self.str_end = lo
        self.langtables = []
        for k in range(ln):
            base = lo + k * self.langtable_size
            # build.cpp writes LANGID (2 bytes) + int dlg_offset + int rtl,
            # unpadded, then the string pointers: langtable_size = 10 + 4n
            # (298 and 250 seen in practice are both == 2 mod 4, not 0).
            lang_id, dlg_off, rtl = struct.unpack_from("<Hii", hdr, base)
            n = (self.langtable_size - 10) // 4
            strs = struct.unpack_from("<%di" % n, hdr, base + 10)
            self.langtables.append((lang_id, dlg_off, rtl, strs))
        self.codes_seen = {}

    # -- strings ------------------------------------------------------------
    def raw_wchars(self, ptr):
        """UTF-16 code units of string at char offset ptr, up to NUL."""
        o = self.str_off + 2 * ptr
        out = []
        while o + 1 < self.str_end:
            c = u32(self.raw[o:o + 2] + b"\0\0", 0)
            if c == 0:
                break
            out.append(c)
            o += 2
        return out

    def decode(self, ptr, depth=0):
        """Resolve a string pointer; negative = language string."""
        if ptr < 0:
            idx = -ptr - 1
            return self.langstr(idx, depth)
        w = self.raw_wchars(ptr)
        return self.decode_units(w, depth)

    def langstr(self, idx, depth=0):
        if not self.langtables:
            return "$(LangString %d)" % idx
        lt = self.langtables[0]
        if idx >= len(lt[3]):
            return "$(LangString %d ?)" % idx
        p = lt[3][idx]
        if depth > 8:
            return "$(LangString %d ...)" % idx
        if p == 0 and idx != 0:
            return "$(LangString %d '')" % idx
        return "$(LangString %d '%s')" % (idx, self.decode(p, depth + 1))

    def decode_units(self, w, depth=0):
        out = []
        i = 0
        n = len(w)
        while i < n:
            c = w[i]
            i += 1
            # NSIS 3.09 Unicode (verified on the calibration build):
            #   NS_LANG_CODE=1  NS_SHELL_CODE=2  NS_VAR_CODE=3  NS_SKIP_CODE=4
            # each followed by ONE wchar.  VAR/LANG carry CODE_SHORT(x) =
            # 0x8080 | (x & 0x7F) | ((x & 0x3F80) << 1); SHELL carries the
            # two CSIDL bytes (low = current user, high = all users).
            if 1 <= c <= 4 and i < n:
                d = w[i]
                i += 1
                self.codes_seen[c] = self.codes_seen.get(c, 0) + 1
                if c == 4:                 # skip: literal next char
                    out.append(chr(d))
                elif c == 3:               # variable
                    idx = (d & 0x7F) | ((d & 0x7F00) >> 1)
                    out.append(VARS[idx] if idx < len(VARS) else "$Var%d" % idx)
                elif c == 2:               # shell folder
                    lo, hi = d & 0xFF, d >> 8
                    name = SHELL.get((lo, hi))
                    out.append(name if name else "$SHELL(%02x,%02x)" % (lo, hi))
                elif c == 1:               # language string
                    idx = (d & 0x7F) | ((d & 0x7F00) >> 1)
                    out.append(self.langstr(idx, depth + 1) if depth < 8
                               else "$(LangString %d)" % idx)
            else:
                out.append(chr(c) if c < 0xD800 or c > 0xDFFF else "\\u%04x" % c)
        return "".join(out)

    def q(self, ptr):
        return '"%s"' % self.decode(ptr).replace("\\", "\\\\").replace('"', '\\"') \
            .replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t")


def fmt_arg(h, kind, val, op=None):
    if kind == "s":
        return h.q(val)
    if kind == "v":
        if val < 0:
            return "novar(%d)" % val
        return VARS[val] if val < len(VARS) else "$Var%d" % val
    if kind == "j":
        if val == 0:
            return "j:none"
        if val > 0:
            return "j:->%d" % (val - 1)
        return "j:%d" % val
    if kind == "r":
        return ROOTKEYS.get(val & 0xFFFFFFFF, "root(0x%08x)" % (val & 0xFFFFFFFF))
    return str(val)


def fmt_entry(h, idx, which, args):
    name = OPS[which] if 0 <= which < len(OPS) else "EW_?%d" % which
    sig = SIG.get(name, "")
    parts = []
    if name == "EW_PUSHPOP":
        # [variable/string, ?pop:push, ?exch]
        if args[2]:
            parts = ["exch", str(args[2])]
        elif args[1]:
            parts = ["pop", fmt_arg(h, "v", args[0])]
        else:
            parts = ["push", fmt_arg(h, "s", args[0])]
    elif name == "EW_WRITEREG":
        # [rootkey, key, name, data, type, rtype]  (3.x: [5] = real REG_ type)
        REG = {0: "NONE", 1: "REG_SZ", 2: "REG_EXPAND_SZ", 3: "REG_BINARY",
               4: "REG_DWORD", 7: "REG_MULTI_SZ"}
        rtype = args[5]
        parts = [fmt_arg(h, "r", args[0]), h.q(args[1]), h.q(args[2])]
        if rtype in (1, 2, 4, 7):
            parts.append(h.q(args[3]))
        else:
            parts.append("data@%d" % args[3])
        parts.append("type=%d" % args[4])
        parts.append(REG.get(rtype, "rtype=%d" % rtype))
    elif name == "EW_EXTRACTFILE":
        parts = ["ovw=0x%x" % (args[0] & 0xFFFFFFFF), h.q(args[1]), "data@%d" % args[2],
                 "ftime=0x%08x%08x" % (args[4] & 0xFFFFFFFF, args[3] & 0xFFFFFFFF),
                 "allowignore=%d" % args[5]]
    else:
        for k in range(6):
            kind = sig[k] if k < len(sig) else "i"
            v = args[k]
            if k >= len(sig) and v == 0:
                continue
            parts.append(fmt_arg(h, kind, v, name))
    return "%s %s" % (name, " ".join(parts))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--no-raw", action="store_true")
    ap.add_argument("--payload", action="store_true")
    ap.add_argument("--strings", action="store_true")
    a = ap.parse_args()
    data = open(a.file, "rb").read()
    fh = find_firstheader(data)
    flags, sig, n1, n2, n3, len_hdr, len_all = struct.unpack_from("<IIIIIII", data, fh)
    P = print
    P("# nsisdump of %s (%d bytes)" % (os.path.basename(a.file), len(data)))
    P("firstheader @%d flags=%d [%s] sig=0x%08x magic=%s header_len=%d data_len=%d file_end=%d%s"
      % (fh, flags, ",".join(v for k, v in FH_FLAGS.items() if flags & k) or "-",
         sig, (struct.pack("<III", n1, n2, n3)).decode("ascii"), len_hdr, len_all,
         fh + len_all, "" if fh + len_all == len(data) else "  (MISMATCH with file size)"))
    end = len(data) - (0 if flags & 4 else 4)   # trailing CRC32 unless NO_CRC
    stream, props, note = lzma_solid(data, fh + 28, end)
    P("lzma lc=%d lp=%d pb=%d dict=%d (%d MB) decompressed=%d bytes %s"
      % (props[0], props[1], props[2], props[3], props[3] >> 20, len(stream), note))
    if not flags & 4:
        import zlib
        # exehead (non-CRC_ANAL build) CRCs everything after the first 512
        # bytes of the stub, up to the CRC itself - verified on the
        # calibration build by brute-forcing the start offset.
        crc = zlib.crc32(data[512:len(data) - 4]) & 0xFFFFFFFF
        stored = u32(data, len(data) - 4)
        P("crc32(file[512:-4]) stored=0x%08x computed=0x%08x %s" % (stored, crc, "OK" if crc == stored else "BAD"))
    # In a solid stream the header is the first data-block item: LE32 length,
    # then the header bytes (verified: first int == header_len).
    first_len = u32(stream, 0)
    if first_len != len_hdr:
        P("WARNING: first item length %d != header_len %d" % (first_len, len_hdr))
    hdr = stream[4:4 + len_hdr]
    db_base = 4 + len_hdr
    if len(hdr) < len_hdr:
        raise SystemExit("decompressed stream shorter than header (%d < %d)" % (len(hdr), len_hdr))
    h = Header(hdr)
    P("")
    P("== header ==")
    P("flags=0x%x" % h.flags)
    for k, (off, num) in enumerate(h.blocks):
        P("block %-10s offset=%d num=%d" % (BLOCK_NAMES[k], off, num))
    P("install_reg_rootkey=%s key=%s value=%s"
      % (fmt_arg(h, "r", h.install_reg_rootkey) if h.install_reg_rootkey else "0",
         h.q(h.install_reg_key_ptr) if h.install_reg_key_ptr else h.install_reg_key_ptr,
         h.q(h.install_reg_value_ptr) if h.install_reg_value_ptr else h.install_reg_value_ptr))
    P("bg_color1=0x%x bg_color2=0x%x bg_textcolor=0x%x lb_bg=0x%x lb_fg=0x%x langtable_size=%d license_bg=0x%x"
      % ((h.bg_color1 & 0xFFFFFFFF), (h.bg_color2 & 0xFFFFFFFF), (h.bg_textcolor & 0xFFFFFFFF),
         (h.lb_bg & 0xFFFFFFFF), (h.lb_fg & 0xFFFFFFFF), h.langtable_size, h.license_bg & 0xFFFFFFFF))
    cbn = ["onInit", "onInstSuccess", "onInstFailed", "onUserAbort", "onGUIInit",
           "onGUIEnd", "onMouseOverSection", "onVerifyInstDir", "onSelChange", "onRebootFailed"]
    P("callbacks: " + " ".join("%s=%d" % (n, v) for n, v in zip(cbn, h.callbacks)))
    P("install_types: " + " ".join(str(v) for v in h.install_types))
    P("install_directory=%s auto_append=%s"
      % (h.q(h.install_directory_ptr), h.q(h.install_directory_auto_append)
         if h.install_directory_auto_append else h.install_directory_auto_append))
    P("str_uninstchild=%s str_uninstcmd=%s str_wininit=%s"
      % (h.q(h.str_uninstchild) if h.str_uninstchild else h.str_uninstchild,
         h.q(h.str_uninstcmd) if h.str_uninstcmd else h.str_uninstcmd,
         h.q(h.str_wininit) if h.str_wininit else h.str_wininit))

    # pages
    po, pn = h.blocks[0]
    P("")
    P("== pages (%d) ==" % pn)
    for k in range(pn):
        f = struct.unpack_from("<16i", hdr, po + 64 * k)
        P("page %d: dlg_id=%d wndproc_id=%d prefunc=%d showfunc=%d leavefunc=%d flags=0x%x "
          "caption=%s back=%s next=%s clicknext=%s cancel=%s parms=%s"
          % (k, f[0], f[1], f[2], f[3], f[4], f[5],
             h.q(f[6]) if f[6] else 0, h.q(f[7]) if f[7] else 0, h.q(f[8]) if f[8] else 0,
             h.q(f[9]) if f[9] else 0, h.q(f[10]) if f[10] else 0, list(f[11:16])))

    # sections
    so, sn = h.blocks[1]
    eo, en = h.blocks[2]
    P("")
    ssize = (eo - so) // sn if sn else 0
    P("== sections (%d, %d bytes each) ==" % (sn, ssize))
    for k in range(sn):
        b = so + ssize * k
        name_ptr, itypes, sflags, code, code_size, size_kb = struct.unpack_from("<6i", hdr, b)
        nm = hdr[b + 24:b + ssize].decode("utf-16-le", "replace").split("\0")[0]
        P("section %d: name=%s install_types=0x%x flags=0x%x code=%d code_size=%d size_kb=%d name_buf=%r"
          % (k, h.q(name_ptr) if name_ptr else 0, itypes & 0xFFFFFFFF, sflags, code, code_size, size_kb, nm))

    # entries
    P("")
    P("== entries (%d) ==" % en)
    for k in range(en):
        which, *args = struct.unpack_from("<7i", hdr, eo + 28 * k)
        line = "%4d: %s" % (k, fmt_entry(h, k, which, args))
        if not a.no_raw:
            line += "   ; raw %d %s" % (which, " ".join(str(v) for v in args))
        P(line)

    # ctlcolors
    co, cn = h.blocks[5]
    if cn == 0 and co and len_hdr > co:
        cn = (len_hdr - co) // 24   # build.cpp does not fill .num for ctlcolors
    P("")
    P("== ctlcolors (%d) ==" % cn)
    for k in range(cn):
        text, bkc, lbstyle, bkb, bkmode, cflags = struct.unpack_from("<IIiIii", hdr, co + 24 * k)
        P("ctlcolor @%d: text=0x%06x bk=0x%06x lbStyle=%d bkb=%d bkmode=%d flags=0x%x"
          % (24 * k, text, bkc, lbstyle, bkb, bkmode, cflags))

    # langtables
    P("")
    P("== langtables (%d) ==" % len(h.langtables))
    for k, (lang_id, dlg_off, rtl, strs) in enumerate(h.langtables):
        P("langtable %d: lang_id=%d dlg_offset=%d rtl=%d strings=%d" % (k, lang_id, dlg_off, rtl, len(strs)))
        for i, p in enumerate(strs):
            P("  [%d] %s" % (i, h.q(p) if p else '""'))
    P("")
    P("escape codes seen in strings: " + " ".join("0x%04x:%d" % kv for kv in sorted(h.codes_seen.items())))

    if a.strings:
        P("")
        P("== string table (char offsets) ==")
        o = 0
        nchars = (h.str_end - h.str_off) // 2
        while o < nchars:
            w = h.raw_wchars(o)
            P("%6d: %s" % (o, h.q(o)))
            o += len(w) + 1

    if a.payload:
        P("")
        P("== data block (sequential walk; offsets relative to end of header item) ==")
        db = db_base
        names = {}
        for k in range(en):
            which, *args = struct.unpack_from("<7i", hdr, eo + 28 * k)
            if which == 20:
                names.setdefault(args[2], []).append(h.decode(args[1]))
            elif which == 64:
                names.setdefault(args[1], []).append("<uninstaller: %s>" % h.decode(args[0]))
        o = 0
        total = len(stream) - db
        while o + 4 <= total:
            ln = u32(stream, db + o)
            if ln & 0x80000000:
                P("@%d: length has compressed bit set (0x%08x) - not expected in a solid stream, stopping" % (o, ln))
                break
            body = stream[db + o + 4: db + o + 4 + ln]
            if len(body) < ln:
                P("@%d: truncated item (want %d, have %d)" % (o, ln, len(body)))
                break
            P("@%d: size=%d sha256=%s %s" % (o, ln, hashlib.sha256(body).hexdigest(),
                                             " | ".join(names.get(o, ["<unreferenced>"]))))
            o += 4 + ln
        if o != total:
            P("data block: %d trailing bytes after last item (%s)" % (total - o, stream[db + o: db + o + 16].hex()))


if __name__ == "__main__":
    main()
