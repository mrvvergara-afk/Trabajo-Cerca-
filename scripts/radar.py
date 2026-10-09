"""Trabajo Cerca: discovery of public local employment links; never auto-publish."""
import json, re, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone
from html import unescape

COMMUNES = ['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén','Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria']
SOURCES = [
 ('OMIL Mulchén','https://www.munimulchen.cl/'),
 ('OMIL Mulchén - Jefe de Terreno','https://www.munimulchen.cl/oferta-laboral-jefe-de-terreno/'),
 ('OMIL Nacimiento - publicaciones','https://www.govern1.com/CL/Nacimiento/102913642090515/OMIL-Municipalidad-de-Nacimiento'),
 ('Renaico - concursos','https://municipalidadrenaico.cl/concursos-publicos/'),
 ('Municipalidad de Angol','https://www.angol.cl/'),
 ('Municipalidad de Nacimiento','https://www.nacimiento.cl/'),
 ('Municipalidad de Collipulli','https://www.municipalidadcollipulli.cl/'),
]
KEYWORDS = re.compile(r'empleo|trabajo|vacante|postulaci[oó]n|oferta laboral|se busca|omil|convocatoria',re.I)
HIRING = re.compile(r'oferta[s]? laboral(?:es)?|vacante[s]?|se busca|se requiere|se necesita|contrata(?:ci[oó]n|r)|postula(?:ciones|r)? a(?:l)? (?:cargo|puesto)|bolsa de empleo|omil',re.I)
EXCLUDE = re.compile(r'subsidio|inversi[oó]n|exportaciones|inteligencia artificial|dossier art[ií]stico|pymes|villarruel|argentina|tamaulipas|rancahuaso',re.I)
LINK = re.compile(r'href=["\\\']([^"\\\']+)["\\\']',re.I)
candidates=[]; diagnostics=[]; seen=set()

def fetch(url):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; TrabajoCercaRadar/0.2)'})
 with urllib.request.urlopen(req,timeout=16) as response:
  return response.read(900000).decode('utf-8','replace')

def add(source,url,commune='pending_review',title=''):
 if not url.startswith('https://') and not url.startswith('http://'): return
 key=url.split('#')[0]
 if key in seen: return
 seen.add(key)
 candidates.append({'source':source,'url':key,'title':title,'commune':commune,'status':'candidate_unverified'})

for name,url in SOURCES:
 try:
  html=fetch(url)
  links=list(dict.fromkeys(urllib.parse.urljoin(url,unescape(x)) for x in LINK.findall(html)))
  matched=[x for x in links if KEYWORDS.search(x)]
  for link in matched[:30]: add(name,link)
  if KEYWORDS.search(url): add(name,url)
  diagnostics.append({'source':name,'status':'ok','candidate_links':len(matched)})
 except Exception as exc:
  diagnostics.append({'source':name,'status':'error','reason':str(exc)[:180]})

# Independent search discovery via public Google News RSS index. Results remain unverified.
for commune in COMMUNES:
 query=f'"{commune}" ("oferta laboral" OR "se necesita" OR "se busca" OR "vacantes" OR OMIL) when:30d'
 url='https://news.google.com/rss/search?q='+urllib.parse.quote(query)+'&hl=es-419&gl=CL&ceid=CL:es-419'
 try:
  root=ET.fromstring(fetch(url))
  found=0
  for item in root.findall('./channel/item')[:20]:
   title=(item.findtext('title') or '').strip()
   link=(item.findtext('link') or '').strip()
   if link and HIRING.search(title) and not EXCLUDE.search(title) and re.search(r'\\b'+re.escape(commune)+r'\\b',title,re.I):
    add('Google News RSS',link,commune,title)
    found+=1
  diagnostics.append({'source':'Google News RSS '+commune,'status':'ok','candidate_links':found})
 except Exception as exc:
  diagnostics.append({'source':'Google News RSS '+commune,'status':'error','reason':str(exc)[:180]})

Path('output').mkdir(exist_ok=True)
report={'run_at':datetime.now(timezone.utc).isoformat(),'candidates':candidates,'diagnostics':diagnostics,'published':0,'note':'Search results are NOT verified vacancies; review before publishing.'}
Path('output/report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'candidate_links':len(candidates),'diagnostics':diagnostics},ensure_ascii=False))
