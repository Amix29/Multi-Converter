#!/usr/bin/env bash
# Builds an owned, ad-hoc signed WKWebView fixture. Not a Tauri/DMG release.
set -eu
root=$(cd "${1:?project root required}" && pwd)
mkdir -p "${2:?output directory required}"
output=$(cd "$2" && pwd)
port=${3:-4191}
app="$output/UIProbe.app"
mkdir -p "$app/Contents/MacOS"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.multiconverter.svelte-probe</string>
<key>CFBundleName</key><string>Multi-Converter UI Probe</string>
<key>CFBundleExecutable</key><string>UIProbe</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSUIElement</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
cd "$root"
swiftc -module-cache-path "$output/swift-cache" scripts/probes/run-svelte-wkwebview.swift -o "$app/Contents/MacOS/UIProbe"
codesign --force --sign - "$app"
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port "$port" --strictPort > "$output/server.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 100); do
  if curl -fsS "http://127.0.0.1:$port/" > /dev/null 2>&1; then break; fi
  sleep 0.1
done
curl -fsS "http://127.0.0.1:$port/" > /dev/null
"$app/Contents/MacOS/UIProbe" "http://127.0.0.1:$port" "$root/scripts/probes/svelte-webview.js" "$output"
