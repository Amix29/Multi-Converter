"""Exercise the real standalone worker; uses only synthetic fixtures."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time
import uuid

parser=argparse.ArgumentParser()
parser.add_argument('--worker',type=Path,required=True)
parser.add_argument('--models',type=Path,required=True)
parser.add_argument('--report',type=Path,required=True)
args=parser.parse_args()
worker=args.worker.resolve()
models=args.models.resolve()
output=Path('tmp')/f'native-ocr-lifecycle-{uuid.uuid4().hex}'
output.mkdir(parents=True)
image=Path('tests/fixtures/ocr/phase-6/clean-fr.png').resolve()
if not image.is_file():
    manifest=json.loads(Path('tests/fixtures/ocr/corpus-manifest.json').read_text(encoding='utf-8'))
    image=Path(next(case['input'] for case in manifest['cases'] if case['id']=='clean-fr-1')).resolve()
digest=lambda file:hashlib.sha256(file.read_bytes()).hexdigest()
original=digest(image)
environment={**os.environ,'MC_NATIVE_ORT_DLL':'must-not-be-used','MC_NATIVE_TRACE':''}
loaded_modules=[]

def start(executable=worker):
    process=subprocess.Popen([str(executable),'--serve','--models',str(models),'--provider','cpu'],
        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',
        env=environment,creationflags=subprocess.CREATE_NO_WINDOW)
    messages=queue.Queue()
    def read():
        for line in process.stdout:
            messages.put(json.loads(line))
    threading.Thread(target=read,daemon=True).start()
    try:
        assert messages.get(timeout=30)=={'type':'ready','schemaVersion':1}
        script=("[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); "
            f"@(Get-Process -Id {process.pid}).Modules | "
            "Where-Object { $_.ModuleName -match '^(msvcp140|vcruntime140|onnxruntime)' } | "
            "Select-Object ModuleName,FileName | ConvertTo-Json -Compress")
        query=subprocess.run(['powershell.exe','-NoProfile','-Command',script],capture_output=True,
            text=True,encoding='utf-8',check=True,creationflags=subprocess.CREATE_NO_WINDOW)
        modules=json.loads(query.stdout)
        if isinstance(modules,dict):modules=[modules]
        assert any(item['ModuleName'].lower()=='msvcp140_1.dll'for item in modules)
        assert any(item['ModuleName'].lower()=='onnxruntime.dll'for item in modules)
        for item in modules:assert Path(item['FileName']).resolve().parent==executable.parent
        loaded_modules.append(modules)
    except BaseException:
        if process.poll()is None:process.terminate();process.wait(timeout=10)
        raise
    return process,messages

def send(process,job,input_path,target):
    process.stdin.write(json.dumps(dict(schemaVersion=1,jobId=job,input=str(input_path),output=str(target)))+'\n')
    process.stdin.flush()

process,messages=start()
try:
    send(process,'missing',output/'absent.png',output/'missing.json')
    assert messages.get(timeout=10)['type']=='failed'
    assert not (output/'missing.json').exists()
    process.stdin.write('malformed json\n');process.stdin.flush()
    assert messages.get(timeout=10)['type']=='failed'
    send(process,'source-protection',image,image)
    assert messages.get(timeout=10)['type']=='failed'
    assert digest(image)==original
    send(process,'cancel',image,(output/'cancel.json').resolve())
    time.sleep(.25);process.terminate();process.wait(timeout=10)
    assert not (output/'cancel.json').exists() and not (output/'cancel.tmp').exists()
finally:
    if process.poll() is None:process.terminate();process.wait(timeout=10)

process,messages=start()
try:
    target=(output/'retry.json').resolve()
    send(process,'retry',image,target)
    reply=messages.get(timeout=180)
    assert reply['type']=='completed' and reply['jobId']=='retry'
    assert json.loads(target.read_text(encoding='utf-8'))['text'].strip()
    before=digest(target)
    send(process,'existing',image,target)
    assert messages.get(timeout=10)['type']=='failed' and digest(target)==before
    try:
        process.stdin.write('x'*262144+'\n');process.stdin.flush()
    except BrokenPipeError:pass
    assert messages.get(timeout=10)['type']=='failed'
    assert process.wait(timeout=10)!=0
finally:
    if process.poll() is None:process.terminate();process.wait(timeout=10)

isolated=output/'without-runtime';isolated.mkdir()
os.link(worker,isolated/'ocr-worker.exe')
probe=subprocess.run([str((isolated/'ocr-worker.exe').resolve()),'--serve','--models',str(models),'--provider','cpu'],
    input='',capture_output=True,text=True,encoding='utf-8',env=environment,timeout=30,creationflags=subprocess.CREATE_NO_WINDOW)
assert probe.returncode!=0 and '"type":"ready"' not in probe.stdout
assert digest(image)==original
report=dict(workerSha256=digest(worker),missingInput='failed without output',malformedRequest='failed; worker alive',
    sourceProtection='original input unchanged',cancel='terminated after 250ms; no final/partial file',
    restartRetry='completed',existingOutput='rejected; output unchanged',oversizedRequest='rejected with bounded read',
    missingLocalDll='failed; no diagnostic/environment fallback',loadedRuntimeModules=loaded_modules,
    scope='Real worker protocol and loaded local DLL paths; not a GUI installation test')
args.report.parent.mkdir(parents=True,exist_ok=True)
args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report),flush=True)
