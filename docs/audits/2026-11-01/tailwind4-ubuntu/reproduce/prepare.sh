#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/node-v24/bin:/usr/bin:/bin"
base="$HOME/tailwind4-ubuntu-probe"
mkdir -p "$base/fixture" "$base/results"
cp "$(dirname "$0")"/fixture/* "$base/fixture/"
cp "$(dirname "$0")/run-webkit.py" "$base/"
cd "$base/fixture"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm init -y >/dev/null
  npm install --save-exact tailwindcss@4.3.3 @tailwindcss/cli@4.3.3
fi
npx @tailwindcss/cli -i input.css -o output.css --minify
node -e 'console.log(JSON.stringify({node:process.version,tailwind:require("tailwindcss/package.json").version,cli:require("@tailwindcss/cli/package.json").version}))' > "$base/results/build-versions.json"
sha256sum index.html probe.js input.css output.css package-lock.json > "$base/results/fixture.sha256"
