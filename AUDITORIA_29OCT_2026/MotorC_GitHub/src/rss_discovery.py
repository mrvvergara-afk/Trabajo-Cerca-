"""Descubrimiento complementario gratuito desde RSS de noticias públicas.
No usa Meta, cuentas, credenciales ni datos privados; los resultados NO son ofertas verificadas.
"""
import datetime as dt, hashlib, json, pathlib, urllib.request, urllib.parse, xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/"output";OUT.mkdir(exist_ok=True)
TOWNS=["Angol","Collipulli","Ercilla","Renaico","Mininco","Los Sauces","Purén","Traiguén","Lumaco","Nacimiento","Negrete","Mulchén","Victoria"]
SEARCH_START=dt.date(2026,9,12)
QUERY='("oferta laboral" OR "vacantes" OR "se busca" OR "postulaciones")'
def run():
 rows=[];logs=[];seen=set()
 for town in TOWNS:
  query=f'{QUERY} "{town}" when:45d'
  url="https://news.google.com/rss/search?"+urllib.parse.urlencode({"q":query,"hl":"es-419","gl":"CL","ceid":"CL:es-419"})
  try:
   req=urllib.request.Request(url,headers={"User-Agent":"TrabajoCerca-MotorC/1.0","Accept":"application/rss+xml, application/xml"})
   with urllib.request.urlopen(req,timeout=14) as response:
    body=response.read(300000)
   root=ET.fromstring(body)
   count=0
   for node in root.findall(".//item")[:60]:
    title=node.findtext("title","").strip()
    link=node.findtext("link","").strip()
    date=node.findtext("pubDate","").strip()
    if not link.startswith("https://") or not title:continue
    key=hashlib.sha256((link+"|"+title).encode()).hexdigest()[:24]
    if key in seen:continue
    seen.add(key);count+=1
    rows.append({"id":key,"town_query":town,"title_hint":title,"source_url":link,"rss_date":date or None,"status":"needs_original_source_and_workplace_verification","publicable":False})
   logs.append({"town":town,"status":"ok","leads":count})
  except Exception as exc:logs.append({"town":town,"status":"unavailable","reason":str(exc)[:140]})
 (OUT/"rss_candidates.json").write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf8")
 (OUT/"rss_report.json").write_text(json.dumps({"checked_at":dt.datetime.now(dt.timezone.utc).isoformat(),"start_date":str(SEARCH_START),"feed_type":"Google News RSS public indexed articles","sources":len(TOWNS),"leads":len(rows),"verified":0,"logs":logs},ensure_ascii=False,indent=2),encoding="utf8")
 print(json.dumps({"rss_leads":len(rows),"sources_ok":sum(x["status"]=="ok" for x in logs)}))
if __name__=="__main__":run()
