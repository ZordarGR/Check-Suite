#!/usr/bin/env python3
"""Guard against Mono-only BCL members reaching a .NET Framework machine.

rc-tbind.exe is cross-compiled on Linux with Mono's mcs against Mono's class
library, and then runs on Windows against .NET Framework. Mono's library is the
larger of the two, so a call can compile cleanly here and not exist there. The
JIT resolves every token in a method before executing it, so one such call takes
down the whole method on first use -- not the branch that contains it.

That is not hypothetical. `body.Split(',')` bound to String.Split(char,
StringSplitOptions), which .NET Framework 4.8 does not have; ParseBind threw
MissingMethodException on its first call and the helper died 53 ms in with exit
0xE0434352, with the seq: branch never taken.

This reads the #Strings heap of the compiled assembly -- every type and member
name the metadata carries -- and fails on anything not in bcl-allow.txt. Adding
a name to that file is the moment to check the member exists in .NET Framework
4.8, because nothing else in this build will.

It is a name-level check, not a signature-level one: it cannot tell two
overloads apart on its own. It caught the case above because the newer overload
dragged in a type name that the older one does not use, which is the usual
shape. It is a tripwire, not a proof.
"""
import struct, sys, os

def strings_heap(path):
    d = open(path, 'rb').read()
    pe = struct.unpack_from('<I', d, 0x3c)[0]
    assert d[pe:pe+4] == b'PE\0\0', 'not a PE'
    nsec, = struct.unpack_from('<H', d, pe + 6)
    optsz, = struct.unpack_from('<H', d, pe + 20)
    opt = pe + 24
    magic, = struct.unpack_from('<H', d, opt)
    dirs = opt + (112 if magic == 0x20b else 96)
    cli_rva, = struct.unpack_from('<I', d, dirs + 14 * 8)     # CLI header

    sections = []
    off = opt + optsz
    for i in range(nsec):
        s = off + i * 40
        vsize, vaddr, rsize, raddr = struct.unpack_from('<IIII', d, s + 8)
        sections.append((vaddr, vsize, raddr))

    def off_of(rva):
        for vaddr, vsize, raddr in sections:
            if vaddr <= rva < vaddr + max(vsize, 1):
                return raddr + (rva - vaddr)
        raise ValueError('rva %#x outside every section' % rva)

    meta_rva, = struct.unpack_from('<I', d, off_of(cli_rva) + 8)
    m = off_of(meta_rva)
    assert d[m:m+4] == b'BSJB', 'no metadata signature'
    vlen, = struct.unpack_from('<I', d, m + 12)
    p = m + 16 + vlen + 4
    nstreams, = struct.unpack_from('<H', d, p)
    p += 2
    for _ in range(nstreams):
        soff, ssize = struct.unpack_from('<II', d, p)
        p += 8
        end = d.index(b'\0', p)
        name = d[p:end].decode('ascii')
        p = end + 1
        p = (p + 3) & ~3                                      # 4-byte aligned
        if name == '#Strings':
            raw = d[m + soff: m + soff + ssize]
            return {n.decode('utf-8', 'replace') for n in raw.split(b'\0') if n}
    raise ValueError('no #Strings heap')

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    exe = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'rc-tbind.exe')
    allow_path = os.path.join(here, 'bcl-allow.txt')
    allow = set()
    for line in open(allow_path, encoding='utf-8'):
        line = line.split('#')[0].strip()
        if line:
            allow.add(line)
    unknown = sorted(strings_heap(exe) - allow)
    if unknown:
        print('build-check: %d name(s) in %s are not in bcl-allow.txt:'
              % (len(unknown), os.path.basename(exe)), file=sys.stderr)
        for n in unknown:
            print('  ' + n, file=sys.stderr)
        print('\nEach is a type or member the helper now references. Confirm it exists'
              '\nin .NET Framework 4.8 -- not just in Mono -- then add it to'
              '\n%s.' % allow_path, file=sys.stderr)
        return 1
    print('build-check: ok (%d names, all known)' % len(allow))
    return 0

if __name__ == '__main__':
    sys.exit(main())
