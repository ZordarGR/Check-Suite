#!/bin/sh
# verify.sh - prove the rebuilt installer equivalent to the shipped 1.17.38.
# Usage: cd <this dir> && ./verify.sh <shipped.exe> <rebuilt.exe>
# Writes: dump-rebuilt.txt, equivalence.diff, 7z-lists.diff, verify.log
set -u
D=$(cd "$(dirname "$0")" && pwd)
SHIP=$1; NEW=$2
LOG=$D/verify.log; : > "$LOG"
say() { echo "$@" | tee -a "$LOG"; }

say "== sizes / sha256 =="
ls -l "$SHIP" "$NEW" | tee -a "$LOG"
sha256sum "$SHIP" "$NEW" | tee -a "$LOG"

say ""
say "== exe stub (first 460800 bytes: exehead + icon + manifest) =="
if cmp -n 460800 "$SHIP" "$NEW"; then say "installer stubs byte-identical"; else say "installer stubs DIFFER"; fi

say ""
say "== full decoded dump of the rebuilt installer -> dump-rebuilt.txt =="
python3 "$D/nsisdump.py" "$NEW" --payload --strings > "$D/dump-rebuilt.txt"
grep -c "" "$D/dump-rebuilt.txt" | tee -a "$LOG"

say ""
say "== header diff (strict: only the '# nsisdump of' line, firstheader offset and CRC masked) -> equivalence.diff =="
{
  echo "### installer: $(basename "$SHIP") vs $(basename "$NEW")"
  "$D/hdrdiff.sh" "$SHIP" "$NEW"; r1=$?
  echo "### installer header diff exit=$r1 (0 = identical)"
} > "$D/equivalence.diff" 2>&1
say "installer header diff exit=$(sed -n 's/^### installer header diff exit=//p' "$D/equivalence.diff")"

say ""
say "== uninstaller: extract both with 7z and diff their decoded headers =="
rm -rf "$D/x-ship" "$D/x-new"; mkdir -p "$D/x-ship" "$D/x-new"
(cd "$D/x-ship" && 7z x -y "$SHIP" Uninstall.exe > /dev/null)
(cd "$D/x-new" && 7z x -y "$NEW" Uninstall.exe > /dev/null)
ls -l "$D/x-ship/Uninstall.exe" "$D/x-new/Uninstall.exe" | tee -a "$LOG"
if cmp "$D/x-ship/Uninstall.exe" "$D/x-new/Uninstall.exe"; then say "Uninstall.exe byte-identical"; else say "Uninstall.exe differs (see equivalence.diff)"; fi
{
  echo ""
  echo "### uninstaller: Uninstall.exe (shipped) vs Uninstall.exe (rebuilt)"
  "$D/hdrdiff.sh" "$D/x-ship/Uninstall.exe" "$D/x-new/Uninstall.exe"; r2=$?
  echo "### uninstaller header diff exit=$r2 (0 = identical)"
} >> "$D/equivalence.diff" 2>&1
say "uninstaller header diff exit=$(sed -n 's/^### uninstaller header diff exit=//p' "$D/equivalence.diff")"
python3 "$D/nsisdump.py" "$D/x-new/Uninstall.exe" --payload --strings > "$D/dump-rebuilt-uninstall.txt"

say ""
say "== 7z l file lists (date, size, name; 7-Zip's NSIS handler has no per-file CRC) -> 7z-lists.diff =="
lst() { 7z l "$1" | sed -n '/^Path = /,$p' | grep -v '^Path = '; }
lst "$SHIP" > "$D/7z-ship.lst"; lst "$NEW" > "$D/7z-new.lst"
if diff -u "$D/7z-ship.lst" "$D/7z-new.lst" > "$D/7z-lists.diff"; then say "7z file lists identical ($(wc -l < "$D/7z-ship.lst") entries)"; else say "7z file lists DIFFER:"; cat "$D/7z-lists.diff" | tee -a "$LOG"; fi

say ""
say "== payload items (size + sha256 from the data-block walk) =="
sed -n '/^== data block/,$p' "$D/dump-1.17.38.txt" | grep '^@' > "$D/items-ship.txt"
sed -n '/^== data block/,$p' "$D/dump-rebuilt.txt" | grep '^@' > "$D/items-new.txt"
if cmp -s "$D/items-ship.txt" "$D/items-new.txt"; then say "all $(wc -l < "$D/items-ship.txt") data-block items identical (offset, size, sha256, name)"; else say "data-block items DIFFER:"; diff "$D/items-ship.txt" "$D/items-new.txt" | tee -a "$LOG"; fi
say ""
say "done"
