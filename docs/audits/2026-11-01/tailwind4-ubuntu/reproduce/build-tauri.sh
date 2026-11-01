#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/node-v24/bin:/usr/bin:/bin"
base="$HOME/tailwind4-ubuntu-probe"
cp -r "$(dirname "$0")/tauri" "$base/"
# Embed only static test assets, never the npm tree.
mkdir -p "$base/tauri/public"
mkdir -p "$base/tauri/icons"
cp "$(dirname "$0")/../../src-tauri/icons/icon.png" "$base/tauri/icons/icon.png"
cp "$base/fixture/index.html" "$base/fixture/probe.js" "$base/fixture/output.css" "$base/tauri/public/"
sed -i 's|"../fixture"|"public"|' "$base/tauri/tauri.conf.json"
cd "$base/tauri"
CARGO_TARGET_DIR="$base/tauri-target" cargo build --offline -j 4
