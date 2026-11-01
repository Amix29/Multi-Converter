#!/usr/bin/env python3
"""Exercise the actual compiled mock preview with the installed GTK WebKit.
This is engine/UI evidence, not Tauri IPC, real conversion or package acceptance.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import gi

gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib, Gdk

root = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=True)
probe = (root / 'scripts/probes/svelte-webview.js').read_text()
server = subprocess.Popen(['node', 'node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4189', '--strictPort'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
Gtk.Settings.get_default().set_property('gtk-enable-animations', False)
manager = WebKit2.UserContentManager()
manager.register_script_message_handler('migration')
initial = "window.__migrationProbeErrors=[];window.addEventListener('error',e=>window.__migrationProbeErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__migrationProbeErrors.push(String(e.reason)));localStorage.setItem('multi-converter.theme',new URLSearchParams(location.search).get('probeTheme')||'light');"
manager.add_script(WebKit2.UserScript.new(initial, WebKit2.UserContentInjectedFrames.TOP_FRAME, WebKit2.UserScriptInjectionTime.START, None, None))
view = WebKit2.WebView.new_with_user_content_manager(manager)
window = Gtk.Window(title='Multi-Converter Svelte WebKit probe')
window.add(view)
window.set_default_size(1440, 900)
window.connect('destroy', Gtk.main_quit)
scenarios = [(theme, width) for theme in ['light', 'dark'] for width in [375, 768, 1024, 1440]]
results = []
started = time.time()
metadata = {'runtime': 'WebKitGTK compiled product mock preview; not Tauri IPC or installed acceptance', 'osRelease': Path('/etc/os-release').read_text(), 'webkit': '.'.join(str(fn()) for fn in [WebKit2.get_major_version, WebKit2.get_minor_version, WebKit2.get_micro_version])}

def finish(fatal=None):
    if fatal:
        metadata['fatal'] = fatal
    report = {**metadata, 'elapsedSeconds': round(time.time()-started, 2), 'scenarios': results, 'passed': sum(row['passed'] for row in results), 'failed': sum(sum(not item['passed'] for item in row['checks']) for row in results)}
    (output/'report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({key: report[key] for key in ['webkit', 'passed', 'failed', 'elapsedSeconds']}), flush=True)
    Gtk.main_quit()
    return False

def next_scenario():
    if not scenarios:
        return finish()
    theme, width = scenarios.pop(0)
    window.resize(width, 900)
    view.load_uri(f'http://127.0.0.1:4189/?mockWelcomeSeen=1&mockMediaFiles=1&probeTheme={theme}&probeWidth={width}')
    return False

def loaded(widget, event):
    if event != WebKit2.LoadEvent.FINISHED:
        return
    def evaluate():
        window.present()
        window.get_window().focus(Gdk.CURRENT_TIME)
        view.grab_focus()
        for event_type in [Gdk.EventType.KEY_PRESS, Gdk.EventType.KEY_RELEASE]:
            Gdk.test_simulate_key(window.get_window(), 10, 10, Gdk.KEY_Tab, Gdk.ModifierType(0), event_type)
        code = probe + "\nrunMigrationProbe(new URLSearchParams(location.search).get('probeTheme'),Number(new URLSearchParams(location.search).get('probeWidth'))).then(value=>window.webkit.messageHandlers.migration.postMessage(JSON.stringify(value)))"
        view.run_javascript(code, None, None, None)
        return False
    GLib.timeout_add(300, evaluate)

def snapshot_ready(widget, task, _):
    try:
        surface = widget.get_snapshot_finish(task)
        row = results[-1]
        surface.write_to_png(str(output/f"webkit-{row['theme']}-{row['width']}.png"))
    except Exception as error:
        metadata.setdefault('snapshotErrors', []).append(str(error))
    GLib.idle_add(next_scenario)

def received(_, message):
    result = json.loads(message.get_js_value().to_string())
    results.append(result)
    view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, snapshot_ready, None)

manager.connect('script-message-received::migration', received)
view.connect('load-changed', loaded)
view.connect('web-process-terminated', lambda *_: finish('web process terminated'))
window.show_all()
GLib.timeout_add(700, next_scenario)
GLib.timeout_add_seconds(110, lambda: finish('probe timeout'))
try:
    Gtk.main()
finally:
    server.terminate()
    server.wait(timeout=10)
if len(results) != 8 or any(not row['passed'] for row in results):
    sys.exit(1)
