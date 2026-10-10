"""Second-stage verification: open candidate job pages and reject search-only matches.
A verified record requires a live job page, explicit target commune and hiring language.
No automatic publication: ingestion remains a separate audited step.
"""
import json,re,urllib.request,urllib.parse,datetime as dt,html,os
from html.parser import HTMLParser
from pathlib import Path
PLACES=['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén','Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria']
HIRING=re.compile(r'oferta laboral|postula|postulación|requisitos|descripción del empleo|descripción del trabajo|jornada|vacante|empleo',re.I)
CLOSED=re.compile(r'oferta (?:expirada|finalizada|cerrada)|postulación(?:es)? (?:cerrada|finalizada)|esta oferta ya no',re.I)
class Extract(HTMLParser):
 def __init__(self):super().__init__();self.parts=[];self.title='';self.intitle=False
 def handle_starttag(self,tag,attrs):
  if tag=='title':self.intitle=True
 def handle_endtag(self,tag):
  if tag=='title':self.intitle=False
 def handle_data(self,data):
  self.parts.append(data)
  if self.intitle:self.title+=data
def check(item):
 url=item['url'];req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; TrabajoCerca/1.0)'})
 with urllib.request.urlopen(req,timeout=12) as response:
  final=response.geturl();status=response.status;raw=response.read(600000).decode('utf-8','replace')
 if status!=200:return {'status':'rejected','reason':'HTTP '+str(status)}
 parsed=urllib.parse.urlparse(final)
 if parsed.hostname not in ('chiletrabajos.cl','www.chiletrabajos.cl') or not re.search(r'/trabajo/[^/?#]+',parsed.path):return {'status':'rejected','reason':'redirected_outside_job'}
 p=Extract();p.feed(raw);body=html.unescape(' '.join(p.parts));body=re.sub(r'\\s+',' ',body)
 hint=item.get('commune_query','');locations=[x for x in PLACES if re.search(r'\\b'+re.escape(x)+r'\\b',body,re.I)]
 if CLOSED.search(body[:10000]):return {'status':'rejected','reason':'closed_notice'}
 if not HIRING.search(body):return {'status':'pending','reason':'hiring_text_missing'}
 if hint not in locations:return {'status':'pending','reason':'searched_commune_not_found_in_page','locations_seen':locations}
 # Location anywhere in page is insufficient to confirm worksite, so manual/location-specific verification remains necessary.
 return {'status':'review_ready','reason':'live_job_and_commune_text_present','title':p.title[:200],'locations_seen':locations,'url':final,'note':'Worksite and closing date require explicit review'}
source=Path('output/chiletrabajos_direct.json')
report={'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'source_candidates':0,'checked':0,'review_ready':0,'verified':0,'published':0,'errors':0,'results':[]}
if source.exists():
 candidates=json.loads(source.read_text(encoding='utf-8')).get('candidates',[])
 report['source_candidates']=len(candidates)
 for item in candidates[:int(os.getenv('VERIFY_LIMIT','30'))]:
  try: result=check(item)
  except Exception as exc:result={'status':'error','reason':str(exc)[:140]};report['errors']+=1
  report['results'].append({'candidate_url':item['url'],'commune_query':item.get('commune_query'),**result})
  report['checked']+=1
  if result['status']=='review_ready':report['review_ready']+=1
Path('output/verification_stage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('VERIFY_STAGE '+json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False))
