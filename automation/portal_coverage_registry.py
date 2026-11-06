"""Auditoría de cobertura de portales — no publica, no intenta eludir bloqueos."""
import json
from datetime import datetime
from urllib.parse import quote
from zoneinfo import ZoneInfo

COMMUNES=("Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén","Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento")
PORTALS={
 "computrabajo":lambda c:"https://cl.computrabajo.com/empleos-en-"+("biobio" if c in ("Mulchén","Negrete","Nacimiento") else "araucania")+"-en-"+slug(c),
 "laborum":lambda c:"https://www.laborum.cl/empleos-busqueda-"+slug(c)+".html",
 "opcionempleo":lambda c:"https://www.opcionempleo.cl/empleo-en-"+slug(c)+".html",
 "chiletrabajos":lambda c:"https://www.chiletrabajos.cl/encuentra-un-empleo/?2="+quote(c.lower()),
 "trabajando":lambda c:"https://www.trabajando.cl/trabajo-empleo/"+slug(c),
}
AUTHORIZATION_NEEDED=("indeed","linkedin")

def slug(value):
 import unicodedata
 return "-".join("".join(c for c in unicodedata.normalize("NFD",value.lower()) if unicodedata.category(c)!="Mn").split())

def classify_http(status,has_individual_links=False):
 if status in (401,403,406,429):return "access_restricted"
 if status!=200:return "http_error"
 return "index_links_found" if has_individual_links else "index_accessible_no_job_links"

def coverage_report(rows):
 by_portal={}
 for name in (*PORTALS,*AUTHORIZATION_NEEDED):
  group=[x for x in rows if x["portal"]==name]
  by_portal[name]={
   "checked":len(group),
   "accessible":sum(x["status"].startswith("index_") for x in group),
   "unknown":sum(x["status"] in ("not_yet_checked","requires_authorized_access","robots_unavailable","http_error","network_error") for x in group),
   "blocked":sum(x["status"] in ("access_restricted","robots_disallowed","robots_unavailable") for x in group),
   "unverified_links":sum(int(x.get("unverified_links",0)) for x in group),
   "individual_offers_read":sum(int(x.get("individual_offers_read",0)) for x in group),
   "confirmed_publications":0,
   "status_counts":{k:sum(x["status"]==k for x in group) for k in set(x["status"] for x in group)},
  }
 return {"schema":"trabajo-cerca.portal-coverage.v1",
         "at":datetime.now(ZoneInfo("America/Santiago")).isoformat(),
         "communes":COMMUNES,"sources":rows,"summary":by_portal,
         "publishing_enabled":False,
         "warning":"Index access or link discovery does not prove a verified job."}

def build_audit_tasks():
 return [{"portal":p,"commune":c,"url":fn(c)} for p,fn in PORTALS.items() for c in COMMUNES]

def blocked_without_authorization():
 return [{"portal":p,"commune":c,"url":None,"status":"requires_authorized_access","unverified_links":0}
         for p in AUTHORIZATION_NEEDED for c in COMMUNES]

if __name__=="__main__":
 # Deliberately NO HTTP calls: separate read-only probe runs under independently
 # reviewed access/robots policy; never silently turn an inaccessible site into 0 jobs.
 rows=[dict(row,status="not_yet_checked",unverified_links=0) for row in build_audit_tasks()]
 rows+=blocked_without_authorization()
 print(json.dumps(coverage_report(rows),ensure_ascii=False,indent=2))
