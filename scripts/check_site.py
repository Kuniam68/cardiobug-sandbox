from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import re,json
root=Path(__file__).resolve().parents[1]
errors=[]
class Page(HTMLParser):
 def __init__(self,path):
  super().__init__();self.path=path;self.ids=set();self.refs=[]
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if 'id' in d:
   if d['id'] in self.ids:errors.append(f'{self.path.name}: duplicate id {d["id"]}')
   self.ids.add(d['id'])
  for key in ('href','src'):
   if key not in d:continue
   url=urlsplit(d[key])
   if url.scheme or url.netloc:continue
   target=self.path.parent/unquote(url.path) if url.path else self.path
   if not target.exists():errors.append(f'{self.path.name}: missing {d[key]}')
   if not url.path and url.fragment:self.refs.append(url.fragment)
for f in root.glob('*.html'):
 p=Page(f);p.feed(f.read_text());
 for ref in p.refs:
  if ref not in p.ids:errors.append(f'{f.name}: missing anchor #{ref}')
 text=f.read_text()
 for expected in ['<title>','assets/favicon.svg','<main id="main">','assets/app.js','assets/styles.css']:
  if expected not in text:errors.append(f'{f.name}: missing {expected}')
manifest=json.loads((root/'manifest.webmanifest').read_text())
for i in manifest['icons']:
 if not (root/i['src']).exists():errors.append('Missing manifest icon '+i['src'])
if errors:raise SystemExit('\n'.join(errors))
print(f'Checked {len(list(root.glob("*.html")))} pages: local links, assets, anchors, IDs and manifest icons pass.')
