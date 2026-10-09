import json, re, time, urllib.request, urllib.parse
from pathlib import Path
from datetime import datetime, timezone

COMMUNES = ['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén','Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria']
SOURCES = [
 ('OMIL Mulchén','https://www.munimulchen.cl/'),
 ('Municipalidad de Angol','https://www.angol.cl/'),
 ('Municipalidad de Nacimiento','https://www.nacimiento.cl/'),
 ('Municipalidad de Collipulli','https://www.municipalidadcollipulli.cl/'),
]
KEYWORDS = re.compile(r'empleo|trabajo|vacante|postulaci[oó]n|oferta laboral|se busca|omil|convocatoria',re.I)
LINK = re.compile(r'href=[\\"\\\']([^\\"\\\']+)[\\"\\\']',re.I)
TAG = re.compile(r'<[^>]+>')
results=[]; diagnostics=[]
for name,url in SOURCES:
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'TrabajoCercaRadar/0.1 (+public-pages-only)'})
  with urllib.request.urlopen(req,timeout=12) as response:
   html=response.read(700000).decode('utf-8','replace')
  links=[]
  for raw in LINK.findall(html):
   link=urllib.parse.urljoin(url,raw)
   if KEYWORDS.search(link) and link.startswith('http'):
    links.append(link)
  links=list(dict.fromkeys(links))[:30]
  for link in links: results.append({'source':name,'url':link,'status':'candidate_unverified','commune':'pending_review'})
  diagnostics.append({'source':name,'status':'ok','candidate_links':len(links)})
 except Exception as exc:
  diagnostics.append({'source':name,'status':'error','reason':str(exc)[:160]})
Path('output').mkdir(exist_ok=True)
Path('output/report.json').write_text(json.dumps({'run_at':datetime.now(timezone.utc).isoformat(),'candidates':results,'diagnostics':diagnostics,'published':0},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'candidate_links':len(results),'diagnostics':diagnostics},ensure_ascii=False))
