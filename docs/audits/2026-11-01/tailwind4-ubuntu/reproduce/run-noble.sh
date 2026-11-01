#!/usr/bin/env bash
set -euo pipefail
base="$HOME/tailwind4-ubuntu-probe"
export PATH="$HOME/.cargo/bin:$HOME/.local/node-v24/bin:/usr/bin:/bin"
cp "$(dirname "$0")"/fixture/* "$base/fixture/"
cp "$(dirname "$0")/run-webkit.py" "$base/"
cp "$(dirname "$0")/run-tauri.py" "$base/"
cd "$base/fixture"
npx @tailwindcss/cli -i input.css -o output.css --minify
sha256sum index.html probe.js input.css output.css package-lock.json > "$base/results/fixture.sha256"
cd "$base"
GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s '-screen 0 1920x1080x24' dbus-run-session -- python3 run-webkit.py fixture results/ubuntu-24.04
GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 PROBE_REDUCED_MOTION=1 xvfb-run -a -s '-screen 0 1920x1080x24' dbus-run-session -- python3 run-webkit.py fixture results/ubuntu-24.04-reduced
