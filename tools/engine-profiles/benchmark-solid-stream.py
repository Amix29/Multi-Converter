import json
import lzma
import os
import time
import zipfile
from pathlib import Path

root = Path.cwd()
(root / "tmp").mkdir(exist_ok=True)
lo = root / 'src-tauri/bundled-engine-profiles/windows-x64/current/libreoffice'
assert (lo.parent / 'libreoffice-profile.json').is_file(), 'Wait for verified LibreOffice profile'
target = Path(os.environ.get('CARGO_TARGET_DIR') or (Path(os.environ['LOCALAPPDATA']) / 'Temp/mc-cargo-target-svelte-migration'))
started = time.perf_counter()
compressor = lzma.LZMACompressor(format=lzma.FORMAT_RAW, filters=[{
    'id': lzma.FILTER_LZMA1, 'dict_size': 128 * 1024 * 1024,
    'lc': 3, 'lp': 0, 'pb': 2, 'mode': lzma.MODE_NORMAL, 'nice_len': 64, 'mf': lzma.MF_BT4,
}])
processed = compressed = 0
last_log = started
groups = []

def feed(stream):
    global processed, compressed, last_log
    while block := stream.read(1024 * 1024):
        processed += len(block)
        compressed += len(compressor.compress(block))
        if time.perf_counter() - last_log > 15:
            print(json.dumps({'rawMiB': round(processed / 1048576, 1), 'lzmaMiB': round(compressed / 1048576, 1), 'seconds': round(time.perf_counter() - started)}), flush=True)
            last_log = time.perf_counter()

def files_group(name, files):
    before_raw, before_compressed = processed, compressed
    for file in files:
        with file.open('rb') as stream:
            feed(stream)
    group = {'name': name, 'rawBytes': processed - before_raw, 'incrementalCompressedBytes': compressed - before_compressed}
    groups.append(group)
    print(json.dumps(group), flush=True)

files_group('application', [target / 'release/multi-converter.exe'])
files_group('project-notices', [root / 'LICENSE', root / 'NOTICE'])
files_group('libreoffice-headless-v2', sorted(file for file in lo.rglob('*') if file.is_file()))
files_group('ocr-models', sorted(file for file in (root / 'src-tauri/ocr-resources/models').rglob('*') if file.is_file()))
before_raw, before_compressed = processed, compressed
with zipfile.ZipFile(root / 'src-tauri/ocr-resources/runtime/windows-x64.zip') as archive:
    for info in sorted(archive.infolist(), key=lambda info: info.filename):
        if not info.is_dir():
            with archive.open(info) as stream:
                feed(stream)
groups.append({'name': 'identical-ocr-runtime', 'rawBytes': processed - before_raw, 'incrementalCompressedBytes': compressed - before_compressed})
print(json.dumps(groups[-1]), flush=True)
for name in ['libvips', 'pandoc', 'pdfium']:
    files_group(name, sorted(file for file in (root / f'src-tauri/bundled-engines/{name}').rglob('*') if file.is_file()))
files_group('ffmpeg-ffprobe', [root / f'src-tauri/binaries/{name}-x86_64-pc-windows-msvc.exe' for name in ['ffmpeg', 'ffprobe']])
compressed += len(compressor.flush())
report = {
    'method': 'Streaming LZMA1 with 128 MiB dictionary into an output byte counter; no archive or engine copy written',
    'rawBytes': processed, 'compressedStreamBytes': compressed, 'seconds': round(time.perf_counter() - started, 2),
    'groups': groups, 'limits': 'Estimator for solid installer compression, not a measured setup. NSIS instructions, exact file order and encoder settings may change the result.',
}
(root / 'tmp/engine-lzma-estimate.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2), flush=True)
