#!/usr/bin/env bash
set -euo pipefail
license_dir="$RUNNER_TEMP/mc-ffmpeg-license"
mkdir -p "$license_dir"
base_url="https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.1"
verify_download() {
  local name="$1"
  local expected="$2"
  local target="$license_dir/$name"
  curl -fsSL "$base_url/$name" -o "$target"
  local actual
  actual="$(shasum -a 256 "$target" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "$name SHA-256 mismatch. Expected $expected, got $actual." >&2
    exit 1
  fi
}
verify_download LICENSE.md 2e1d16c72fd74e12063776371da757322f8b77589386532f4fd8634bde7de1af
verify_download COPYING.GPLv2 8177f97513213526df2cf6184d8ff986c675afb514d4e68a404010521b880643
verify_download COPYING.GPLv3 8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903
verify_download COPYING.LGPLv2.1 246041b6ecf9bc32d718a62c57877c78b5eb397b6467e74ed7ae2626ab189c30
verify_download COPYING.LGPLv3 da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768
bundle="$license_dir/FFmpeg-LICENSES.txt"
: > "$bundle"
for name in LICENSE.md COPYING.GPLv2 COPYING.GPLv3 COPYING.LGPLv2.1 COPYING.LGPLv3; do
  printf '\n===== %s =====\n\n' "$name" >> "$bundle"
  cat "$license_dir/$name" >> "$bundle"
  printf '\n' >> "$bundle"
done
echo "FFMPEG_MACOS_LICENSE_FILE=$bundle" >> "$GITHUB_ENV"
