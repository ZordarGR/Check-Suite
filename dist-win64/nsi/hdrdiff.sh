#!/bin/sh
# hdrdiff.sh A.exe B.exe [--loose]
# Diff the decoded headers of two NSIS installers.  --loose also masks the
# fields that legitimately depend on the payload bytes (data offsets, file
# times, section size, decompressed size) so a build against a stand-in
# payload can be compared with the shipped one.
D=$(dirname "$0")
norm() {
  python3 "$D/nsisdump.py" "$1" --no-raw --payload | sed -e '1d' \
    -e 's/^firstheader @[0-9]* /firstheader /' -e 's/ data_len=[0-9]* file_end=[0-9]*//' \
    -e 's/^crc32.*$/crc32 (masked)/'
}
if [ "$3" = "--loose" ]; then
  norm "$1" | sed -e 's/ data@[0-9]*//; s/ ftime=0x[0-9a-f]*//; s/ size_kb=[0-9]*//; s/ decompressed=[0-9]* bytes//; s/^@[0-9]*: size=[0-9]* sha256=[0-9a-f]* /@ /' > /tmp/hdrdiff_a.$$
  norm "$2" | sed -e 's/ data@[0-9]*//; s/ ftime=0x[0-9a-f]*//; s/ size_kb=[0-9]*//; s/ decompressed=[0-9]* bytes//; s/^@[0-9]*: size=[0-9]* sha256=[0-9a-f]* /@ /' > /tmp/hdrdiff_b.$$
else
  norm "$1" > /tmp/hdrdiff_a.$$; norm "$2" > /tmp/hdrdiff_b.$$
fi
diff -u /tmp/hdrdiff_a.$$ /tmp/hdrdiff_b.$$; r=$?
rm -f /tmp/hdrdiff_a.$$ /tmp/hdrdiff_b.$$
exit $r
