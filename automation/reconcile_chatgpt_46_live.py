"""Concilia las 46 URL reales de ChatGPT contra TODOS los avisos visibles.
No escribe en AppDeploy, no confunde catálogo inaccesible con ausencia.
"""
import hashlib
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from chatgpt_extraction_contract import canonical_source_url, url_hash
from motor_d_catalog_probe import URL_FIELDS, read_full_feed, source_identity

INPUT = Path("automation/chatgpt_20261113_46_urls.txt")
OUTPUT = Path("output/chatgpt_46_live_reconciliation.json")

def digest(url):
    try:
        return url_hash(url)
    except (TypeError,ValueError):
        return None

def compare(urls, feed, complete, error=None):
    if len(urls)!=46 or len(set(urls))!=46:
        raise ValueError("input_lot_not_46_unique")
    if not complete:
        return {"catalog_complete":False,"feed_error":error,
                "offers_checked":46,"confirmed_visible":None,
                "absent_from_complete_catalog":None,
                "rows":[]}
    hash_to_public={}
    identity_to_public={}
    for row in feed:
        if row.get("kind") not in (None,"job_offer"):
            continue
        for field in URL_FIELDS:
            raw=row.get(field)
            if not isinstance(raw,str):
                continue
            value=digest(raw)
            if value:
                hash_to_public.setdefault(value,set()).add(str(row.get("id","")))
            identity=source_identity(raw)
            if identity:
                identity_to_public.setdefault(identity,set()).add(str(row.get("id","")))
        stored=row.get("urlHashSha256")
        if isinstance(stored,str) and len(stored)==64:
            hash_to_public.setdefault(stored,set()).add(str(row.get("id","")))
    rows=[]
    for raw in urls:
        key=digest(raw)
        identity=source_identity(raw)
        byhash=hash_to_public.get(key,set())
        byidentity=identity_to_public.get(identity,set())
        found=sorted(byhash|byidentity)
        rows.append({"url":raw,"sha256":key,"source_identity":identity,
                     "status":"visible_by_url_identity" if found else "not_found_in_full_feed",
                     "public_ids":found,"match_method":"sha256" if byhash else "source_identity" if byidentity else None})
    return {"catalog_complete":True,"checked_at":datetime.now(ZoneInfo("America/Santiago")).isoformat(),
            "feed_rows":len(feed),"offers_checked":len(urls),
            "confirmed_visible":sum(bool(x["public_ids"]) for x in rows),
            "absent_from_complete_catalog":sum(not x["public_ids"] for x in rows),
            "rows":rows}

def main():
    urls=[s.strip() for s in INPUT.read_text(encoding="utf-8").splitlines() if s.strip()]
    feed,complete,error=read_full_feed(max_pages=30)
    result=compare(urls,feed,complete,error)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CHATGPT_46_LIVE_RECONCILIATION "+json.dumps({
        k:v for k,v in result.items() if k!="rows"},ensure_ascii=False),flush=True)
    if complete:
        for row in result["rows"]:
            print("CHATGPT_46_URL "+json.dumps({
                "status":row["status"],"url":row["url"],
                "public_ids":row["public_ids"]},ensure_ascii=False),flush=True)
    if not complete:
        raise SystemExit("CATALOG_UNAVAILABLE_FAIL_CLOSED")
if __name__=="__main__":
    main()
