"""Transform verified official CMPC requisitions into import batches. Fail closed."""
import json,re,hashlib
from datetime import date
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path("automation/motor_d_discovery")
LOCAL={"angol":"Angol","collipulli":"Collipulli","mininco":"Collipulli","ercilla":"Ercilla","lumaco":"Lumaco","los sauces":"Los Sauces","puren":"Purén","renaico":"Renaico","traiguen":"Traiguén","victoria":"Victoria","mulchen":"Mulchén","negrete":"Negrete","coihue":"Negrete","coigue":"Negrete","nacimiento":"Nacimiento","capitan pastene":"Lumaco"}
def normalized(s):
 import unicodedata
 return unicodedata.normalize("NFKD",str(s).lower()).encode("ascii","ignore").decode()
def locale(s):
 t=" "+re.sub("[^a-z0-9]+"," ",normalized(s))+" "
 return sorted({v for k,v in LOCAL.items() if " "+k+" " in t})
def primary_date(s):
 # Admitir fechas originales oficiales de tarjeta en ISO o formato día/mes/año.
 m2=re.search(r"(?<!\d)(\d{1,2})/(\d{1,2})/(2026)(?!\d)",s)
 if m2:
  try:
   d=date(int(m2.group(3)),int(m2.group(2)),int(m2.group(1)))
   if date(2026,9,12)<=d<=date.today():return d.isoformat()
  except ValueError:pass
 m=re.search(r"(?<!\d)(2026-\d{2}-\d{2})(?!\d)",s)
 if m:
  try:
   d=date.fromisoformat(m.group(1))
   if date(2026,9,12)<=d<=date.today():return d.isoformat()
  except ValueError:pass
 return None
def main():
 inputfile=ROOT/"cmpc_discovery.json"
 if not inputfile.exists():raise SystemExit("Missing CMPC browser data")
 data=json.loads(inputfile.read_text(encoding="utf-8"))
 approved=[];pending=[];seen=set()
 for item in data.get("individual_details",[]):
  url=str(item.get("url",""))
  if not re.fullmatch(r"https://cmpc\.csod\.com/ux/ats/careersite/4/home/requisition/[0-9]+\?c=cmpc",url):
   pending.append({"url":url,"reason":"unexpected_official_url"});continue
  if url in seen:continue
  seen.add(url)
  card=str(item.get("evidencia_tarjeta",""))
  body=str(item.get("ficha_excerpt",""))
  title=str(item.get("cargo","")).split("\n")[0].strip()[:170]
  # No infer worksite from employer or from CMPC's list header; require detail.
  # La ubicación explícita de la tarjeta oficial es evidencia primaria del puesto.
  place=locale(card)
  if not place:place=locale(body)
  # A single match only confirms a mention, not necessarily the actual workplace.
  # Flag conflicting place mentions for human/official review before publishing.
  body_places=locale(body)
  if body_places and place and any(x not in place for x in body_places):
   reason_conflicting_places=True
  else:
   reason_conflicting_places=False
  pub=primary_date(card)
  reason=[]
  if not item.get("ficha_accessible"):reason.append("detail_unavailable")
  if len(body)<170:reason.append("insufficient_detail")
  if not title or len(title)<6:reason.append("title_unverified")
  if len(place)!=1:reason.append("workplace_not_single_confirmed")
  if reason_conflicting_places:reason.append("conflicting_territorial_mentions")
  if not pub:reason.append("source_publication_date_not_confirmed")
  if any(x in normalized(body)[:1400] for x in ("posting closed","job no longer available","postulaciones cerradas","vacante cerrada")):reason.append("explicit_closure")
  if reason:
   pending.append({"url":url,"title":title,"workplaces":place,"reason":reason});continue
  uid=re.search(r"/requisition/(\d+)",url).group(1)
  approved.append({"id_fuente":"cmpc_"+uid,"cargo":title,"empresa":"CMPC","comunas":place,"url_original":url,
                   "fecha_publicacion":pub,"fecha_cierre":None,"justificacion":"Ficha individual oficial CMPC accesible; comuna y fecha de publicación contrastadas con tarjeta oficial."})
 # Automatic approval only for records passing all independent checks.
 # Empty approval file is intentionally not generated.
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/"evaluacion_cmcp.json").write_text(json.dumps({"approved":approved,"pending":pending},ensure_ascii=False,indent=2),encoding="utf-8")
 if approved:
  # Shared bridge accepts <=15. A deterministic batch avoids reimports.
  batch=approved[:15]
  tag=hashlib.sha256(json.dumps(batch,sort_keys=True).encode()).hexdigest()[:16]
  payload={"schema_version":1,"approval":"approved_for_publication","producer":"chatgpt",
           "batch_id":"motor-d-cmpc-"+tag,"offers":batch}
  Path("automation/motor_d_approved.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
 print(json.dumps({"CMPC":len(data.get("individual_details",[])),"approved":len(approved),"pending":len(pending),"batch_created":bool(approved)}))
if __name__=="__main__":main()
