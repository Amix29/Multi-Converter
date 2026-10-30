import hashlib,http.server,json,pathlib,re,socketserver,subprocess,tempfile,threading,urllib.request
root=pathlib.Path.cwd()
settings=re.search(r'const SETTINGS: &str = r#"(.*?)"#;', (root/'src-tauri/src/converters/external/libreoffice_profile.rs').read_text(),re.S).group(1)
binary=root/'src-tauri/bundled-engines/libreoffice/compatible/program/soffice'
requests=[]
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  requests.append(self.path);data=b'External secret must not be imported'
  self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
server=socketserver.TCPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
url='http://127.0.0.1:'+str(server.server_address[1])+'/remote-resource'
urllib.request.urlopen(url+'/control').read();assert requests==['/remote-resource/control'];requests.clear()
report={'schemaVersion':1,'platform':'linux-x64','proof':'actual bundled LibreOffice with exact production private-profile settings','httpControl':True,'cases':[]}
try:
 with tempfile.TemporaryDirectory(prefix='mc-office-privacy-') as temp:
  temp=pathlib.Path(temp)
  for field in ('INCLUDEPICTURE','INCLUDETEXT'):
   profile=temp/(field+'-profile');(profile/'user').mkdir(parents=True);(profile/'user/registrymodifications.xcu').write_text(settings)
   source=temp/(field+'.rtf');data=('{\\rtf1\\ansi Privacy fixture\\par {\\field{\\*\\fldinst '+field+' "'+url+'" \\d}{\\fldrslt Cached field}}}').encode();source.write_bytes(data)
   output=temp/(field+'-output');output.mkdir()
   result=subprocess.run([str(binary),'--headless','--invisible','--nologo','--nodefault','--nolockcheck','--norestore','--nofirststartwizard','-env:UserInstallation='+profile.as_uri(),'--convert-to','docx','--outdir',str(output),str(source)],capture_output=True,text=True,timeout=45)
   item={'field':field,'exitCode':result.returncode,'outputExists':(output/(field+'.docx')).is_file(),'requests':requests[:],'sourceUnchanged':source.read_bytes()==data,'stdout':result.stdout,'stderr':result.stderr};report['cases'].append(item);requests.clear()
finally:server.shutdown();server.server_close()
destination=root/'test-results/audit-2026-10-30/linux-office-privacy-probe.json';destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text(json.dumps(report,indent=2));print(json.dumps(report))
assert all(item['exitCode']==0 and item['outputExists'] and item['sourceUnchanged'] and not item['requests'] for item in report['cases'])
