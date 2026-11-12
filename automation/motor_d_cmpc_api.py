"""Read official CMPC Cornerstone job-search API (public requisitions, read-only).

This endpoint and careerSiteId 4 are already used by the Trabajo Cerca
AppDeploy backend. The API's *structured job data*, not the empty career
landing page, is the primary source. Never infer worksite from the city of
a recruiter or from a broad regional mention.

No credentials, no browser bypass, no submission, no database writes.
"""
from datetime import date
import json
import re
from urllib.parse import urlsplit

import requests

API_URL="https://us.api.csod.com/rec-job-search/external/jobs"
CAREER="https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc"
CAREER_PATH="/ux/ats/careersite/4/home"
COMMUNES={
    "angol":"Angol", "collipulli":"Collipulli", "mininco":"Collipulli",
    "ercilla":"Ercilla","lumaco":"Lumaco","los sauces":"Los Sauces",
    "puren":"Purén","renaico":"Renaico","traiguen":"Traiguén",
    "victoria":"Victoria","mulchen":"Mulchén",
    "negrete":"Negrete","coihue":"Negrete","coigue":"Negrete",
    "nacimiento":"Nacimiento",
}


def fold(value):
    import unicodedata
    text=unicodedata.normalize("NFD",str(value or "").casefold())
    return "".join(c for c in text if unicodedata.category(c)!="Mn").strip()


def source_is_official_cmpc(url):
    try:
        u=urlsplit(url)
        return (u.scheme=="https" and u.hostname=="cmpc.csod.com"
                and u.path.rstrip("/")==CAREER_PATH
                and u.query=="c=cmpc" and not u.fragment
                and not u.username and not u.password and u.port is None)
    except (TypeError,ValueError):
        return False


def valid_source_date(value,today,allow_future=False):
    if not isinstance(value,str):
        return None
    token=value[:10]
    if not re.fullmatch(r"20\d{2}-\d{2}-\d{2}",token):
        return None
    try:
        value=date.fromisoformat(token)
        if value.year<2020 or (value>today and not allow_future):
            return None
        return value.isoformat()
    except ValueError:
        return None


def parse_requisition(row,today):
    """Return (eligible candidate or None, reason).

    A unique official requisition and one unambiguous CL work city are required.
    An undated requisition remains a source lead, not a fabricated dated job.
    """
    if not isinstance(row,dict):
        return None,"not_object"
    req=row.get("requisitionId")
    if isinstance(req,bool) or not str(req).isdigit() or not (0<int(req)<10**9):
        return None,"requisition_id_missing"
    title=row.get("displayJobTitle")
    if not isinstance(title,str) or len(title.strip())<5:
        return None,"title_missing"
    locations=row.get("locations")
    if not isinstance(locations,list) or not locations or len(locations)>30:
        return None,"locations_missing"
    chile=[x for x in locations if isinstance(x,dict) and
           str(x.get("country") or "").upper()=="CL"]
    if len(chile)!=len(locations):
        return None,"mixed_or_unknown_countries"
    raw_cities={fold(x.get("city")) for x in chile}
    if not raw_cities or len(raw_cities)!=1:
        return None,"ambiguous_worksite_cities"
    raw_city=next(iter(raw_cities))
    work=COMMUNES.get(raw_city)
    if not work:
        return None,"not_target_commune"
    published=valid_source_date(row.get("postingEffectiveDate"),today)
    if not published:
        return None,"original_date_unconfirmed"
    expiry_raw=row.get("postingExpirationDate")
    expiry=valid_source_date(expiry_raw,today,allow_future=True) if expiry_raw else None
    if expiry_raw and not expiry:
        return None,"expiry_invalid"
    if expiry and expiry<today.isoformat():
        return None,"expired"
    requisition=int(req)
    url=(f"https://cmpc.csod.com/ux/ats/careersite/4/home/"
         f"requisition/{requisition}?c=cmpc")
    # Evidence comes from Cornerstone's public requisition row, not a scraped
    # title and not a recruiter's region. A source link is the apply route.
    return {
        "url":url,"title":title.strip()[:180],"label":title.strip()[:180],
        "employer":"CMPC","work_commune":work,
        "explicit_worksite_commune":work,"raw_worksite_city":next(
            x["city"] for x in chile if fold(x.get("city"))==raw_city),
        "source_commune_not_confirmed":False,
        "date_source":published,"deadline":expiry,
        "application_evidence":True,
        "application_method":"official_cornerstone_requisition",
        "source_date_method":"official_cornerstone_requisition",
        "evidence":"individual_page_with_job_terms",
        "source_evidence_method":"official_api_requisition_object",
        "http":200,"index_status":"open",
        "requisition_id":requisition,
    }, "eligible"


def read_cmpc_requisitions(today=None,post=None,max_pages=5,page_size=100):
    today=today or date.today()
    post=post or requests.post
    if not (1<=max_pages<=10 and 1<=page_size<=100):
        raise ValueError("invalid_api_pagination")
    all_rows=[];seen=set();reasons={}
    def count(reason):reasons[reason]=reasons.get(reason,0)+1
    http=None;pages=0;complete=False;error=None
    for page in range(1,max_pages+1):
        data={
            "careerSiteId":4, "pageNumber":page, "pageSize":page_size,
            "searchText":"", "cultureId":0
        }
        response=None
        try:
            response=post(
                API_URL,
                headers={"Accept":"application/json",
                         "Content-Type":"application/json",
                         "Origin":"https://cmpc.csod.com","Referer":CAREER},
                json=data,timeout=(5,12),allow_redirects=False,stream=True)
            http=response.status_code
            if http!=200:
                error=f"official_api_http_{http}"
                break
            kind=response.headers.get("Content-Type","").lower()
            if "json" not in kind:
                error="official_api_not_json"
                break
            parts=[];length=0
            for part in response.iter_content(32768):
                length+=len(part)
                if length>900000:
                    error="official_api_response_oversize"
                    break
                parts.append(part)
            if error:
                break
            body=json.loads(b"".join(parts))
            if not isinstance(body,dict) or not isinstance(body.get("data"),dict):
                error="official_api_schema_invalid"
                break
            jobs=body["data"].get("requisitions")
            if not isinstance(jobs,list) or len(jobs)>page_size:
                error="official_api_schema_invalid"
                break
            pages+=1
            if not jobs:
                complete=True
                break
            # Do not trust pages that repeat the same requisition(s).
            fresh=0
            for row in jobs:
                key=str(row.get("requisitionId") if isinstance(row,dict) else "")
                if not key or key in seen:
                    count("duplicate_or_invalid_requisition")
                    continue
                seen.add(key);fresh+=1
                candidate,reason=parse_requisition(row,today)
                count(reason)
                if candidate:
                    all_rows.append(candidate)
            if not fresh:
                error="official_api_repeated_page"
                break
            if len(jobs)<page_size:
                complete=True
                break
        except (ValueError,TypeError,requests.RequestException,UnicodeError) as exc:
            error="official_api_"+type(exc).__name__
            break
        finally:
            if response is not None:
                response.close()
    if error is None and not complete:
        error="official_api_pagination_not_complete"
    return {
        "http":http,"status":(
            "scanned_with_candidates" if complete and all_rows
            else "scanned_no_candidates" if complete
            else "scanned_partial_index" if pages and all_rows
            else "http_restricted" if http in (401,403,406,429)
            else "network_error"),
        "official_api_index_complete":complete,
        "official_api_pages":pages,
        "official_api_job_records_examined":len(seen),
        "official_api_candidates":len(all_rows),
        "official_api_reason_counts":reasons,
        "official_api_error":error,
        "candidates":all_rows,
    }
