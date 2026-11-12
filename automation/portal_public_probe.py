"""Read-only portal probe. Bounded public access; never bypass robots, logins or rate limits.
Produces candidate links only, not verified or published vacancies.
"""
import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from bs4 import BeautifulSoup
from portal_coverage_registry import PORTALS, COMMUNES, coverage_report, blocked_without_authorization
from portal_individual_evidence import read_individual_evidence

AGENT="TrabajoCercaPortalAudit/1.0"
MAX_BYTES=650_000
MAX_LINKS=40
UA_HEADERS={"User-Agent":AGENT,"Accept":"text/html,application/xhtml+xml"}
# Explicit individual-job patterns; never turn a search page, alert or profile into a job.
INDIVIDUAL={
 "computrabajo":re.compile(r"^/ofertas-de-trabajo/oferta-de-trabajo-de-[^?#/]+/?$",re.I),
 "laborum":re.compile(r"^/empleos/[^/?#]*-\d{5,}\.html/?$",re.I),
 "opcionempleo":re.compile(r"^/jobad/[a-z0-9]{12,}(?:\.html)?/?$",re.I),
 "chiletrabajos":re.compile(r"^/trabajo/[^/?#]+/?$",re.I),
 "trabajando":re.compile(r"^/(?:trabajo|oferta|empleo|vacante)/[^?#]{8,}$",re.I),
}
HOSTS={
 "computrabajo":{"cl.computrabajo.com"},
 "laborum":{"laborum.cl","www.laborum.cl"},
 "opcionempleo":{"opcionempleo.cl","www.opcionempleo.cl"},
 "chiletrabajos":{"chiletrabajos.cl","www.chiletrabajos.cl"},
 "trabajando":{"trabajando.cl","www.trabajando.cl"},
}

def canonical_job(portal, raw, base):
 try:
  parsed=urllib.parse.urlsplit(urllib.parse.urljoin(base,raw))
  if parsed.scheme!="https" or parsed.username or parsed.password or parsed.port:
   return None
  if parsed.hostname not in HOSTS[portal] or not INDIVIDUAL[portal].fullmatch(parsed.path):
   return None
  # Strip referral tracking but preserve native job IDs if encoded in the path.
  return urllib.parse.urlunsplit(("https",parsed.netloc.lower(),parsed.path.rstrip("/"),"",""))
 except ValueError:
  return None

def extract_individual_links(portal, html, base):
 soup=BeautifulSoup(html,"html.parser")
 found={}
 for tag in soup.select("a[href]")[:650]:
  link=canonical_job(portal,tag.get("href",""),base)
  if link:
   label=" ".join(tag.stripped_strings)[:220].strip()
   found.setdefault(link,{"url":link,"label":label})
  if len(found)>=MAX_LINKS:break
 return list(found.values())

def robots_allowed(url, timeout=10):
 parsed=urllib.parse.urlsplit(url)
 robots=f"{parsed.scheme}://{parsed.netloc}/robots.txt"
 request=urllib.request.Request(robots,headers=UA_HEADERS)
 try:
  with urllib.request.urlopen(request,timeout=timeout) as response:
   if response.status!=200:return False,"robots_unavailable"
   raw=response.read(250001)
  if len(raw)>250000:return False,"robots_unavailable"
  policy=urllib.robotparser.RobotFileParser()
  policy.parse(raw.decode("utf-8","replace").splitlines())
  return (True,"robots_permitted") if policy.can_fetch(AGENT,url) else (False,"robots_disallowed")
 except Exception:
  return False,"robots_unavailable"

def fetch_public_html(url, timeout=14):
 request=urllib.request.Request(url,headers=UA_HEADERS)
 try:
  with urllib.request.urlopen(request,timeout=timeout) as response:
   status=response.status
   if urllib.parse.urlsplit(response.geturl()).hostname != urllib.parse.urlsplit(url).hostname:
    return 0,None
   content_type=response.headers.get("Content-Type","").lower()
   if status!=200:return status,None
   if "html" not in content_type:return status,None
   data=response.read(MAX_BYTES+1)
   if len(data)>MAX_BYTES:return status,None
   return status,data.decode("utf-8","replace")
 except urllib.error.HTTPError as e:return e.code,None
 except Exception:return 0,None

