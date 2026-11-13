"""Postdeploy proof: approved ChatGPT batches vs complete AppDeploy public catalog.
Read-only. Do not confuse source match or semantic overlap with a new import.
"""
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from time import sleep
from zoneinfo import ZoneInfo
from motor_d_catalog_probe import read_full_feed, check_ready_offers, source_identity, URL_FIELDS

ROOT = Path("automation/chatgpt_ready")
OUTPUT = Path("output/chatgpt_public_smoke.json")
def main():
    index=json.loads((ROOT/"index.json").read_text(encoding="utf8"))
    offers=[]
    for entry in index.get("batches",[]):
        path=ROOT / str(entry["file"])
        batch=json.loads(path.read_text(encoding="utf8"))
        assert batch.get("approval")=="approved_for_publication"
        assert batch.get("producer")=="chatgpt_territorial"
        assert len(batch["offers"])==entry["count"]
        offers.extend(batch["offers"])
    if not offers:raise SystemExit("NO_APPROVED_CHATGPT_BATCHES")
    feed=[];complete=False;error=None
    for attempt in range(3):
        feed,complete,error=read_full_feed(max_pages=30)
        if complete:break
        if attempt<2:sleep(4)
    if not complete:
        result={"state":"public_feed_unavailable","error":error,"approved":len(offers),
                "present_by_chatgpt_id":None,"visible_by_origin":None,"source_or_id_absent":None}
    else:
        indexes={str(item.get("id")):item for item in feed if item.get("kind") in ("job_offer",None)}
        verdicts=check_ready_offers(offers,feed,True)
        records=[]
        for offer in offers:
            id_source=offer["id_fuente"]
            public_id="chatgpt_"+id_source
            exact=public_id in indexes
            source=verdicts.get(id_source)
            records.append({
                "id_fuente":id_source,
                "title":offer["cargo"],
                "communes":offer["comunas"],
                "url":offer["url_original"],
                "expected_id":public_id,
                "visible_by_chatgpt_id":exact,
                "public_url_match":source=="already_published_source_identity",
                "public_semantic_match":source=="already_published_semantic",
                "source_status":source,
            })
        result={"state":"catalog_complete","checked_at":datetime.now(ZoneInfo("America/Santiago")).isoformat(),
                "feed_rows":len(feed),"approved":len(offers),
                "present_by_chatgpt_id":sum(r["visible_by_chatgpt_id"] for r in records),
                "visible_by_origin":sum(r["public_url_match"] for r in records),
                "only_semantic_overlap":sum(r["public_semantic_match"] for r in records),
                "source_or_id_absent":sum(not(r["visible_by_chatgpt_id"] or r["public_url_match"] or r["public_semantic_match"]) for r in records),
                "records":records}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("CHATGPT_POSTDEPLOY_PUBLIC_SMOKE "+json.dumps({k:v for k,v in result.items() if k!="records"},ensure_ascii=False),flush=True)
    for row in result.get("records",[]):print("CHATGPT_PUBLIC_OFFER "+json.dumps(row,ensure_ascii=False),flush=True)
    if not complete:raise SystemExit("PUBLIC_FEED_UNAVAILABLE")
if __name__=="__main__":main()
