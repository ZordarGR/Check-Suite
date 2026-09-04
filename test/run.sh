#!/bin/sh
# Every harness that needs nothing but node. Run from the repo root:  sh test/run.sh
set -e
cd "$(dirname "$0")/.."
fail=0
for t in scopecheck movespanel pills0209 report poison names nighttest dst quiet stdout inhouse livenames roomsfile alerts reports; do
  printf '\n=== %s ===\n' "$t"
  if [ "$t" = dst ]; then TZ=Europe/Athens node "test/$t.js" || fail=1;
  else node "test/$t.js" || fail=1; fi
done
printf '\n=== lvitem (C#, needs mono) ===\n'
if command -v mcs >/dev/null 2>&1; then
  mcs -out:/tmp/lvtest.exe test/lvitem.cs 2>/dev/null && mono /tmp/lvtest.exe app/rc-tbind.exe || fail=1
  printf '\n=== splash geometry (C#) ===\n'
  mcs -out:/tmp/sptest.exe test/splash.cs 2>/dev/null && mono /tmp/sptest.exe app/rc-tbind.exe || fail=1
else
  echo "  skipped — no mcs on this machine"
fi

printf '\n'
[ "$fail" = 0 ] && echo "all harnesses ran" || { echo "SOMETHING FAILED"; exit 1; }