def scan_one(portal,commune,*,fetch=fetch_public_html,authorize=robots_allowed,read_details=False):
 url=PORTALS[portal](commune)
 record={"portal":portal,"commune":commune,"url":url,
  "status":"not_yet_checked","http":None,"unverified_links":0,
  "individual_offers_read":0,"candidate_links":[],"detail_evidence":[],"ready_for_catalog_crosscheck":0}
 granted,reason=authorize(url)
 if not granted:
  record["status"]=reason
  return record
 status,html=fetch(url)
 record["http"]=status
 if status in (401,403,406,429):
  record["status"]="access_restricted"
  return record
 if status!=200:
  record["status"]="http_error" if status else "network_error"
  return record
 if html is None:
  record["status"]="html_unreadable"
  return record
 # A 200 HTTP response can still be an application-level 404 or login wall.
 # Do not mislabel these as an empty, successfully scanned job index.
 page=BeautifulSoup(html,"html.parser")
 visible=page.get_text(" ",strip=True)[:3500]
 if re.search(r"(?:No encontramos la p[aá]gina que buscas|Error[- ]404|P[aá]gina no encontrada|Page not found)",visible,re.I):
  record["status"]="soft_404_or_invalid_search_path"
  return record
 if re.search(r"(?:verify you are human|access denied|unusual traffic|checkpoint_required)",visible,re.I):
  record["status"]="access_challenge"
  return record
 links=extract_individual_links(portal,html,url)
 record["candidate_links"]=links
 record["unverified_links"]=len(links)
 record["status"]="index_links_found" if links else "index_accessible_no_job_links"
 if read_details:
  for candidate in links:
   individual=candidate["url"]
   permitted,block=authorize(individual)
   if not permitted:
    record["detail_evidence"].append({"url":individual,"status":block})
    continue
   response_code,document=fetch(individual)
   if response_code!=200 or document is None:
    record["detail_evidence"].append({"url":individual,"status":"restricted_or_unreadable","http":response_code})
    continue
   result=read_individual_evidence(portal,individual,document)
   record["individual_offers_read"]+=1
   record["ready_for_catalog_crosscheck"]+=int(result["status"]=="ready_for_catalog_crosscheck")
   record["detail_evidence"].append(result)
 return record

def collect(portals,communes,*,fetch=fetch_public_html,authorize=robots_allowed,read_details=False):
 # One query per portal and locality, no paginated bursts or login challenges.
 results=[]
 for portal in portals:
  for commune in communes:
   results.append(scan_one(portal,commune,fetch=fetch,authorize=authorize,read_details=read_details))
 return results

def main():
 parser=argparse.ArgumentParser()
 parser.add_argument("--portal",choices=list(PORTALS)+["all"],default="all")
 parser.add_argument("--commune",choices=list(COMMUNES)+["all"],default="all")
 parser.add_argument("--read-details",action="store_true",help="Explicit opt-in; only with one named portal and commune")
 parser.add_argument("--output",default="")  # No default write into tracked production state.
 args=parser.parse_args()
 if args.read_details and (args.portal=="all" or args.commune=="all"):
  parser.error("--read-details requires one --portal and one --commune to prevent unbounded reads")
 portals=list(PORTALS) if args.portal=="all" else [args.portal]
 communes=list(COMMUNES) if args.commune=="all" else [args.commune]
 rows=collect(portals,communes,read_details=args.read_details)
 rows.extend(x for x in blocked_without_authorization() if x["commune"] in communes and args.portal=="all")
 report=coverage_report(rows)
 report["probe_method"]="public_html_robots_checked_single_request_no_auth_bypass"
 report["scope"]="diagnostic_only_never_auto_publish"
 output=json.dumps(report,ensure_ascii=False,indent=2)
 if args.output:
  destination=Path(args.output)
  destination.parent.mkdir(parents=True,exist_ok=True)
  destination.write_text(output+"\n",encoding="utf-8")
 print(output)

if __name__=="__main__":main()
