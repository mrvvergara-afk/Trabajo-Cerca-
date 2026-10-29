import datetime as dt, hashlib, html, json, pathlib, re, time, urllib.request, urllib.parse, unicodedata
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/"output"
OUT.mkdir(exist_ok=True)
SOURCES={
"OMIL Mulchen":"https://www.munimulchen.cl/pagina-central-ofertas-laborales/",
"OMIL Negrete":"https://www.muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/",
"OMIL Victoria":"https://victoriachile.cl/departamentos-y-direcciones/udel/omil/",
"Collipulli":"https://municipalidadcollipulli.cl/",
"Renaico":"https://municipalidadrenaico.cl/concursos-publicos/",
"SS Araucania Norte":"https://ssan.redsalud.gob.cl/trabaje-con-nosotros/",
"Angol":"https://noticias.angol.cl/",
"Traiguen":"https://mtraiguen.cl/",
"Puren":"https://munipuren.cl/",
"Ercilla":"https://muniercilla.cl/",
"Lumaco":"https://munilumaco.cl/",
"Nacimiento":"https://nacimiento.cl/",
"Los Sauces":"https://munilossauces.cl/",
"Chiletrabajos":"https://www.chiletrabajos.cl/",
"Trabajando":"https://www.trabajando.cl/",
"Empleos Publicos":"https://www.empleospublicos.cl/",
"SENCE":"https://sence.gob.cl/personas/omil",
"CMPC":"https://cmpc.csod.com/",
"Arauco":"https://jobs.arauco.com/",
"Indeed Angol":"https://cl.indeed.com/jobs?q=&l=Angol%2C+Araucan%C3%ADa",
"Indeed Collipulli":"https://cl.indeed.com/jobs?q=&l=Collipulli%2C+Araucan%C3%ADa",
"Indeed Victoria":"https://cl.indeed.com/jobs?q=&l=Victoria%2C+Araucan%C3%ADa"}
TOWNS=["angol","collipulli","ercilla","renaico","mininco","los sauces","puren","purén","traiguen","traiguén","lumaco","nacimiento","negrete","mulchen","mulchén","victoria"]
START="2026-09-12"
LINK=re.compile(r'<a\b[^>]*href=["\x27]([^"\x27]+)["\x27][^>]*>(.*?)</a>',re.I|re.S)
TAG=re.compile(r'<[^>]*>')
JOB=re.compile(r'empleo|oferta|trabajo|laboral|postul|concurso|vacante|reclut|job|operarios|operador|ayudante|administrativ|técnic|tecnic|enfermer|médic|medic|kinesi[oó]log|guardia|chofer|conductor|auxiliar|educador|psic[oó]log|contad|profesional|asistente',re.I)
CLOSED=re.compile(r'postulaci[oó]n\s+cerrada|convocatoria\s+cerrada|proceso\s+cerrado|plazo\s+vencido',re.I)
NAV=re.compile(r'^(inicio|ir al contenido|cerrar|men[uú]|noticias|municipalidad|alcald[ií]a|tr[aá]mites|concejo municipal|turismo|seguridad|cultura|medio ambiente|actividades|omil|oficina municipal|ofertas laborales|empleos|trabajo|concursos p[uú]blicos)$',re.I)
def norm(s):
 return ''.join(x for x in unicodedata.normalize('NFD',str(s).lower()) if unicodedata.category(x)!='Mn')
def canonical(url):
 p=urllib.parse.urlsplit(url)
 params=urllib.parse.parse_qsl(p.query,keep_blank_values=True)
 params=[(k,v) for k,v in params if not k.lower().startswith('utm_') and k.lower() not in ('fbclid','gclid','msclkid')]
 path=p.path.rstrip('/') or '/'
 return urllib.parse.urlunsplit((p.scheme,p.netloc.lower(),path,urllib.parse.urlencode(params),'')).strip()
def detected_towns(s):
 text=norm(s)
 tokens=['angol','collipulli','ercilla','renaico','mininco','los sauces','puren','traiguen','lumaco','nacimiento','negrete','mulchen','victoria']
 return [t for t in tokens if re.search(r'(?<![a-z])'+re.escape(t)+r'(?![a-z])',text)]
