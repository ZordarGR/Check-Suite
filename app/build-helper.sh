#!/bin/sh
# Build rc-tbind.exe and refuse to produce one that will die on .NET Framework.
#
# Always build through this, never `mcs` by hand: the check afterwards is the
# only thing standing between a Mono-only BCL call and a helper that crashes on
# the user's machine with nothing but a hex exit code to show for it.
set -e
cd "$(dirname "$0")"
# -win32icon embeds RecCheck's own icon in this exe. The installation overlay blits it
# rather than approximating it: the first cut drew the Caps Lock letter A and he asked
# what it was doing in the middle of his icon.
mcs -target:winexe -optimize+ -win32icon:reccheck.ico -out:rc-tbind.exe tbind.cs
python3 build-check.py rc-tbind.exe
echo "build-helper: rc-tbind.exe $(sha256sum rc-tbind.exe | cut -c1-16)... ok"
