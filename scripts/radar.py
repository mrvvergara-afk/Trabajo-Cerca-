"""Trabajo Cerca: discovery of public local employment links; never auto-publish."""
import json, re, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone
from html import unescape
from radar_patterns import ARCHIVE, DOCUMENT, OLD_YEAR

COMMUNES = ['Angol','Collipulli','Ercilla','Renaico','Los Sauces','Purén',
            'Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria']
SUBLOCALITIES = {'Collipulli':['Collipulli','Mininco'],
                 'Negrete':['Negrete','Coihue','Coigüe']}
# Every municipal territory is a separate source, never inferred from a
# national ATS's city field. Employer indexes are additional discovery only.
SOURCES = [
 ('Municipio Angol','https://noticias.angol.cl/','Angol'),
 ('Municipio Collipulli','https://municipalidadcollipulli.cl/','Collipulli'),
 ('Municipio Ercilla','https://muniercilla.cl/','Ercilla'),
 ('Municipio Lumaco','https://munilumaco.cl/','Lumaco'),
 ('Municipio Los Sauces','https://munilossauces.cl/','Los Sauces'),
 ('Municipio Purén','https://munipuren.cl/','Purén'),
 ('Municipio Renaico concursos','https://municipalidadrenaico.cl/concursos-publicos/','Renaico'),
 ('Municipio Traiguén bolsa empleo','https://mtraiguen.cl/category/bolsa-de-empleo-o-concurso/','Traiguén'),
 ('Municipio Victoria OMIL','https://victoriachile.cl/category/omil/','Victoria'),
 ('Municipio Mulchén OMIL','https://www.munimulchen.cl/pagina-central-ofertas-laborales/','Mulchén'),
 ('Municipio Negrete OMIL','https://www.muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/','Negrete'),
 ('Municipio Nacimiento','https://nacimiento.cl/','Nacimiento'),
 ('Arauco ATS','https://jobs.arauco.com/Chile/search/','regional'),
 ('CMPC Trabajando','https://cmpc.trabajando.cl/','regional'),
 ('SERFONAC ofertas','https://portal.chiletrabajos.cl/empresa/serfonac/ofertas','regional'),
 ('SERFOCOL Trabajando','https://serfocol.trabajando.cl/','regional'),
 ('Brayben ofertas','https://portal.chiletrabajos.cl/empresa/brayben/ofertas','regional'),
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
 if OLD_YEAR.search(key): return
 if key in seen: return
 seen.add(key)
 candidates.append({'source':source,'url':key,'title':title,'commune':commune,'status':'candidate_unverified'})

# Backfill: traverse public archive/category/pagination links (bounded per source).
for name,url,territory in SOURCES:
 queue=[(url,0)]; visited=set(); found=0; errors=[]
 origin=urllib.parse.urlparse(url).netloc.lower().removeprefix('www.')
 while queue and len(visited)<35:
  current,depth=queue.pop(0)
  if current in visited: continue
  visited.add(current)
  try:
   html=fetch(current)
   links=list(dict.fromkeys(urllib.parse.urljoin(current,unescape(x)) for x in LINK.findall(html)))
   for link in links:
    parsed=urllib.parse.urlparse(link)
    if parsed.scheme not in ('http','https'): continue
    host=parsed.netloc.lower().removeprefix('www.')
    if host!=origin: continue
    clean=link.split('#')[0]
    if OLD_YEAR.search(clean): continue
    if KEYWORDS.search(clean):
     before=len(candidates);add(name,clean);found+=len(candidates)-before
    if depth<3 and not DOCUMENT.search(clean) and ARCHIVE.search(clean) and clean not in visited and not any(x[0]==clean for x in queue) and len(queue)<100:
     queue.append((clean,depth+1))
   if KEYWORDS.search(current): add(name,current)
  except Exception as exc:
   errors.append({'url':current,'reason':str(exc)[:100]})
 diagnostics.append({'source':name,'commune_scope':territory,
                     'status':'partial' if errors else 'html_only',
                     'pages_scanned':len(visited),'candidate_links':found,
                     'coverage_complete':False,'errors':errors[:5]})

# Additional discovery from a public search index. A search response alone
# does not prove that a specific commune was comprehensively covered.
for commune in COMMUNES:
 for search_term in SUBLOCALITIES.get(commune,[commune]):
  query=f'"{search_term}" ("oferta laboral" OR "se necesita" OR "se busca" OR "vacantes" OR OMIL) when:60d'
  url='https://news.google.com/rss/search?q='+urllib.parse.quote(query)+'&hl=es-419&gl=CL&ceid=CL:es-419'
  try:
   root=ET.fromstring(fetch(url));found=0
   for item in root.findall('./channel/item')[:40]:
    title=(item.findtext('title') or '').strip()
    link=(item.findtext('link') or '').strip()
    if link and HIRING.search(title) and not EXCLUDE.search(title) and re.search(r'\b'+re.escape(search_term)+r'\b',title,re.I):
     add('Google News RSS',link,commune,title)
     found+=1
   diagnostics.append({'source':'Google News RSS '+search_term,
      'commune_scope':commune,'status':'search_index_only','candidate_links':found,
      'coverage_complete':False})
  except Exception as exc:
   diagnostics.append({'source':'Google News RSS '+search_term,
      'commune_scope':commune,'status':'error','coverage_complete':False,
      'reason':str(exc)[:180]})

Path('output').mkdir(exist_ok=True)
report={'run_at':datetime.now(timezone.utc).isoformat(),'candidates':candidates,
        'diagnostics':diagnostics,'published':0,'communes_expected':COMMUNES,
        'municipalities_registered':12,'sources_total':len(SOURCES),
        'coverage_complete':False,
        'note':'HTML and RSS results are NOT fully verified sources or publishable vacancies.'}
Path('output/report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'candidate_links':len(candidates),'diagnostics':diagnostics},ensure_ascii=False))
