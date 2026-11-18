"""Motor A -> Motor D durable REVIEW-ONLY handoff.

No auto-approval, no AppDeploy writes, no invented date/worksite. The
territorial Motor D re-reads each ORIGINAL job URL before any publication.
"""
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

INPUT=Path("output/verification_stage.json")
STATE=Path("automation/motor_a_review/pending.json")
CHECKS=Path("output/motor_a_checks.json")
CHECK_STATE=Path("automation/motor_a_review/state.json")
ALLOWED={"Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén",
         "Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento"}


def canonical(raw):
    try:
        u=urlsplit(raw)
        if (u.scheme!="https" or u.hostname not in
                ("www.chiletrabajos.cl","chiletrabajos.cl")
                or u.port is not None or u.username or u.password or u.query):
            return None
        if not re.fullmatch(r"/trabajo/[^/?#]+-\d{5,12}/?",u.path):
            return None
        return "https://www.chiletrabajos.cl"+u.path.rstrip("/")
    except (TypeError,ValueError):
        return None


def public_job_id(url):
    """Stable Chiletrabajos numeric identity across URL slugs and aliases."""
    try:
        parsed=urlsplit(str(url))
        if (parsed.scheme!="https" or parsed.hostname not in
                ("www.chiletrabajos.cl","chiletrabajos.cl")):
            return None
        match=re.fullmatch(r"/trabajo/(?:[^/?]+-)?(\d{5,12})/?",parsed.path)
        return match.group(1) if match else None
    except (TypeError,ValueError):
        return None


def catalog_jobs(snapshot,now):
    """Never prune without a recent, complete public-identity snapshot."""
    if (not isinstance(snapshot,dict) or snapshot.get("complete") is not True or
            not isinstance(snapshot.get("items"),list)):
        return {}
    try:
        checked=dt.datetime.fromisoformat(snapshot["generated_at"].replace("Z","+00:00"))
        if (checked.tzinfo is None or checked>now+dt.timedelta(minutes=10) or
                now-checked>dt.timedelta(hours=48)):
            return {}
    except (KeyError,ValueError,TypeError,AttributeError):
        return {}
    jobs={}
    for row in snapshot["items"]:
        if not isinstance(row,dict):
            continue
        source=public_job_id(row.get("url"))
        places=row.get("workCommunes")
        if source and isinstance(places,list) and places:
            jobs.setdefault(source,set()).update(x for x in places if isinstance(x,str))
    return jobs


def expired_hint(value,now):
    if not isinstance(value,str) or not re.match(r'^20\d{2}-\d{2}-\d{2}',value):
        return False
    try:
        return dt.date.fromisoformat(value[:10])<now.date()
    except ValueError:
        return False


