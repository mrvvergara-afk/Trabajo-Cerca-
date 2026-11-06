"""Read-only production smoke test for Trabajo Cerca A/D.
No offers are inserted and no admin endpoints are called.
"""
import json
import sys
import urllib.parse
import urllib.request

BASE="https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro"
KNOWN_D={
 "https://www.chiletrabajos.cl/trabajo/se-buscan-enfierradores-nacimiento-3926105",
 "https://www.chiletrabajos.cl/trabajo/psicologo-a-22-horas-3926911",
 "https://www.chiletrabajos.cl/trabajo/m1-moldajero-obra-gruesa-hospital-de-nacimiento-contrato-a-trato-3887988"
}
def fetch(path):
    with urllib.request.urlopen(urllib.request.Request(BASE+path,headers={
        "Accept":"application/json","User-Agent":"TrabajoCerca-A-D-ReadOnlyQA/1.0"}),timeout=18) as r:
        return json.load(r)

def main():
    status=fetch("/api/ops/free-public-sources")
    print("A_SOURCE_STATUS",json.dumps({
        "initialized":status.get("initialized"),"publishedConfirmed":status.get("publishedConfirmed"),
        "pending":status.get("pending"),"checkedAt":status.get("checkedAt"),
        "verifiedLastRun":(status.get("summary") or {}).get("verified")
    },ensure_ascii=False))
    print("A_PENDING_DETAIL",json.dumps({
        "html_pending":status.get("pending"),
        "documents":len(((status.get("documentWork") or {}).get("items") or [])),
        "rechecks":(status.get("summary") or {}).get("reverificationBacklog"),
        "checked_at":status.get("checkedAt")
    },ensure_ascii=False))
    bc=fetch("/api/ops/fast-bc")
    print("MOTOR_B_C_LIVE",json.dumps(bc,ensure_ascii=False))
    assert bc.get("historicalQueuesReopened") is False,"Legacy B/C queues were reopened"
    assert isinstance(bc.get("decisions"),dict),"B/C diagnostics missing"
    from collections import Counter
    import re
    docs=(status.get("documentWork") or {}).get("items") or []
    print("A_DOCUMENT_SOURCE_BREAKDOWN",json.dumps({
        "total":len(docs),
        "types":dict(Counter(str(item.get("url","")).split("?")[0].rsplit(".",1)[-1].lower() for item in docs)),
        "older_upload_year_month":dict(Counter(m.group(1) for item in docs if (m:=re.search(r"/(20\\d{2}/(?:0[1-9]|1[0-2]))/",str(item.get("url","")))))),
        "kinds":dict(Counter(str(item.get("kind")) for item in docs))
    },ensure_ascii=False))
    print("A_NONPDF_SAMPLE",json.dumps([
      {"url":row.get("url"),"source":row.get("source")}
      for row in docs if not re.search(r"\\.pdf(?:\\?|$)",str(row.get("url","")),re.I)
    ][:12],ensure_ascii=False))
    print("A_DOCUMENT_ACTIVE_9",json.dumps([{"url":row.get("url"),"source":row.get("source")} for row in docs][:15],ensure_ascii=False))
    assert status.get("initialized") is True,"A not initialized"
    cursor=None
    items=[]
    visited=set()
    for i in range(80):
        params={"fresh":"1"}
        if cursor:params["cursor"]=cursor
        feed=fetch("/api/listings?"+urllib.parse.urlencode(params))
        assert isinstance(feed.get("items"),list),"Public feed unavailable"
        items.extend(feed["items"])
        nxt=feed.get("nextCursor")
        if not nxt:break
        assert nxt not in visited,"Feed cursor loop"
        visited.add(nxt);cursor=nxt
    else:
        raise AssertionError("Feed pagination incomplete")
    urls={str(item.get("url","")).rstrip("/") for item in items}
    a_url="https://www.chiletrabajos.cl/trabajo/bodeguero-a-plan-navidad-preunic-angol-3925963"
    a_match=[item for item in items if str(item.get("url","")).rstrip("/")==a_url]
    print("A_KNOWN_VERIFIED",json.dumps({"url":a_url,"public_visible":bool(a_match),
        "match": [{k:row.get(k) for k in ("title","company","source","verified","review","active")} for row in a_match[:2]]},
        ensure_ascii=False))
    assert a_match,"Motor A verified known Preunic offer but it is not visible"
    missing=sorted(KNOWN_D-urls)
    print("PUBLIC_FEED",json.dumps({"items":len(items),"known_D_found":len(KNOWN_D)-len(missing),
        "missing_D":missing},ensure_ascii=False))
    assert len(items)>=100,"Public catalog unexpectedly small"
    assert not missing,"Previously confirmed Motor D offers disappeared"
    print("QA_A_D_PUBLIC_SUCCESS: public catalog stable and known D offers visible; A scanning active")
if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("QA_A_D_PUBLIC_FAILURE:",type(exc).__name__,str(exc))
        sys.exit(1)
