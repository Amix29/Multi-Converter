"""Check normal/delayed PE imports; never accept host MSVC DLL fallback."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import pefile

parser = argparse.ArgumentParser()
parser.add_argument('--runtime', type=Path, required=True)
parser.add_argument('--report', type=Path, required=True)
args = parser.parse_args()
if sys.platform != 'win32':
    raise RuntimeError('PE import closure must be checked on Windows')
root = args.runtime.resolve(strict=True)
system = Path(os.environ['SystemRoot']) / 'System32'
local = {file.name.lower() for file in root.iterdir() if file.is_file()}
report = {'scope': 'Normal/delayed PE imports on the observed Windows host; not a clean-OS launch test',
          'files': [], 'missing': []}
for file in sorted(root.iterdir()):
    if file.suffix.lower() not in ['.exe', '.dll']:
        continue
    if file.is_symlink() or not file.is_file() or file.stat().st_size > 80 * 1024 * 1024:
        raise ValueError('Unexpected runtime PE input')
    image = pefile.PE(str(file), fast_load=True)
    image.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_IMPORT'],
                                             pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT']])
    names = sorted({item.dll.decode('ascii').lower()
                    for kind in ['DIRECTORY_ENTRY_IMPORT', 'DIRECTORY_ENTRY_DELAY_IMPORT']
                    for item in getattr(image, kind, [])})
    image.close()
    imports = []
    for name in names:
        if name.startswith(('python', 'paddle')):
            where = 'forbidden Python/Paddle dependency'
            report['missing'].append(name)
        elif name in local:
            where = 'bundled locally'
        elif name.startswith(('api-ms-', 'ext-ms-')):
            where = 'Windows API set'
        elif name.startswith(('msvcp', 'vcruntime', 'vcomp', 'concrt')):
            where = 'unbundled Microsoft redistributable'
            report['missing'].append(name)
        elif (system / name).is_file():
            where = 'Windows System32 on observed host'
        else:
            where = 'unresolved import'
            report['missing'].append(name)
        imports.append({'name': name, 'resolution': where})
    report['files'].append({'name': file.name, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                            'imports': imports})
report['missing'] = sorted(set(report['missing']))
report['result'] = 'passed' if not report['missing'] else 'failed'
args.report.parent.mkdir(parents=True, exist_ok=True)
args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
if report['missing']:
    raise RuntimeError('Missing native runtime DLL closure: ' + ', '.join(report['missing']))
print(json.dumps({'files': len(report['files']), 'result': report['result'],
                  'msvcSystemFallback': 'forbidden', 'pythonPaddleImports': 'none'}))
