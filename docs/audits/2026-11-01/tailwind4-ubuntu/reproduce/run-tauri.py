#!/usr/bin/env python3
import ctypes
import ctypes.util
import json
from pathlib import Path
import subprocess
import sys
import time
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Gtk, Gdk

base = Path(sys.argv[1]).resolve()
out = base / 'results/tauri-ubuntu-24.04'
out.mkdir(parents=True, exist_ok=True)
Gtk.init([])
x11 = ctypes.CDLL(ctypes.util.find_library('X11'))
xtst = ctypes.CDLL(ctypes.util.find_library('Xtst'))
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XFlush.argtypes = [ctypes.c_void_p]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
display = x11.XOpenDisplay(None)
assert display
tab = x11.XKeysymToKeycode(display, 0xff09)
process = subprocess.Popen([str(base / 'tauri-target/debug/mc-tailwind-linux-probe')], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
results = []
log = []
started = time.time()
for line in process.stdout:
    log.append(line)
    if line.startswith('PROBE_KEYBOARD'):
        xtst.XTestFakeKeyEvent(display, tab, 1, 0)
        xtst.XTestFakeKeyEvent(display, tab, 0, 0)
        x11.XFlush(display)
    elif line.startswith('PROBE_REPORT='):
        result = json.loads(line.split('=', 1)[1])
        results.append(result)
        pixbuf = Gdk.pixbuf_get_from_window(Gdk.get_default_root_window(), 0, 0, result['width'], result['height'])
        pixbuf.savev(str(out / f"{result['theme']}-{result['width']}.png"), 'png', [], [])
        print(f"{result['theme']} {result['width']}: {result['passed']} passed, {len(result['failed'])} failed", flush=True)
    else:
        print(line, end='', flush=True)
code = process.wait(timeout=30)
report = {'runtime':'actual Tauri 2.12.5 development binary, static Tailwind fixture; not migrated Multi-Converter', 'osRelease':Path('/etc/os-release').read_text(), 'processExitCode':code, 'elapsedSeconds':round(time.time()-started,2), 'scenarios':results, 'passed':sum(r['passed'] for r in results), 'failed':sum(len(r['failed']) for r in results)}
(out / 'report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
(out / 'process.log').write_text(''.join(log))
print(json.dumps({k:report[k] for k in ['processExitCode','passed','failed','elapsedSeconds']}))
sys.exit(0 if code == 0 and len(results) == 8 and report['failed'] == 0 else 1)
