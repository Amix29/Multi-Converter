import hashlib,json,os,pathlib,selectors,subprocess,tempfile,time,unicodedata
root=pathlib.Path.cwd()
fixtures=pathlib.Path(__file__).resolve().parent/'ocr-layout'
worker=root/'engine-sources/ocr-runtime/linux-x64/dist/ocr-worker/ocr-worker';internal=worker.parent/'_internal'
env={**os.environ,'LD_LIBRARY_PATH':str(internal/'paddle/libs')+':'+str(internal),'OMP_NUM_THREADS':'4','OPENBLAS_NUM_THREADS':'1','HF_HUB_OFFLINE':'1','PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK':'true'}
manifest=json.loads((fixtures/'manifest.json').read_text());report={'schemaVersion':1,'platform':'linux-x64','networkDenied':True,'fixtureProvenance':manifest['provenance'],'results':[],'proofLimits':'Synthetic raster fixtures; main-process RSS only; initialization is a fresh process, not an OS cold-cache claim.'}
def normalized(text):return ' '.join(unicodedata.normalize('NFC',text).lower().split())
def distance(a,b):
 previous=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  current=[i]
  for j,y in enumerate(b,1):current.append(min(current[-1]+1,previous[j]+1,previous[j-1]+(x!=y)))
  previous=current
 return previous[-1]
started=time.monotonic();process=subprocess.Popen(['unshare','-Urn',str(worker),'--serve','--models',str(root/'src-tauri/ocr-resources/models'),'--provider','cpu'],env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1);selector=selectors.DefaultSelector();selector.register(process.stdout,selectors.EVENT_READ)
def message(timeout):
 assert selector.select(timeout),'worker deadline exceeded'
 line=process.stdout.readline();assert line,'worker stream closed';return json.loads(line)
try:
 assert message(30)['type']=='ready';report['freshProcessInitializationMs']=round((time.monotonic()-started)*1000)
 with tempfile.TemporaryDirectory(prefix='mc-layout-probe-') as temporary:
  for repeat in range(2):
   for case in manifest['cases']:
    output=pathlib.Path(temporary)/(case['id']+'.json');started=time.monotonic();process.stdin.write(json.dumps({'schemaVersion':1,'jobId':case['id'],'input':str(fixtures/(case['id']+'.png')),'output':str(output)})+'\n');process.stdin.flush();reply=message(180);assert reply['type']=='completed',reply
    elapsed=round((time.monotonic()-started)*1000);result=json.loads(output.read_text());actual=normalized(result['text']);expected=normalized(case['expected']);rss=pathlib.Path('/proc/'+str(process.pid)+'/status').read_text();rss=int(next(line.split()[1] for line in rss.splitlines() if line.startswith('VmRSS:')))*1024
    report['results'].append({'id':case['id'],'pass':repeat+1,'fontPixels':case['font'],'inputSha256':hashlib.sha256((fixtures/(case['id']+'.png')).read_bytes()).hexdigest(),'elapsedMs':elapsed,'workerRssBytes':rss,'characterAccuracy':1-distance(actual,expected)/max(1,len(expected)),'actual':actual,'expected':expected})
finally:
 process.stdin.close()
 try:process.wait(timeout=5)
 except subprocess.TimeoutExpired:process.kill();process.wait()
 selector.close()
destination=root/'test-results/audit-2026-10-30/linux-layout-results.json';destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text(json.dumps(report,indent=2));print(json.dumps(report))
