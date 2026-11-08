"""Prepare verified native OCR model storage; no network or runtime copies."""
import argparse
import hashlib
import json
import os
import struct
from pathlib import Path

import yaml

parser = argparse.ArgumentParser()
parser.add_argument('--onnx-source', type=Path, required=True)
parser.add_argument('--reference', type=Path, default=Path('src-tauri/ocr-resources/models'))
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--shuffle', action='store_true')
parser.add_argument('--resume', action='store_true')
args = parser.parse_args()
policy = json.loads(Path(__file__).with_name('model-sources.json').read_text(encoding='utf-8'))
reference = json.loads((args.reference/'models-lock.json').read_text(encoding='utf-8'))
expected = json.loads(Path('src-tauri/ocr-runtime-lock.json').read_text(encoding='utf-8'))['modelArtifact']
if any(reference[key]!=expected[key] for key in ('fileCount','totalBytes','aggregateSha256')):
    raise ValueError('Reference model manifest differs from embedded origin')
source_aggregate = hashlib.sha256()
for file in reference['files']:
    source_aggregate.update(f'{file["path"]}\0{file["bytes"]}\0{file["sha256"]}\n'.encode('utf-8'))
if source_aggregate.hexdigest()!=expected['aggregateSha256']:
    raise ValueError('Reference model manifest content changed')
expected_reference = {item['path']: item for item in reference['files']}
args.output.mkdir(parents=True, exist_ok=args.resume)
digest = lambda value: hashlib.sha256(value).hexdigest()
sources = []
for model in policy:
    item = next(file for file in model['files'] if file['rfilename']=='inference.onnx')
    source = args.onnx_source/model['id']/'inference.onnx'
    if source.is_symlink() or source.stat().st_size != item['size'] or item['size']>80*1024*1024:
        raise ValueError(f'Unexpected model source: {model["id"]}')
    original = source.read_bytes()
    if digest(original)!=item['lfs']['sha256']:
        raise ValueError(f'Model source digest mismatch: {model["id"]}')
    target = args.output/model['id']/'inference.onnx'
    target.parent.mkdir(exist_ok=args.resume)
    if args.shuffle:
        aligned = len(original)//4*4
        encoded = b''.join(original[channel:aligned:4] for channel in range(4))+original[aligned:]
        restored = bytearray(len(original))
        stride = aligned//4
        for channel in range(4):
            restored[channel:aligned:4] = encoded[channel*stride:(channel+1)*stride]
        restored[aligned:] = encoded[aligned:]
        if restored!=original:
            raise ValueError('Lossless shuffle roundtrip failed')
        stored = b'MCOSHF01'+struct.pack('<Q',len(original))+encoded
        if target.exists():
            if not args.resume or target.is_symlink() or digest(target.read_bytes())!=digest(stored):
                raise ValueError('Existing stored model differs; refusing overwrite')
        else:
            with target.open('xb') as output:
                output.write(stored)
        del stored
        del encoded,restored
    else:
        if target.exists():
            if not args.resume or target.is_symlink() or digest(target.read_bytes())!=digest(original):
                raise ValueError('Existing model differs; refusing overwrite')
        else:
            os.link(source,target)
    config_name = model['id']+'/inference.yml'
    config_source = args.reference/config_name
    config = config_source.read_bytes()
    if digest(config)!=expected_reference[config_name]['sha256']:
        raise ValueError('Reference model configuration changed')
    config_target=target.with_name('inference.yml')
    if config_target.exists():
        if not args.resume or config_target.is_symlink() or digest(config_target.read_bytes())!=digest(config):
            raise ValueError('Existing configuration differs; refusing overwrite')
    else:
        os.link(config_source,config_target)
    sources.append({key:model[key] for key in ('id','repo','revision','license')}
                  | {'originalSha256':digest(original),'originalBytes':len(original),
                     'storedSha256':digest(target.read_bytes()),'storedBytes':target.stat().st_size})
    del original

config = yaml.safe_load((args.reference/'text-recognition/inference.yml').read_text(encoding='utf-8'))
characters = config['PostProcess']['character_dict']
if len(characters)!=18708 or any(not isinstance(c,str) or '\n' in c or '\r' in c for c in characters):
    raise ValueError('Unexpected character dictionary')
dictionary = ('\r\n'.join(characters)+'\r\n').encode('utf-8')
if digest(dictionary)!='769e7fa79bb297b5f18d8dbd149e364a45bc61f2b3f574e5ea836f0b261c23a6':
    raise ValueError('Character dictionary differs from the reference')
dictionary_file=args.output/'characters.txt'
if dictionary_file.exists():
    if not args.resume or dictionary_file.is_symlink() or digest(dictionary_file.read_bytes())!=digest(dictionary):
        raise ValueError('Existing dictionary differs; refusing overwrite')
else:
    dictionary_file.write_bytes(dictionary)
files=[]
for file in sorted(args.output.rglob('*')):
    if file.is_file():
        if file.name=='models-lock.json' and file.parent==args.output:
            continue
        files.append(dict(path=file.relative_to(args.output).as_posix(),bytes=file.stat().st_size,sha256=digest(file.read_bytes())))
allowed={model['id']+'/'+name for model in policy for name in ('inference.onnx','inference.yml')}|{'characters.txt'}
if {file['path'] for file in files}!=allowed:
    raise ValueError('Unexpected model files in staging')
aggregate=hashlib.sha256()
for file in files:
    aggregate.update(f'{file["path"]}\0{file["bytes"]}\0{file["sha256"]}\n'.encode('utf-8'))
manifest=dict(schemaVersion=1,model='PP-OCRv6_medium',distributionProfile='windows-native-ocr-v1',
              sourceAggregateSha256=reference['aggregateSha256'],encoding='byte-shuffle4-v1' if args.shuffle else 'raw-onnx',
              fileCount=len(files),totalBytes=sum(file['bytes'] for file in files),aggregateSha256=aggregate.hexdigest(),
              sources=sources,files=files)
(args.output/'models-lock.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps({key:manifest[key] for key in ('encoding','fileCount','totalBytes','aggregateSha256')}),flush=True)
