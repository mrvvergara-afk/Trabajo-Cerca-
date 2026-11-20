"""Conservative crosscheck of validated portal evidence against an existing public catalog.
Does not write, import, publish or mark offers as new when the catalog is absent.
"""
import re
import unicodedata
from urllib.parse import parse_qs,urlsplit

def normalize(value):
 v="".join(c for c in unicodedata.normalize("NFD",str(value or "").casefold())
           if unicodedata.category(c)!="Mn")
 return " ".join(re.findall(r"[a-z0-9]+",v))

def identity(url):
 try:
  p=urlsplit(str(url or ""))
  if p.scheme not in ("https","http") or not p.hostname:return None
  host=p.hostname.lower().removeprefix("www.")
  path=p.path.rstrip("/")
  if host in ("cl.indeed.com","indeed.com"):
   jk=parse_qs(p.query).get("jk",[""])[0]
   if re.fullmatch("[a-f0-9]{16}",jk,re.I):return "indeed:"+jk.lower()
  if host in ("chiletrabajos.cl","portal.chiletrabajos.cl"):
   m=re.search(r"-(\d{5,12})$",path)
   if m:return "chiletrabajos:"+m.group(1)
  if host=="trabajando.cl":
   m=re.match(r"^/trabajo/(\d{5,12})(?:-|$)",path)
   if m:return "trabajando:"+m.group(1)
  if host=="cl.computrabajo.com":
   if path.startswith("/ofertas-de-trabajo/oferta-de-trabajo-de-"):
    return "computrabajo:"+path.casefold()
  return host+":"+path.casefold()
 except ValueError:
  return None

def key(title,company,commune):
 parts=[normalize(title),normalize(company),normalize(commune)]
 return tuple(parts) if all(parts) else None

def public_source_url(job):
 for k in ("url","url_original","sourceUrl","originalUrl","link"):
  if job.get(k):return job[k]
 return None

def public_title(job):
 return job.get("title") or job.get("cargo")

def public_company(job):
 return job.get("company") or job.get("empresa")

def public_commune(job):
 v=job.get("workCommunes") or job.get("comunas") or job.get("work_commune") or job.get("workLocation") or job.get("commune")
 return v[0] if isinstance(v,list) and len(v)==1 else v if isinstance(v,str) else None

def crosscheck(candidate,catalog):
 """Catalog None = unavailable; do not interpret as an empty catalog."""
 if not isinstance(catalog,list):
  return {"status":"catalog_unavailable","can_publish":False}
 if candidate.get("status")!="ready_for_catalog_crosscheck":
  return {"status":"not_verified_candidate","can_publish":False}
 url_id=identity(candidate.get("url"))
 candidate_key=key(candidate.get("title"),candidate.get("company"),candidate.get("work_commune"))
 if not url_id or not candidate_key:
  return {"status":"missing_candidate_identity","can_publish":False}
 for item in catalog:
  if not isinstance(item,dict):continue
  if identity(public_source_url(item))==url_id:
   return {"status":"duplicate_source_identity","can_publish":False}
  if key(public_title(item),public_company(item),public_commune(item))==candidate_key:
   return {"status":"possible_semantic_duplicate","can_publish":False}
 # Still only an eligible candidate. Application and source date must be confirmed
 # by the destination's normal verifier and publication receipt.
 return {"status":"not_found_in_catalog","can_publish":False,
         "needs":"destination_verification_and_confirmed_feed_receipt"}
