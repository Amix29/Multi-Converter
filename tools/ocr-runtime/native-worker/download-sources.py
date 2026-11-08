"""Explicit build-time fetch of checksum-pinned sources; never used by the app."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

parser=argparse.ArgumentParser()
parser.add_argument('--cache',type=Path,required=True)
args=parser.parse_args()
here=Path(__file__).parent

def sha(file):
    with file.open('rb') as source:return hashlib.file_digest(source,'sha256').hexdigest()

def download(url,target,size,expected):
    if target.exists():
        if target.is_symlink() or target.stat().st_size!=size or sha(target)!=expected:
            raise ValueError(f'Existing source differs; preserve it before retrying: {target}')
        return
    target.parent.mkdir(parents=True,exist_ok=True)
    partial=target.with_name(target.name+'.part')
    total=0
    with urllib.request.urlopen(url,timeout=60) as response,partial.open('xb') as output:
        while block:=response.read(1024*1024):
            total+=len(block)
            if total>size:raise ValueError('Source exceeds pinned size')
            output.write(block)
    if total!=size or sha(partial)!=expected:raise ValueError('Source digest/length mismatch')
    partial.rename(target)

models=json.loads((here/'model-sources.json').read_text(encoding='utf-8'))
for model in models:
    file=next(file for file in model['files'] if file['rfilename']=='inference.onnx')
    url=f'https://huggingface.co/{model["repo"]}/resolve/{model["revision"]}/inference.onnx'
    download(url,args.cache/'models'/model['id']/'inference.onnx',file['size'],file['lfs']['sha256'])

runtime=json.loads((here/'runtime-sources.json').read_text(encoding='utf-8'))
wheel=runtime['wheel']
archive=args.cache/wheel['file']
download(wheel['url'],archive,wheel['bytes'],wheel['sha256'])
with zipfile.ZipFile(archive) as source:
    for file in runtime['files']:
        name='onnxruntime/'+file['path']
        if source.getinfo(name).file_size!=file['bytes']:raise ValueError('Unexpected wheel member size')
        target=args.cache/'onnxruntime'/file['path']
        if target.exists():
            if target.is_symlink() or sha(target)!=file['sha256']:raise ValueError('Existing runtime source differs')
            continue
        data=source.read(name)
        if hashlib.sha256(data).hexdigest()!=file['sha256']:raise ValueError('Runtime source digest mismatch')
        target.parent.mkdir(parents=True,exist_ok=True)
        with target.open('xb') as output:output.write(data)
print('Verified all five full-precision models and the ONNX CPU DLL/notices; no app-time downloader.',flush=True)