def merge(existing,stage,today=None,catalog=None):
    now=today or dt.datetime.now(dt.timezone.utc)
    cutoff=now-dt.timedelta(days=45)
    items={}
    if existing:
        if existing.get("schema_version")!=1 or not isinstance(existing.get("items"),list):
            raise ValueError("invalid_previous_motor_a_queue")
        for x in existing["items"]:
            if not isinstance(x,dict):raise ValueError("bad_motor_a_queue_item")
            url=canonical(x.get("url"))
            last=x.get("last_checked_at")
            try:checked=dt.datetime.fromisoformat(last.replace("Z","+00:00"))
            except (ValueError,AttributeError,TypeError):continue
            if url and checked >= cutoff and x.get("work_commune") in ALLOWED and x.get("status")=="recheck_original":
                items[url]=x
    if not isinstance(stage,dict) or not isinstance(stage.get("results"),list):
        raise ValueError("invalid_motor_a_stage")
    count={"added":0,"updated":0,"closed":0,"invalid":0,
           "expired":0,"published_reconciled":0,"territory_mismatch":0}
    for row in stage["results"]:
        if not isinstance(row,dict):count["invalid"]+=1;continue
        url=canonical(row.get("candidate_url"))
        if not url:count["invalid"]+=1;continue
        status=row.get("status")
        if status=="rejected" and row.get("reason") in ("closed_notice","expired_source_deadline"):
            if url in items:del items[url];count["closed"]+=1
            continue
        if status!="review_ready":continue
        commune=row.get("work_commune")
        if commune not in ALLOWED:count["invalid"]+=1;continue
        previous=items.get(url,{})
        if previous:count["updated"]+=1
        else:count["added"]+=1
        items[url]={
            "id":"a_"+hashlib.sha256(url.encode()).hexdigest()[:20],
            "url":url,"source":"Motor A Chiletrabajos",
            "work_commune":commune,"title_hint":str(row.get("title") or "")[:180],
            "date_source_hint":row.get("date_source_hint"),
            "deadline_hint":row.get("deadline_hint"),
            "first_discovered_at":previous.get("first_discovered_at") or now.isoformat(),
            "last_checked_at":now.isoformat(),
            "status":"recheck_original",
            "publication_eligible":False,
            "date_source_verified":False,
            "work_commune_finally_verified":False,
            "review_reason":str(row.get("reason") or "structured_worksite")[:80],
        }
    # Reconcile with complete public identities without deleting legitimate
    # mismatches (a published wrong-city listing still requires correction).
    published=catalog_jobs(catalog,now) if catalog is not None else {}
    for url,item in list(items.items()):
        if expired_hint(item.get("deadline_hint"),now):
            del items[url]
            count["expired"]+=1
            continue
        public_sites=published.get(public_job_id(url),set())
        if public_sites:
            if item["work_commune"] in public_sites:
                del items[url]
                count["published_reconciled"]+=1
            else:
                item["catalog_territory_mismatch"]=True
                item["catalog_work_communes"]=sorted(public_sites)
                count["territory_mismatch"]+=1
    # Retain most recently *individually checked* leads, never 45-day-old
    # search results without fresh proof.
    rows=sorted(items.values(),key=lambda x:x["last_checked_at"],reverse=True)[:500]
    return {"schema_version":1,"updated_at":now.isoformat(),
            "items_total":len(rows),"automatically_published":0,"items":rows,
            "metrics":count}


