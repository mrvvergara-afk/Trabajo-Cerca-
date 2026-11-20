"""Extract verifiable job metadata from a public individual HTML page.
Never treat a portal index, location filter, or relative time as an approved offer.
"""
import json
import re
from datetime import date, datetime, timedelta
from bs4 import BeautifulSoup
from portal_coverage_registry import COMMUNES

ALIASES={"mininco":"Collipulli","coihue":"Negrete","coigüe":"Negrete"}
CLOSED_PHRASES=re.compile(r"(?:postulaciones?\s+cerrad[ao]s?|vacante\s+cubierta|empleo\s+finalizado|no longer accepting applications|job\s+closed)",re.I)

def folded(value):
 import unicodedata
 return "".join(c for c in unicodedata.normalize("NFD",str(value).casefold())
                if unicodedata.category(c)!="Mn").strip()

def territory(value):
 if not isinstance(value,str):return None
 norm=folded(value)
 for item in COMMUNES:
  if norm==folded(item):return item
 for alias,place in ALIASES.items():
  if norm==folded(alias):return place
 return None

def iso_day(value):
 if not isinstance(value,str):return None
 match=re.match(r"^(20\d{2}-\d{2}-\d{2})(?:T|$)",value.strip())
 if not match:return None
 try:return date.fromisoformat(match.group(1))
 except ValueError:return None

def schema_jobs(html):
 soup=BeautifulSoup(html,"html.parser")
 found=[]
 for script in soup.select('script[type="application/ld+json"]')[:35]:
  try:obj=json.loads(script.string or script.get_text())
  except (TypeError,ValueError):continue
  stack=[obj]
  while stack:
   v=stack.pop()
   if isinstance(v,list):stack.extend(v)
   elif isinstance(v,dict):
    if "@graph" in v:stack.append(v["@graph"])
    kind=v.get("@type")
    types=kind if isinstance(kind,list) else [kind]
    if "JobPosting" in types:found.append(v)
 return found

def job_location(job):
 locations=job.get("jobLocation",[])
 locations=locations if isinstance(locations,list) else [locations]
 places=set()
 for location in locations:
  if not isinstance(location,dict):continue
  address=location.get("address") or {}
  if isinstance(address,dict):
   place=territory(address.get("addressLocality"))
   if place:places.add(place)
  else:
   place=territory(address)
   if place:places.add(place)
 return next(iter(places)) if len(places)==1 else None

def employer_name(job):
 company=job.get("hiringOrganization") or {}
 if isinstance(company,dict):return str(company.get("name") or "").strip()
 return ""

def read_individual_evidence(portal,url,html,today=None):
 """Return conservative state and evidence, not a published offer."""
 today=today or date.today()
 result={"portal":portal,"url":url,"status":"review_required",
         "verified_publication":False,"source_date":None,
         "work_commune":None,"title":None,"company":None}
 if not isinstance(html,str) or len(html)>700_000:
  result["reason"]="invalid_html"
  return result
 page=BeautifulSoup(html,"html.parser")
 content=page.get_text(" ",strip=True)[:8500]
 if CLOSED_PHRASES.search(content):
  result.update(status="closed",reason="explicit_closed")
  return result
 jobs=schema_jobs(html)
 if len(jobs)!=1:
  result["reason"]="jobposting_missing_or_ambiguous"
  return result
 job=jobs[0]
 title=str(job.get("title") or "").strip()
 company=employer_name(job)
 commune=job_location(job)
 posted=iso_day(job.get("datePosted"))
 deadline=iso_day(job.get("validThrough"))
 result.update(title=title or None,company=company or None,
               work_commune=commune,source_date=posted.isoformat() if posted else None,
               source_valid_through=deadline.isoformat() if deadline else None)
 if deadline and deadline<today:
  result.update(status="closed",reason="expired_explicit_deadline")
  return result
 if not title or not company or not commune or not posted:
  result["reason"]="incomplete_employer_worksite_or_original_date"
  return result
 if posted>today:
  result["reason"]="future_publication_date"
  return result
 if posted<today-timedelta(days=1):
  result["status"]="historical_review"
  result["reason"]="outside_daily_today_yesterday_window_not_closed"
  return result
 # A verifiable JobPosting can be cross-checked against existing catalog.
 # Does NOT assert ability to apply, or that feed ingestion succeeded.
 result.update(status="ready_for_catalog_crosscheck",reason="explicit_jobposting_fields")
 return result
