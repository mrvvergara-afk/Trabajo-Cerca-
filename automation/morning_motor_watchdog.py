"""Morning health/watchdog for Motor A and Motor D in America/Santiago.

Never equate source *attempts* with useful source coverage. This checker
detects missed scheduled runs, missing communes and stalled handoff, and
reports known blocked/unreadable sources separately from workflow liveness.
"""
import argparse
from datetime import datetime, time, timezone
import json
from pathlib import Path
from zoneinfo import ZoneInfo

BASE = Path(__file__).resolve().parent
SANTIAGO = ZoneInfo("America/Santiago")
TOWNS = {
    "Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén",
    "Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento"
}


def parse_stamp(value):
    if not isinstance(value,str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z","+00:00"))
        return dt if dt.tzinfo else None
    except ValueError:
        return None


def after_morning_start(value, current):
    dt = parse_stamp(value)
    if not dt:
        return False
    local = dt.astimezone(SANTIAGO)
    return (local.date()==current.astimezone(SANTIAGO).date() and
            local.time().replace(tzinfo=None) >= time(hour=5))


def assess(d, a, coverage, public, current):
    if current.tzinfo is None:
        raise ValueError("watchdog_clock_requires_timezone")
    failures, degraded, notes = [], [], []
    d_heartbeat = d if isinstance(d,dict) else {}
    a_checkpoint = a if isinstance(a,dict) else {}
    a_coverage = coverage if isinstance(coverage,dict) else {}
    p = public if isinstance(public,dict) else {}

    d_fresh = after_morning_start(d_heartbeat.get("scan_completed_at"),current)
    if not d_fresh:
        failures.append("D_NO_MORNING_HEARTBEAT")
    if set(d_heartbeat.get("communes_expected",[])) != TOWNS or d_heartbeat.get("missing_communes"):
        failures.append("D_MISSING_OR_MISCONFIGURED_COMMUNES")
    d_total = d_heartbeat.get("sources_total",0)
    d_registered = d_heartbeat.get("source_inventory_registered",0)
    # Registry contains 27 separately registered social sources that remain
    # non-readable without authorized adapters. Do not claim their coverage.
    if (not isinstance(d_total,int) or d_total<175 or
            not isinstance(d_registered,int) or d_registered < 202):
        failures.append("D_SOURCE_ROSTER_INCOMPLETE")
    if not isinstance(d_heartbeat.get("sources_accessible"),int) or d_heartbeat["sources_accessible"]<1:
        failures.append("D_NO_USEFUL_READS")
    if d_heartbeat.get("full_usable_coverage") is not True:
        degraded.append("D_FULL_USABLE_COVERAGE_NOT_ACREDITED")
    pending = d_heartbeat.get("source_inventory_pending")
    if isinstance(pending,int) and pending>0:
        notes.append(f"D_UNRESOLVED_SOURCES:{pending}")
    blocked=d_heartbeat.get("sources_blocked")
    if isinstance(blocked,int) and blocked:
        notes.append(f"D_BLOCKED_SOURCES:{blocked}")

    a_fresh = after_morning_start(a_checkpoint.get("checked_at"),current)
    if not a_fresh:
        failures.append("A_NO_MORNING_CHECKPOINT")
    coverage_fresh=after_morning_start(a_coverage.get("checked_at"),current)
    if not coverage_fresh:
        failures.append("A_NO_MORNING_SOURCE_AUDIT")
    if set(a_coverage.get("municipalities_attempted",[])) != TOWNS:
        failures.append("A_DID_NOT_ATTEMPT_ALL_12_MUNICIPALITIES")
    if a_coverage.get("municipalities_missing"):
        failures.append("A_MISSING_MUNICIPALITIES")
    sources=a_coverage.get("local_sources_attempted")
    queries=a_coverage.get("chiletrabajos_queries_attempted")
    if not isinstance(sources,int) or sources<17 or not isinstance(queries,int) or queries<15:
        failures.append("A_SOURCE_OR_COMMUNE_QUERY_ROSTER_INCOMPLETE")
    if not isinstance(a_coverage.get("job_details_checked"),int) or a_coverage["job_details_checked"]<1:
        failures.append("A_NO_INDIVIDUAL_JOB_DETAILS_CHECKED")
    unreadable=a_coverage.get("municipalities_unreadable",[])
    if unreadable:
        degraded.append("A_MUNICIPAL_SOURCES_UNREADABLE")
        notes.append("A_UNREADABLE_MUNICIPALITIES:"+",".join(unreadable))
    if a_coverage.get("coverage_complete") is not True:
        degraded.append("A_FULL_USEFUL_COVERAGE_NOT_ACREDITED")
    if a_coverage.get("source_failures"):
        notes.append(f"A_SOURCE_ERRORS_OR_PARTIAL:{len(a_coverage['source_failures'])}")
    if not after_morning_start(p.get("checked_at"),current) or p.get("feed_complete") is not True:
        degraded.append("PUBLICATION_RECONCILIATION_NOT_FRESH")
    elif p.get("not_found",0):
        degraded.append("PUBLICATION_FEED_HAS_UNCONFIRMED_OFFERS")
        notes.append(f"UNCONFIRMED_PUBLIC_OFFER_IDS:{p['not_found']}")

    def unique(items): return list(dict.fromkeys(items))
    failures,degraded,notes=unique(failures),unique(degraded),unique(notes)
    status="FAILED" if failures else "DEGRADED" if degraded else "HEALTHY"
    return {
        "schema_version":1, "checked_at":current.isoformat(),
        "local_day":str(current.astimezone(SANTIAGO).date()),
        "status":status,"execution_failures":failures,
        "known_coverage_gaps":degraded,"notes":notes,
        "a":{"checkpoint_fresh":a_fresh,"source_audit_fresh":coverage_fresh,
            "municipalities_attempted":len(set(a_coverage.get("municipalities_attempted",[]))&TOWNS),
            "municipalities_readable":len(set(a_coverage.get("municipalities_readable",[]))&TOWNS),
            "sources_attempted":sources,"chiletrabajos_queries":queries,
            "details_checked":a_coverage.get("job_details_checked"),
            "review_ready":a_coverage.get("ready_for_d_review")},
        "d":{"heartbeat_fresh":d_fresh,"communes_expected":len(set(d_heartbeat.get("communes_expected",[]))&TOWNS),
            "missing_communes":d_heartbeat.get("missing_communes"),"sources_attempted":d_total,
            "sources_registered":d_registered,"sources_readable":d_heartbeat.get("sources_accessible"),
            "sources_blocked":blocked,"source_coverage_pending":pending,
            "candidates":d_heartbeat.get("job_candidates_total")},
        "public":{"reconciliation_fresh":after_morning_start(p.get("checked_at"),current),
                  "feed_complete":p.get("feed_complete"),
                  "confirmed_offers":p.get("source_confirmed"),
                  "unconfirmed_offers":p.get("not_found")}
    }


def load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (ValueError,OSError):
        return {}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--output",type=Path,default=Path("output/morning_guard.json"))
    args=ap.parse_args()
    report=assess(
        load(BASE/"motor_d_discovery/producer_heartbeat.json"),
        load(BASE/"motor_a_review/state.json"),
        load(BASE/"motor_a_review/source_coverage.json"),
        load(BASE/"motor_d_ready/publication_confirmation.json"),
        datetime.now(timezone.utc))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("MOTOR_A_D_MORNING_GUARD "+json.dumps(report,ensure_ascii=False),flush=True)
    return 0


if __name__=="__main__":
    raise SystemExit(main())
