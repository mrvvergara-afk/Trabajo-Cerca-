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


def merge(existing,stage,today=None):
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
        json.dumps(export,ensure_ascii=False,indent=2)+"\\n",encoding="utf-8")
    print("MOTOR_A_HANDOFF "+json.dumps(export,ensure_ascii=False))


if __name__=="__main__":
    main()
