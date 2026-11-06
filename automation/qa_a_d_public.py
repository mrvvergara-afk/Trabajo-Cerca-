"""Read-only production smoke test for Trabajo Cerca A/D (preflight).
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
    from collections import Counter
    by_source=Counter(str(row.get("source") or "sin_fuente") for row in items)
    print("PUBLIC_SOURCE_TOP",json.dumps(by_source.most_common(12),ensure_ascii=False))
    missing=sorted(KNOWN_D-urls)
    print("PUBLIC_FEED",json.dumps({"items":len(items),"known_D_found":len(KNOWN_D)-len(missing),
        "missing_D":missing},ensure_ascii=False))
    assert len(items)>=100,"Public catalog unexpectedly small"
    assert not missing,"Previously confirmed Motor D offers disappeared"
    print("QA_A_D_PUBLIC_SUCCESS: catalog post-deploy accessible; D known offers visible; A initialized")
if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("QA_A_D_PUBLIC_FAILURE:",type(exc).__name__,str(exc))
        sys.exit(1)
