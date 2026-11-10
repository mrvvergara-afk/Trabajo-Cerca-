"""Live, read-only quality gate for the 12 Chiletrabajos municipality searches.

A keyword fallback is not a geographic index. This QA never inserts offers,
never approves missing evidence and never treats HTTP blockers as zero jobs.
"""
import json
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from motor_d_territorial_daily import COMMUNES, SEEDS, TZ, inspect
from motor_d_catalog_probe import check_ready_offers, read_full_feed
from motor_d_express import classify


def run():
    seeds=[seed for seed in SEEDS if seed[1]=="Chiletrabajos · "+seed[0]]
    assert len(seeds)==len(COMMUNES)==12
    with ThreadPoolExecutor(max_workers=3) as pool:
        rows=list(pool.map(inspect,seeds))
    today=datetime.now(TZ).date()
    candidates=[]
    blocked=[]
    for row in rows:
        for item in row["candidates"]:
            if row.get("index_scope_confirmed") is False:
                if item.get("work_commune")!=row["commune"]:
                    raise ValueError("national_fallback_leaked_other_commune")
                if (item.get("source_commune_not_confirmed") is False
                    and item.get("explicit_worksite_commune")!=row["commune"]):
                    raise ValueError("national_fallback_approved_unsupported_worksite")
            outcome, reason, offer=classify(item,today)
            if offer:
                candidates.append(offer)
            item["qa_classification"]=outcome
            item["qa_reason"]=reason
        if not row["status"].startswith("scanned"):
            blocked.append({"commune":row["commune"],"status":row["status"],
                            "fallback_http":row.get("fallback_http")})
    catalog,complete,error=read_full_feed(max_pages=80)
    matched=check_ready_offers(candidates,catalog,complete)
    public_counts=dict(sorted(Counter(matched.values()).items()))
    # The same genuine job may be rediscovered via two distinct city searches.
    # Dict-based catalog matching counts each source ID once; preserve that
    # denominator explicitly rather than calling every record a unique job.
    unique_ready_ids={x["id_fuente"] for x in candidates}
    compact=[]
    for row in rows:
        compact.append({
            "commune":row["commune"],"status":row["status"],"http":row["http"],
            "index_scope_confirmed":row.get("index_scope_confirmed"),
            "fallback_url":row.get("fallback_url"),
            "fallback_query_is_territorially_scoped":row.get(
                "fallback_query_is_territorially_scoped"),
            "fallback_http":row.get("fallback_http"),
            "fallback_error":row.get("fallback_error"),
            "links_found":row["links_found"],
            "fallback_details_seen":row.get("fallback_details_seen",0),
            "fallback_rejected_nonlocal_or_unknown":row.get(
                "fallback_rejected_nonlocal_or_unknown",0),
            "fallback_pending_worksite_confirmation":row.get(
                "fallback_pending_worksite_confirmation",0),
            "candidate_count":len(row["candidates"]),
            "candidates":[{"url":x.get("url"),"title":x.get("title"),
                           "work_commune":x.get("work_commune"),
                           "worksite_confirmed":not x.get("source_commune_not_confirmed",True),
                           "state":x.get("qa_classification"),
                           "reason":x.get("qa_reason")} for x in row["candidates"]],
            "errors":row["errors"][:5],
        })
    result={
        "schema":"trabajo-cerca.chiletrabajos-12-communes-readonly-qa.v1",
        "checked_at":datetime.now(TZ).isoformat(),
        "territories":COMMUNES,
        "city_index_attempts":len(rows),
        "cities_with_confirmed_index":sum(r.get("index_scope_confirmed") is True for r in rows),
        "cities_which_attempted_fallback":sum(bool(r.get("fallback_url")) for r in rows),
        "cities_with_accessible_fallback":sum(r.get("fallback_http")==200 for r in rows),
        "candidate_links_not_published":sum(len(r["candidates"]) for r in rows),
        "complete_ready_candidate_records":len(candidates),
        "unique_ready_candidate_ids":len(unique_ready_ids),
        "cross_city_repeated_ready_records":len(candidates)-len(unique_ready_ids),
        "catalog_complete":bool(complete),
        "catalog_error":error,
        "catalog_rows":len(catalog) if complete else None,
        "public_catalog_classifications":public_counts,
        "blocked_or_unverified_source_attempts":blocked,
        "app_writes":0,"new_publications":0,
        "per_commune":compact,
    }
    out=Path("resultados/qa_chiletrabajos_12comunas.json")
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CHILETRABAJOS_12_COMMUNES_QA "+json.dumps({
        k:result[k] for k in (
            "city_index_attempts","cities_with_confirmed_index",
            "cities_which_attempted_fallback","cities_with_accessible_fallback",
            "candidate_links_not_published","complete_ready_candidate_records",
            "unique_ready_candidate_ids","cross_city_repeated_ready_records",
            "catalog_complete","catalog_rows","public_catalog_classifications",
            "new_publications")
    },ensure_ascii=False),flush=True)
    if not complete:
        print("CHILETRABAJOS_QA_FEED_UNAVAILABLE: do not claim jobs absent",flush=True)
        return 2
    return 0


if __name__=="__main__":
    raise SystemExit(run())
