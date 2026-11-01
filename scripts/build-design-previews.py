from pathlib import Path
import json
import hashlib
import re
import urllib.parse

package=Path(__file__).resolve().parent.parent/'branding-kit/08_design-system'
html=(package/'components.html').read_text(encoding='utf-8')
def data_uri(path):
    return 'data:image/svg+xml,'+urllib.parse.quote(path.read_text(encoding='utf-8'),safe='')
def inline_stylesheet(match):
    source=package/match.group(1)
    css=source.read_text(encoding='utf-8')
    def inline_image(image):
        relative=image.group(1)
        if relative.startswith('data:'):
            return image.group(0)
        file=(source.parent/relative).resolve()
        assert file.is_relative_to(package.resolve()) and file.suffix=='.svg'
        return 'url("'+data_uri(file)+'")'
    css=re.sub(r"url\(['\"]?([^)'\"]+)['\"]?\)",inline_image,css)
    return '<style>\n'+css+'\n</style>'
html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',inline_stylesheet,html)
scripts=re.findall(r'<script src="([^"]+)" defer></script>',html)
html=re.sub(r'<script src="([^"]+)" defer></script>','',html)
html=html.replace('</body>',''.join('<script>\n'+(package/file).read_text(encoding='utf-8')+'\n</script>\n' for file in scripts)+'</body>')
html=html.replace('src="assets/logo.svg"','src="'+data_uri(package/'assets/logo.svg')+'"')
html=html.replace('href="assets/logo.svg"','href="'+data_uri(package/'assets/logo.svg')+'"')
html=html.replace('<!doctype html>','<!doctype html>\n<!-- Generated from components.html, tokens.css and assets; edit the sources. -->')
html='\n'.join(line.rstrip() for line in html.splitlines())+'\n'
views=[('app','Système clair et sombre',None,''),('colors','Palette et contrastes','fondations',''),
 ('typography','Typographie','typographie',''),('spacing','Espacement et formes','geometrie',''),
 ('components-buttons','Boutons et états','composants','#composants .two-up,#composants .alert{display:none!important}'),
 ('components-inputs','Champs et profils','composants','#composants>.paper-card,#composants>.alert,[data-component="states"]{display:none!important}.two-up{grid-template-columns:1fr}')]
pages=[]
for name,title,section,extra in views:
    content=html
    if section:
        content=re.sub(r'(<section\b[^>]*\bid="'+section+r'"[\s\S]*?)(<h2\b[^>]*>)([\s\S]*?)(</h2>)',lambda m:m.group(1)+m.group(2).replace('<h2','<h1',1)+m.group(3)+'</h1>',content,count=1)
        styles=f'main>section:not(#{section}),.book-footer,#brand-navigation,#menu-toggle{{display:none!important}}main>section{{padding-top:44px!important}}'+extra
        content=content.replace('</head>',f'<style>{styles}</style>\n</head>')
        content=content.replace('<title>Multi-Converter · Système de design</title>',f'<title>Multi-Converter · {title}</title>')
    (package/f'preview/{name}.html').write_text(content,encoding='utf-8',newline='\n')
    role={'app':'app','colors':'colors','typography':'typography','spacing':'spacing'}.get(name,'components')
    pages.append({'path':f'preview/{name}.html','role':role,'title':title})
manifest=json.loads((package/'manifest.json').read_text(encoding='utf-8'))
native=package/'system'
native.mkdir(exist_ok=True)
(native/'kit.html').write_text(html,encoding='utf-8',newline='\n')
(native/'kit.dark.html').write_text(html.replace('<html lang="fr">','<html lang="fr" data-theme="dark">').replace('  applyTheme(initialTheme);',"  applyTheme(requestedTheme === 'light' ? 'light' : 'dark');"),encoding='utf-8',newline='\n')
manifest['preview']={'dir':'preview','pages':pages}
(package/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
usage=package/'USAGE.md'
text=usage.read_text(encoding='utf-8').replace("L'installation Open Design et les contrôles effectués sont documentés dans\n`../../docs/OPEN_DESIGN_SYSTEM.md`.","Dans le dépôt Multi-Converter, `docs/OPEN_DESIGN_SYSTEM.md` conserve le statut\nd'installation Open Design et les contrôles effectués.")
usage.write_text(text,encoding='utf-8',newline='\n')
print(json.dumps({'nativePreviewPages':len(pages)}))
for file in package.rglob('*'):
    if file.is_file(): file.write_bytes(file.read_bytes().replace(b'\r\n',b'\n'))
rows=[{'path':file.relative_to(package).as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
      for file in sorted(package.rglob('*')) if file.is_file() and file.name!='scanned-files.json']
(package/'source/scanned-files.json').write_text(json.dumps({'files':rows},indent=2)+'\n',encoding='utf-8',newline='\n')
