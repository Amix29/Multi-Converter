"""Screen reversible byte shuffles; never write or change model weights."""
import argparse
import hashlib
import json
import lzma
import time
import zlib
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--root', default='src-tauri/bundled-engine-profiles/windows-x64/v3/ocr/models')
parser.add_argument('--pattern', default='*/inference.pdiparams')
parser.add_argument('--widths', default='1,2,4,8,16')
args = parser.parse_args()
root = Path(args.root)
widths = sorted({int(value) for value in args.widths.split(',')})
if 1 not in widths or any(value < 1 or value > 16 for value in widths):
    raise ValueError('Include baseline width 1; maximum width is 16')
report = {'scope': 'Experimental compression only; no setup or runtime change',
          'roundtrip': 'Every shuffled buffer inverted and SHA256 compared in memory',
          'models': []}
for file in sorted(root.glob(args.pattern)):
    started = time.monotonic()
    original = file.read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    cases = []
    for width in widths:
        size = len(original) // width * width
        transformed = b''.join(original[i:size:width] for i in range(width)) + original[size:]
        restored = bytearray(len(original))
        stride = size // width
        for i in range(width):
            restored[i:size:width] = transformed[i * stride:(i + 1) * stride]
        restored[size:] = transformed[size:]
        assert hashlib.sha256(restored).hexdigest() == digest
        compressed = zlib.compress(transformed, 9)
        cases.append({'width': width, 'zlibBytes': len(compressed), 'roundtrip': True})
        del compressed, restored
    # Compare the most promising shuffle and the untouched model with the
    # same strong LZMA settings; sizes from different encoders are not mixed.
    best = min(cases, key=lambda item: item['zlibBytes'])['width']
    for width in sorted({1, best}):
        size = len(original) // width * width
        transformed = b''.join(original[i:size:width] for i in range(width)) + original[size:]
        filters = [{'id': lzma.FILTER_LZMA2, 'dict_size': 64 * 1024 * 1024,
                    'nice_len': 273, 'mf': lzma.MF_BT4}]
        compressed = lzma.compress(transformed, format=lzma.FORMAT_RAW, filters=filters)
        assert lzma.decompress(compressed, format=lzma.FORMAT_RAW, filters=filters) == transformed
        next(item for item in cases if item['width'] == width)['lzmaBytes'] = len(compressed)
        del compressed
    result = {'model': file.parent.name, 'bytes': len(original), 'sha256': digest,
              'cases': cases, 'seconds': round(time.monotonic() - started, 2)}
    report['models'].append(result)
    Path(args.output).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result), flush=True)
print('All model shuffle roundtrips passed; originals never modified.', flush=True)
