"""Promote current official CMPC browser approvals into the ACTUAL AppDeploy bridge.

The former approved file alone never reached AppDeploy, which only consumes
automation/motor_d_ready/index.json and its referenced immutable batches.
Never stage a stale crawl, an unconfirmed requisition or a duplicate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

from stage_motor_d_handoff import prepare as stage_reviewed_batch

CMPC_URL = re.compile(
    r"https://cmpc\.csod\.com/ux/ats/careersite/4/home/requisition/([1-9]\d{0,9})\?c=cmpc"
)
LOCAL = frozenset((
    "Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén","Renaico",
    "Traiguén","Victoria","Mulchén","Negrete","Nacimiento"
))


def _time(value):
    try:
        stamp=datetime.fromisoformat(value)
    except (TypeError,ValueError,AttributeError):
        raise ValueError("missing_official_scan_timestamp") from None
    if stamp.tzinfo is None or stamp.utcoffset() is None:
        raise ValueError("official_scan_timestamp_without_timezone")
    return stamp.astimezone(timezone.utc)


def build(approved, evidence, index, now=None):
    """Return staging tuple or None when no *new* approved offer remains."""
    now=now or datetime.now(timezone.utc)
    if now.utcoffset() is None:
        raise ValueError("missing_now_timezone")
    now=now.astimezone(timezone.utc)
    if approved is None:
        return None
    if not isinstance(approved,dict) or approved.get("schema_version")!=1 or approved.get("approval")!="approved_for_publication" or approved.get("producer")!="chatgpt" or not re.fullmatch(r"motor-d-cmpc-[a-f0-9]{16}",str(approved.get("batch_id",""))):
        raise ValueError("invalid_original_cmpc_approval")
    if not isinstance(evidence,dict) or evidence.get("fuente")!="CMPC Cornerstone" or evidence.get("state")!="individual_links_found":
        raise ValueError("official_browser_evidence_unavailable")
    age=now-_time(evidence.get("checked_at"))
    if not timedelta(0)<=age<=timedelta(hours=25):
        raise ValueError("stale_official_browser_evidence")
    details=evidence.get("individual_details")
    if not isinstance(details,list):
        raise ValueError("official_individual_details_missing")
    by_url={str(x.get("url")):x for x in details if isinstance(x,dict)}
    offers=approved.get("offers")
    if not isinstance(offers,list) or not 1<=len(offers)<=15:
        raise ValueError("invalid_cmpc_batch_size")
    if index.get("schema_version")!=1 or not isinstance(index.get("seen_offer_ids"),list):
        raise ValueError("invalid_live_bridge_index")
    seen=set(index["seen_offer_ids"])
    new=[]; within=set()
    for item in offers:
        if not isinstance(item,dict):
            raise ValueError("invalid_cmpc_offer")
        url=item.get("url_original")
        match=CMPC_URL.fullmatch(str(url))
        if not match or item.get("id_fuente")!="cmpc_"+match.group(1) or item.get("empresa")!="CMPC":
            raise ValueError("cmpc_identity_mismatch")
        if url in within:
            raise ValueError("duplicated_cmpc_source_url")
        within.add(url)
        card=by_url.get(url)
        if not card or not card.get("ficha_accessible") or not isinstance(card.get("ficha_excerpt"),str) or len(card["ficha_excerpt"])<170:
            raise ValueError("cmpc_offer_not_currently_accessible")
        card_age=now-_time(card.get("ficha_checked_at"))
        if not timedelta(0)<=card_age<=timedelta(hours=25):
            raise ValueError("stale_cmpc_individual_page")
        if item["cargo"].strip()!=str(card.get("cargo","")).strip() or not item.get("comunas") or any(t not in LOCAL for t in item["comunas"]):
            raise ValueError("cmpc_title_or_workplace_changed")
        # Never use a header's date, Git commit date or discovery time
        # as a substitute for the original posting date from the employer.
        from prepare_motor_d_batch import primary_date,locale
        if primary_date(str(card.get("evidencia_tarjeta","")))!=item.get("fecha_publicacion"):
            raise ValueError("cmpc_original_date_unconfirmed")
        card_places=locale(str(card.get("evidencia_tarjeta","")))
        if card_places and card_places!=item["comunas"]:
            raise ValueError("cmpc_workplace_differs_from_official_card")
        if "postulaciones cerradas" in card["ficha_excerpt"].lower() or "posting closed" in card["ficha_excerpt"].lower():
            raise ValueError("cmpc_source_closed")
        ident="d_"+hashlib.sha256(("cmpc_requisition:"+match.group(1)).encode()).hexdigest()[:20]
        if ident in seen:
            continue
        new.append({
            "id_fuente":ident,
            "cargo":item["cargo"],"empresa":"CMPC",
            "comunas":item["comunas"],
            "url_original":url,
            "fecha_publicacion":item["fecha_publicacion"],
            "fecha_descubrimiento":now.date().isoformat(),
            "fecha_cierre":item.get("fecha_cierre"),
            "justificacion":"Descubierta por lector oficial CMPC Cornerstone; ficha, comuna y fecha original cotejadas en navegación real. Procedencia: motor_d_cmpc_browser, no ChatGPT manual.",
        })
    if not new:
        return None
    payload={"schema_version":1,"approval":"approved_for_publication",
             "producer":"motor_d_territorial","batch_type":"recovery",
             "offers":new}
    return stage_reviewed_batch(payload,index,day=now.strftime("%Y%m%d"))


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--approved",type=Path,default=Path("automation/motor_d_approved.json"))
    p.add_argument("--browser",type=Path,default=Path("automation/motor_d_discovery/cmpc_discovery.json"))
    p.add_argument("--root",type=Path,default=Path("automation/motor_d_ready"))
    args=p.parse_args()
    approved=json.loads(args.approved.read_text(encoding="utf-8")) if args.approved.exists() else None
    if approved is None:
        print(json.dumps({"state":"no_current_official_approvals","ready_batch":0},ensure_ascii=False))
        return
    evidence=json.loads(args.browser.read_text(encoding="utf-8"))
    indexpath=args.root/"index.json"
    index=json.loads(indexpath.read_text(encoding="utf-8"))
    result=build(approved,evidence,index)
    if result is None:
        print(json.dumps({"state":"already_indexed","ready_batch":0},ensure_ascii=False))
        return
    relative,batch,updated=result
    dest=args.root/relative
    if dest.exists():
        raise ValueError("ready_batch_path_already_exists")
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(batch,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    indexpath.write_text(json.dumps(updated,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"state":"staged_for_real_appdeploy_bridge","batch_id":batch["batch_id"],
                      "ready_batch":len(batch["offers"]),"requires_publication_confirmation":True},
                     ensure_ascii=False))


if __name__=="__main__":
    main()
