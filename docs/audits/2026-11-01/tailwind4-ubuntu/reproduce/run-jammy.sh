#!/usr/bin/env bash
set -euo pipefail
base=/home/ryadb/tailwind4-ubuntu-probe
root="$base/jammy"
mkdir -p "$root/probe/fixture" "$root/probe/results" "$root/tmp"
cp "$base/fixture/index.html" "$base/fixture/probe.js" "$base/fixture/output.css" "$root/probe/fixture/"
cp "$(dirname "$0")/run-webkit.py" "$root/probe/"
mount --bind /dev "$root/dev"
mount -t proc proc "$root/proc"
mount --bind /sys "$root/sys"
trap 'python3 "$(dirname "$0")/cleanup-jammy.py"' EXIT
chroot "$root" /usr/bin/env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3-gi-cairo
chroot "$root" /usr/bin/env GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 xvfb-run -a -s '-screen 0 1920x1080x24' dbus-run-session -- python3 /probe/run-webkit.py /probe/fixture /probe/results/ubuntu-22.04
cp -r "$root/probe/results/ubuntu-22.04" "$base/results/"
chroot "$root" /usr/bin/env GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 PROBE_REDUCED_MOTION=1 xvfb-run -a -s '-screen 0 1920x1080x24' dbus-run-session -- python3 /probe/run-webkit.py /probe/fixture /probe/results/ubuntu-22.04-reduced
cp -r "$root/probe/results/ubuntu-22.04-reduced" "$base/results/"