def inspect_detail(url):
 try:
  page=fetch(url)
  text=html.unescape(TAG.sub(' ',re.sub(r'<script\\b[^>]*>[\\s\\S]*?</script>',' ',page,flags=re.I)))[:350000]
  towns=detected_towns(text)
  dates=re.findall(r'(?<!\\d)20\\d{2}-\\d{2}-\\d{2}(?!\\d)',page)
  dates=[d for d in dates if '2026-09-12'<=d<=dt.date.today().isoformat()]
  return {'workplace_candidates':towns,'date_candidates':sorted(set(dates))[:12],'detail_checked':True}
 except Exception as e:return {'workplace_candidates':[],'date_candidates':[],'detail_checked':False,'detail_error':str(e)[:90]}
def classify_link(seed,href,title):
 parsed=urllib.parse.urlparse(href)
 if parsed.fragment:return 'navigation'
 if href.rstrip('/')==seed.rstrip('/'):return 'navigation'
 if not title or NAV.fullmatch(' '.join(title.split())):return 'navigation'
 if CLOSED.search(title):return 'closed'
 path=parsed.path.lower()
 if not JOB.search(title) and not re.search(r'/oferta-laboral-|/trabajo/\d+|/empleo/\d+|/convocatoria-|/viewjob|/rc/clk|/pagead/clk',path):return 'not_job'
 if re.search(r'/category/|/tag/|/page/|/oficina-municipal|/pagina-central-ofertas|/concursos-publicos/?$',path):return 'index'
 return 'candidate'
def fetch(url):
 req=urllib.request.Request(url,headers={"User-Agent":"TrabajoCerca-MotorC/1.0 (public pages only)","Accept":"text/html"})
 with urllib.request.urlopen(req,timeout=12) as f:
  if "html" not in f.headers.get("Content-Type",""):raise RuntimeError("not_html")
  return f.read(350000).decode("utf-8","replace")
def run():
 started=dt.datetime.now(dt.timezone.utc).isoformat()
 results=[]; rejected=[]; log=[]; seen=set();details_scanned=0
 for source,url in SOURCES.items():
  count=0;discarded=0
  try:
   page=fetch(url)
   for href,label in LINK.findall(page):
    href=html.unescape(href)
    target=urllib.parse.urljoin(url,href)
    parsed=urllib.parse.urlparse(target)
    if parsed.scheme!="https" or parsed.netloc!=urllib.parse.urlparse(url).netloc:continue
    title=html.unescape(TAG.sub(" ",label)).strip()[:200]
    reason=classify_link(url,target,title)
    if reason!='candidate':
     if reason in ('closed','navigation','index','not_job'):
      discarded+=1
      rejected.append({"source":source,"title":title,"url":target,"reason":reason})
     continue
    if not any(t in (title+" "+target).lower() for t in TOWNS) and source not in ("OMIL Mulchen","OMIL Negrete","OMIL Victoria","Collipulli","Renaico","SS Araucania Norte","Angol","Traiguen","Puren","Ercilla","Lumaco","Nacimiento","Los Sauces"):continue
    target=canonical(target)
    digest=hashlib.sha256(target.encode()).hexdigest()[:20]
    if digest in seen:continue
    seen.add(digest);count+=1
    detail=inspect_detail(target) if details_scanned<24 and source in ('SS Araucania Norte','Traiguen','OMIL Mulchen','OMIL Victoria') else {'workplace_candidates':[],'date_candidates':[],'detail_checked':False}
    if detail['detail_checked']:details_scanned+=1
    results.append({'id':digest,'source':source,'url':target,'title_hint':title,'captured_at':started,'date_original':None,'status':'needs_review','publicable':False,**detail})
   log.append({"source":source,"read":"ok","candidates":count,"discarded":discarded})
  except Exception as e:log.append({"source":source,"read":"error","detail":str(e)[:140]})
  time.sleep(.2)
 (OUT/"discarded.json").write_text(json.dumps(rejected,ensure_ascii=False,indent=2),encoding="utf-8")
 (OUT/"candidates.json").write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding="utf-8")
 report={"run_at":started,"search_from":START,"sources_checked":len(log),"sources_ok":sum(x["read"]=="ok" for x in log),"candidates_detected":len(results),"discarded_links":len(rejected),"verified_new":0,"details_scanned":details_scanned,"social":"Pending authorized connector; no Meta scraping","logs":log}
 (OUT/"run_report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
 print(json.dumps({"candidates":len(results),"sources_ok":report["sources_ok"]}))
if __name__=="__main__":run()
