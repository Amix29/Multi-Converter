"""Decode two checksum-pinned Microsoft files; never execute the installer."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--cache', type=Path, required=True)
parser.add_argument('--source-exe', type=Path)
args = parser.parse_args()
if sys.platform != 'win32':
    raise RuntimeError('Microsoft CAB preparation requires Windows expand.exe')
lock = json.loads(Path(__file__).with_name('microsoft-runtime-sources.json').read_text(encoding='utf-8'))
args.cache.mkdir(parents=True, exist_ok=True)
parts = args.cache / 'parts'
parts.mkdir(exist_ok=True)

def sha(file):
    with file.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def verify(file, expected):
    if file.is_symlink() or not file.is_file() or file.stat().st_size != expected['bytes'] or sha(file) != expected['sha256']:
        raise ValueError(f'Changed Microsoft source; preserve it before retrying: {file}')

archive = args.cache / lock['archive']['file']
if not archive.exists():
    if args.source_exe:
        verify(args.source_exe, lock['archive'])
        os.link(args.source_exe, archive)
    else:
        partial = archive.with_suffix('.part')
        total = 0
        with urllib.request.urlopen(lock['archive']['url'], timeout=60) as response, partial.open('xb') as output:
            while block := response.read(1024 * 1024):
                total += len(block)
                if total > lock['archive']['bytes']:
                    raise ValueError('Microsoft source exceeds pinned size')
                output.write(block)
        verify(partial, lock['archive'])
        partial.rename(archive)
verify(archive, lock['archive'])

def cabinet(name):
    spec = lock[name]
    target = parts / (name + '.cab')
    if not target.exists():
        with archive.open('rb') as source:
            source.seek(spec['offset'])
            data = source.read(spec['bytes'])
        if len(data) != spec['bytes'] or hashlib.sha256(data).hexdigest() != spec['sha256']:
            raise ValueError('Invalid bounded Microsoft CAB slice')
        with target.open('xb') as output:
            output.write(data)
    verify(target, spec)
    return target

def expand(cab, member, expected):
    if Path(member).name != member:
        raise ValueError('Unexpected CAB member path')
    target = parts / member
    if not target.exists():
        subprocess.run([str(Path(os.environ['SystemRoot']) / 'System32/expand.exe'), '-F:' + member,
                        str(cab.resolve()), str(parts.resolve())], check=True,
                       stdout=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
    verify(target, expected)
    return target

minimum = lock['minimumCab']
inner = expand(cabinet('minimumCab'), minimum['member'],
               {'bytes': minimum['memberBytes'], 'sha256': minimum['memberSha256']})
for index, item in enumerate(lock['files']):
    source = expand(inner if index == 0 else cabinet('metadataCab'), item['sourceMember'], item)
    target = args.cache / item['path']
    if not target.exists():
        os.link(source, target)
    verify(target, item)
print(json.dumps({'version': lock['version'], 'result': 'Verified DLL and original license-link metadata; no installer executed',
                  'files': [{'path': item['path'], 'bytes': item['bytes'], 'sha256': item['sha256']} for item in lock['files']]}))
