import hashlib,json,pathlib,re,struct,subprocess,tempfile,time,xml.etree.ElementTree as ET,zipfile,zlib
root=pathlib.Path.cwd()
settings=re.search(r'const SETTINGS: &str = r#"(.*?)"#;', (root/'src-tauri/src/converters/external/libreoffice_profile.rs').read_text(),re.S).group(1)
binary=root/'src-tauri/bundled-engines/libreoffice/compatible/program/soffice'
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',16,16,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+bytes([230,50,30])*16)*16))+chunk(b'IEND',b'')
def rtf(text):
 return ''.join(c if 32<=ord(c)<127 and c not in '{}\\' else '\\u'+str(ord(c) if ord(c)<32768 else ord(c)-65536)+'?' for c in text)
markers=['Titre fidélité','Façade déjà été — français','Cellule A','Cellule B','Кириллица']
source=('{\\rtf1\\ansi\\ansicpg1252\\deff0 '+rtf(markers[0])+'\\par '+rtf(markers[1])+'\\par '+rtf(markers[4])+'\\par \\trowd\\trgaph108\\cellx3000\\cellx6000\\intbl '+rtf(markers[2])+'\\cell '+rtf(markers[3])+'\\cell\\row\\pard\\par {\\pict\\pngblip\\picw16\\pich16\\picwgoal480\\pichgoal480 '+png.hex()+'}}').encode()
report={'schemaVersion':1,'platform':'linux-x64','fixture':'synthetic RTF with French/Cyrillic, two-cell table and embedded 16x16 PNG','proof':'actual bundled LibreOffice with exact production private-profile settings','routes':[]}
with tempfile.TemporaryDirectory(prefix='mc-office-fidelity-') as temp:
 temp=pathlib.Path(temp);current=temp/'source.rtf';current.write_bytes(source)
 for index,target in enumerate(['docx','odt','docx']):
  before=hashlib.sha256(current.read_bytes()).hexdigest();profile=temp/('profile-'+str(index));(profile/'user').mkdir(parents=True);(profile/'user/registrymodifications.xcu').write_text(settings);out=temp/('out-'+str(index));out.mkdir();started=time.monotonic()
  result=subprocess.run([str(binary),'--headless','--invisible','--nologo','--nodefault','--nolockcheck','--norestore','--nofirststartwizard','-env:UserInstallation='+profile.as_uri(),'--convert-to',target,'--outdir',str(out),str(current)],capture_output=True,text=True,timeout=45)
  output=out/('source.'+target);assert result.returncode==0 and output.is_file(),result.stderr
  with zipfile.ZipFile(output) as archive:
   document=ET.fromstring(archive.read('word/document.xml' if target=='docx' else 'content.xml'));text=''.join(document.itertext());tables=sum(element.tag.endswith('}tbl' if target=='docx' else '}table') for element in document.iter());cells=sum(element.tag.endswith('}tc' if target=='docx' else '}table-cell') for element in document.iter());images=[name for name in archive.namelist() if name.startswith('word/media/' if target=='docx' else 'Pictures/') and name.lower().endswith('.png')]
  item={'sourceFormat':current.suffix[1:],'targetFormat':target,'durationMs':round((time.monotonic()-started)*1000),'allTextMarkersPreserved':all(marker in text for marker in markers),'tableCount':tables,'cellCount':cells,'embeddedPngCount':len(images),'sourceUnchanged':hashlib.sha256(current.read_bytes()).hexdigest()==before};report['routes'].append(item);current=output
destination=root/'test-results/audit-2026-10-30/linux-office-fidelity-probe.json';destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text(json.dumps(report,indent=2));print(json.dumps(report))
assert all(item['allTextMarkersPreserved'] and item['tableCount']==1 and item['cellCount']==2 and item['embeddedPngCount']==1 and item['sourceUnchanged'] for item in report['routes'])
