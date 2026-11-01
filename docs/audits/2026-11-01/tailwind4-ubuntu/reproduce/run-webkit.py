#!/usr/bin/env python3
"""Exercise generated Tailwind CSS in the installed GTK WebKit engine."""
import json
import os
from pathlib import Path
import sys
import time
import gi
gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib, Gdk

base = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)
settings = Gtk.Settings.get_default()
settings.set_property('gtk-enable-animations', os.environ.get('PROBE_REDUCED_MOTION') != '1')
manager = WebKit2.UserContentManager()
manager.register_script_message_handler('probe')
view = WebKit2.WebView.new_with_user_content_manager(manager)
view.get_settings().set_enable_write_console_messages_to_stdout(True)
window = Gtk.Window()
window.set_title('Multi-Converter — Tailwind 4 WebKitGTK compatibility probe')
window.add(view)
window.set_default_size(1440, 840)
window.connect('destroy', Gtk.main_quit)
scenarios = [(theme, width) for theme in ['light', 'dark'] for width in [375, 768, 1024, 1440]]
results = []
started = time.time()
metadata = {
    'runtime': 'native WebKitGTK via Python GI (same engine family as Linux Tauri; not packaged app acceptance)',
    'osRelease': Path('/etc/os-release').read_text(),
    'webkit': '.'.join(str(v()) for v in [WebKit2.get_major_version, WebKit2.get_minor_version, WebKit2.get_micro_version]),
    'reducedMotionRequested': os.environ.get('PROBE_REDUCED_MOTION') == '1',
}

def finish():
    report = {**metadata, 'elapsedSeconds': round(time.time()-started, 2), 'scenarios':results,
              'passed':sum(r['passed'] for r in results), 'failed':sum(len(r['failed']) for r in results)}
    (out / 'report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps({k: report[k] for k in ['webkit','passed','failed','elapsedSeconds']}) , flush=True)
    Gtk.main_quit()

def next_scenario():
    if not scenarios:
        finish()
        return False
    theme, width = scenarios.pop(0)
    window.resize(width, 840)
    def keyboard_input():
        view.grab_focus()
        Gdk.test_simulate_key(window.get_window(), 10, 10, Gdk.KEY_Tab, Gdk.ModifierType(0), Gdk.EventType.KEY_PRESS)
        Gdk.test_simulate_key(window.get_window(), 10, 10, Gdk.KEY_Tab, Gdk.ModifierType(0), Gdk.EventType.KEY_RELEASE)
        return False
    def evaluate():
        code = f'runProbe({json.dumps(theme)}, {width}).then(value => window.webkit.messageHandlers.probe.postMessage(JSON.stringify(value))).catch(error => window.webkit.messageHandlers.probe.postMessage(JSON.stringify({{fatal:String(error)}})))'
        view.run_javascript(code, None, None, None)
        return False
    GLib.timeout_add(450, keyboard_input)
    GLib.timeout_add(700, evaluate)
    return False

def snapshot_ready(widget, task, _):
    try:
        surface = widget.get_snapshot_finish(task)
        result = results[-1]
        surface.write_to_png(str(out / f"{result['theme']}-{result['width']}.png"))
    except Exception as error:
        metadata.setdefault('snapshotErrors', []).append(str(error))
    GLib.idle_add(next_scenario)

def received(_, message):
    result = json.loads(message.get_js_value().to_string())
    if 'fatal' in result:
        metadata['fatal'] = result['fatal']
        finish()
        return
    results.append(result)
    print(f"{result['theme']} {result['width']}: {result['passed']} passed, {len(result['failed'])} failed", flush=True)
    view.get_snapshot(WebKit2.SnapshotRegion.VISIBLE, WebKit2.SnapshotOptions.NONE, None, snapshot_ready, None)

def loaded(_, event):
    if event == WebKit2.LoadEvent.FINISHED:
        GLib.idle_add(next_scenario)

def timeout():
    metadata['fatal'] = '120-second harness timeout'
    finish()
    return False

manager.connect('script-message-received::probe', received)
view.connect('load-changed', loaded)
window.show_all()
view.load_uri((base / 'index.html').as_uri())
GLib.timeout_add_seconds(120, timeout)
Gtk.main()
sys.exit(1 if len(results) != 8 or any(r['failed'] for r in results) or metadata.get('fatal') else 0)
