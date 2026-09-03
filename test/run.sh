#!/bin/sh
# Every harness that needs nothing but node. Run from the repo root:  sh test/run.sh
set -e
cd "$(dirname "$0")/.."
fail=0
for t in scopecheck movespanel pills0209 report poison names nighttest quiet; do
  printf '\n=== %s ===\n' "$t"
  node "test/$t.js" || fail=1
done
printf '\n'
[ "$fail" = 0 ] && echo "all harnesses ran" || { echo "SOMETHING FAILED"; exit 1; }
