"""Public RSS backfill, with per-source cursor and review-only candidates."""
import datetime as dt, email.utils, hashlib, json, os, re, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
NOW=dt.datetime.now(dt.timezone.utc)
DAYS=int(os.getenv("BACKFILL_DAYS","60"))
PLACES=["Angol","Collipulli","Ercilla","Renaico","Mininco","Los Sauces","Purén","Traiguén","Lumaco","Nacimiento","Negrete","Mulchén","Victoria"]
SOURCES={
 "GoogleNewsLocal": lambda p: "https://news.google.com/rss/search?q="+urllib.parse.quote(f'"{p}" ("oferta laboral" OR "se necesita" OR "se busca" OR "vacantes" OR OMIL) when:{DAYS}d')+"&hl=es-419&gl=CL&ceid=CL:es-419",
 "GoogleNewsPortals": lambda p: "https://news.google.com/rss/search?q="+urllib.parse.quote(f'"{p}" (site:chiletrabajos.cl OR site:cl.indeed.com OR site:computrabajo.cl OR site:linkedin.com/jobs OR site:laborum.cl OR site:jobsora.com) when:{DAYS}d')+"&hl=es-419&gl=CL&ceid=CL:es-419",
}
HIRING=re.compile(r'ofertas? laborales?|vacantes?|se (?:busca|necesita|requiere)|contrataci[oó]n|postulaciones|omil',re.I)
EXCLUDE=re.compile(r'argentina|villarruel|subsidio|inversiones|victoria electoral|victoria de',re.I)
Path("output").mkdir(exist_ok=True)
all_items=[];stats=[];seen=set()
for source,make_url in SOURCES.items():
 for place in PLACES:
  url=make_url(place);status="ok";error=None;scanned=0;accepted=0
  try:
   req=urllib.request.Request(url,headers={"User-Agent":"TrabajoCercaRadar/0.3"})
   with urllib.request.urlopen(req,timeout=15) as resp: raw=resp.read(900000)
   root=ET.fromstring(raw)
   for item in root.findall("./channel/item"):
    scanned+=1
    title=item.findtext("title","").strip();link=item.findtext("link","").strip()
    published=item.findtext("pubDate","")
    try: when=email.utils.parsedate_to_datetime(published).astimezone(dt.timezone.utc)
    except Exception: when=None
    if not link or not HIRING.search(title) or EXCLUDE.search(title): continue
    if not re.search(r"\\b"+re.escape(place)+r"\\b",title,re.I):continue
    if when is not None and (NOW-when).days>DAYS:continue
    key=hashlib.sha256(link.encode()).hexdigest()[:20]
    if key in seen:continue
    seen.add(key);accepted+=1
    all_items.append({"id":key,"source":source,"commune_hint":place,"title":title,"url":link,"published_at":when.isoformat() if when else None,"discovered_at":NOW.isoformat(),"state":"pending_verification","work_location_verified":False})
  except Exception as exc:status="error";error=str(exc)[:160]
  stats.append({"source":source,"commune":place,"status":status,"scanned":scanned,"candidates":accepted,"error":error})
report={"generated_at":NOW.isoformat(),"lookback_days":DAYS,"candidate_count":len(all_items),"published_count":0,"candidates":all_items,"diagnostics":stats,"coverage_note":"Only public Google News RSS indexed content; no direct Facebook, Instagram, LinkedIn or job-board crawling. These require individual adapters."}
Path("output/backfill.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps({"candidates":len(all_items),"scanned":sum(x["scanned"] for x in stats),"errors":sum(x["status"]=="error" for x in stats),"published":0},ensure_ascii=False))