def main():
    if not INPUT.exists():raise FileNotFoundError("Motor A stage not created")
    stage=json.loads(INPUT.read_text(encoding="utf-8"))
    old=json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else None
    snapshot_path=Path("automation/catalog_public_identities.json")
    try:
        catalog=json.loads(snapshot_path.read_text(encoding="utf-8")) if snapshot_path.exists() else None
    except (ValueError,OSError):
        catalog=None
    data=merge(old,stage,catalog=catalog)
    STATE.parent.mkdir(parents=True,exist_ok=True)
    STATE.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if CHECKS.exists():
        checks=json.loads(CHECKS.read_text(encoding="utf-8"))
        if checks.get("schema_version")!=1:raise ValueError("invalid_motor_a_checkpoints")
        CHECK_STATE.write_text(json.dumps(checks,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    export={"pending":data["items_total"],"publication_eligible":0,**data["metrics"]}
    Path("output/motor_a_handoff.json").write_text(
        json.dumps(export,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("MOTOR_A_HANDOFF "+json.dumps(export,ensure_ascii=False))


if __name__=="__main__":
    main()
,urlsplit(clean).path)
    return match.group(1) if match else None


def catalog_jobs(snapshot,now):
    """Only a fresh, complete catalog can remove published Motor A leads."""
    if not isinstance(snapshot,dict) or snapshot.get("complete") is not True or not isinstance(snapshot.get("items"),list):
        return {}
    try:
        checked=dt.datetime.fromisoformat(snapshot["generated_at"].replace("Z","+00:00"))
        if checked.tzinfo is None or checked>now+dt.timedelta(minutes=10) or now-checked>dt.timedelta(hours=48):
            return {}
    except (KeyError,ValueError,TypeError,AttributeError):
        return {}
    jobs={}
    for row in snapshot["items"]:
        if not isinstance(row,dict):continue
        source=public_job_id(row.get("url"))
        places=row.get("workCommunes")
        if source and isinstance(places,list) and places:
            jobs.setdefault(source,set()).update(x for x in places if isinstance(x,str))
    return jobs


def expired_hint(value,now):
    if not isinstance(value,str) or not re.match(r'^20\d{2}-\d{2}-\d{2}',value):
        return False
    try:
        return dt.date.fromisoformat(value[:10])<now.date()
    except ValueError:
        return False


def merge(existing,stage,today=None,catalog=None):
    now=today or dt.datetime.now(dt.timezone.utc)
    cutoff=now-dt.timedelta(days=45)
    items={}
    if existing:
        if existing.get("schema_version")!=1 or not isinstance(existing.get("items"),list):
            raise ValueError("invalid_previous_motor_a_queue")
        for x in existing["items"]:
            if not isinstance(x,dict):raise ValueError("bad_motor_a_queue_item")
            url=canonical(x.get("url"))
            last=x.get("last_checked_at")
            try:checked=dt.datetime.fromisoformat(last.replace("Z","+00:00"))
            except (ValueError,AttributeError,TypeError):continue
            if url and checked >= cutoff and x.get("work_commune") in ALLOWED and x.get("status")=="recheck_original":
                items[url]=x
    if not isinstance(stage,dict) or not isinstance(stage.get("results"),list):
        raise ValueError("invalid_motor_a_stage")
    count={"added":0,"updated":0,"closed":0,"invalid":0}
    for row in stage["results"]:
        if not isinstance(row,dict):count["invalid"]+=1;continue
        url=canonical(row.get("candidate_url"))
        if not url:count["invalid"]+=1;continue
        status=row.get("status")
        if status=="rejected" and row.get("reason")=="closed_notice":
            if url in items:del items[url];count["closed"]+=1
            continue
        if status!="review_ready":continue
        commune=row.get("work_commune")
        if commune not in ALLOWED:count["invalid"]+=1;continue
        previous=items.get(url,{})
        if previous:count["updated"]+=1
        else:count["added"]+=1
        items[url]={
            "id":"a_"+hashlib.sha256(url.encode()).hexdigest()[:20],
            "url":url,"source":"Motor A Chiletrabajos",
            "work_commune":commune,"title_hint":str(row.get("title") or "")[:180],
            "date_source_hint":row.get("date_source_hint"),
            "deadline_hint":row.get("deadline_hint"),
            "first_discovered_at":previous.get("first_discovered_at") or now.isoformat(),
            "last_checked_at":now.isoformat(),
            "status":"recheck_original",
            "publication_eligible":False,
            "date_source_verified":False,
            "work_commune_finally_verified":False,
            "review_reason":str(row.get("reason") or "structured_worksite")[:80],
        }
    # Retain most recently *individually checked* leads, never 45-day-old
    # search results without fresh proof.
    rows=sorted(items.values(),key=lambda x:x["last_checked_at"],reverse=True)[:500]
    return {"schema_version":1,"updated_at":now.isoformat(),
            "items_total":len(rows),"automatically_published":0,"items":rows,
            "metrics":count}


def main():
    if not INPUT.exists():raise FileNotFoundError("Motor A stage not created")
    stage=json.loads(INPUT.read_text(encoding="utf-8"))
    old=json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else None
    data=merge(old,stage)
    STATE.parent.mkdir(parents=True,exist_ok=True)
    STATE.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if CHECKS.exists():
        checks=json.loads(CHECKS.read_text(encoding="utf-8"))
        if checks.get("schema_version")!=1:raise ValueError("invalid_motor_a_checkpoints")
        CHECK_STATE.write_text(json.dumps(checks,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    export={"pending":data["items_total"],"publication_eligible":0,**data["metrics"]}
    Path("output/motor_a_handoff.json").write_text(
        json.dumps(export,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("MOTOR_A_HANDOFF "+json.dumps(export,ensure_ascii=False))


if __name__=="__main__":
    main()
