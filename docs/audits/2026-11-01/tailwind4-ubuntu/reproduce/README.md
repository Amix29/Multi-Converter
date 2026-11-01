# Reproduce the isolated Ubuntu Tailwind 4 probe

This fixture tests generated CSS in native GTK WebKit and a minimal Tauri host.
It contains no Svelte/shadcn components and performs no conversions or OCR.
Use the accompanying JSON reports as the recorded result; this directory is not
part of the application build or an approved production configuration.

## Requirements

The recorded run used Ubuntu 24.04 x64 under WSL2, native Node 24.16.0/npm
11.13.0, Rust/Cargo 1.96.0 and the Ubuntu WebKitGTK development libraries. All
npm packages and Rust builds live on the Linux filesystem, not `/mnt/c`.

The existing development host already contained most dependencies. A fresh
Ubuntu host needs the Tauri Linux prerequisites plus Python GI/Cairo, Xvfb,
xauth, dbus-x11, fonts-dejavu-core and libxtst6. The capture bridge specifically
requires `python3-gi-cairo`. Use the repository Linux prerequisites documented
in `docs/TESTING.md` and install the missing capture dependencies from Ubuntu.

The shell scripts expect the Windows-side source fixture at
`<repository>/tmp/tailwind4-ubuntu/`, and use the owned Linux working directory
`/home/ryadb/tailwind4-ubuntu-probe`. Inspect and adapt those paths for another
account. Preserve existing results/rootfs; do not run setup over another tree.

## Commands

From the repository root, copy this directory's contents into the ignored
`tmp/tailwind4-ubuntu/`. Execute the following using native Ubuntu tools (the
source scripts may be read from `/mnt/c`, but installs and builds stay on Linux):

```bash
bash <repository>/tmp/tailwind4-ubuntu/prepare.sh
bash <repository>/tmp/tailwind4-ubuntu/run-noble.sh
```

The archived fixture includes the exact npm lock for Tailwind/CLI 4.3.3. The
preparation script uses `npm ci` when that lock is present. Normal/reduced-motion
reports and screenshots are written below the owned Linux `results/` directory.

For the isolated Jammy userspace, run the following as WSL root. The setup step
is for a fresh owned rootfs only; skip it when the recorded rootfs already exists:

```bash
bash <repository>/tmp/tailwind4-ubuntu/setup-jammy.sh
bash <repository>/tmp/tailwind4-ubuntu/run-jammy.sh
```

Setup downloads Ubuntu Base 22.04.5 and checks its official SHA-256 before
extracting; apt installs Jammy packages inside that rootfs. The runner uses
Xvfb/software rendering. WebKit sandbox disabling is limited to this root-owned
CSS fixture. Cleanup stops only processes whose filesystem root is the owned
Jammy rootfs, then unmounts its `/sys`, `/proc` and `/dev` bindings. No user tree
or source files are deleted. The extracted rootfs remains for recovery/reuse.

For the actual Tauri host, ensure the locked crates are cached first:

```bash
cd <repository>/tmp/tailwind4-ubuntu/tauri
cargo fetch --locked
bash <repository>/tmp/tailwind4-ubuntu/build-tauri.sh
cd /home/ryadb/tailwind4-ubuntu-probe
GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 timeout 90s \
  xvfb-run -a -s '-screen 0 1920x1080x24' dbus-run-session -- \
  python3 run-tauri.py /home/ryadb/tailwind4-ubuntu-probe
```

The build copies only static fixture assets into its public directory, uses
the project's existing icon, and compiles offline with the archived Cargo lock.
The controller sends native Tab events through XTest before the focus assertion.
The result is an actual Tauri development binary on Ubuntu 24.04, not an AppImage
or the migrated Multi-Converter application.

The fixture uses a strict self-only script CSP and an inline-style allowance.
Native evaluation runs the controller; no JavaScript `eval()` allowance is added.
It does not establish equivalence to the full product's IPC/CSP policy.

## Verification contract

Each of eight scenarios has 26 assertions. A successful runner exits zero and
records eight results with zero failed assertions, plus eight PNG snapshots.
Inspect the `reducedMotion` readback to confirm the actual preference, rather
than relying on the requested environment variable alone. Review captures in
addition to computed styles. The current source requires no network at runtime.
