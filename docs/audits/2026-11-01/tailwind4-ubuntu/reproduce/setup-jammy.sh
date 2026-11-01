#!/usr/bin/env bash
set -euo pipefail
base=/home/ryadb/tailwind4-ubuntu-probe
root="$base/jammy"
mkdir -p "$root"
cd "$base"
url=https://cdimage.ubuntu.com/ubuntu-base/releases/22.04/release
curl -fL --retry 2 "$url/SHA256SUMS" -o SHA256SUMS
curl -fL --retry 2 "$url/ubuntu-base-22.04.5-base-amd64.tar.gz" -o ubuntu-base.tar.gz
expected=$(awk '$2 == "*ubuntu-base-22.04.5-base-amd64.tar.gz" || $2 == "ubuntu-base-22.04.5-base-amd64.tar.gz" {print $1}' SHA256SUMS)
test ${#expected} -eq 64
printf '%s  ubuntu-base.tar.gz\n' "$expected" | sha256sum -c -
tar -xzf ubuntu-base.tar.gz -C "$root"
cp /etc/resolv.conf "$root/etc/resolv.conf"
mount --bind /dev "$root/dev"
mount -t proc proc "$root/proc"
mount --bind /sys "$root/sys"
trap 'umount "$root/sys"; umount "$root/proc"; umount "$root/dev"' EXIT
printf '#!/bin/sh\nexit 101\n' > "$root/usr/sbin/policy-rc.d"
chmod +x "$root/usr/sbin/policy-rc.d"
chroot "$root" /usr/bin/env DEBIAN_FRONTEND=noninteractive apt-get update
chroot "$root" /usr/bin/env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3-gi python3-cairo gir1.2-webkit2-4.1 xvfb xauth fonts-dejavu-core dbus-x11
chroot "$root" dpkg-query -W libwebkit2gtk-4.1-0 gir1.2-webkit2-4.1
