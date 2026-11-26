#!/usr/bin/env python3
"""Read-only ChatGPT coverage auditor. Never treats attempts as successful reads."""
import argparse
import datetime as dt
import json
import pathlib
import sys
from zoneinfo import ZoneInfo

STATES = {"checked_found", "checked_empty", "blocked", "failed", "unsupported", "not_attempted"}
READ = {"checked_found", "checked_empty"}
COMMUNES = {"Angol", "Collipulli", "Ercilla", "Lumaco", "Los Sauces", "Purén", "Renaico", "Traiguén", "Victoria", "Mulchén", "Negrete", "Nacimiento"}

def audit(inventory, coverage):
    sources = inventory.get("sources", [])
    targets = inventory.get("discovery_targets", [])
    if len(sources) != inventory.get("count") or len({s.get("key") for s in sources}) != len(sources):
        raise ValueError("inventory_count_or_duplicate_key")
    discovery_keys = {t.get("key") for t in targets}
    if len(discovery_keys) != len(targets):
        raise ValueError("duplicate_discovery_target")
    if discovery_keys & {s.get("key") for s in sources}:
        raise ValueError("duplicate_source_and_discovery_key")
    if set(inventory.get("target_communes", [])) != COMMUNES:
        raise ValueError("inventory_communes_mismatch")
    expected = {s["key"]: s for s in sources}
    observed = {}
    invalid = []
    waves = coverage.get("waves") or {}
    wave_rows = [
        {"source_id": item.get("key"), "scan_wave": int(wave),
         "checked_at": item.get("checked_at") or data.get("heartbeat_at"),
         **item}
        for wave, data in waves.items()
        if wave in {"0", "1", "2", "3", "4", "5"} and isinstance(data, dict)
        for item in data.get("results", []) if isinstance(item, dict)
    ]
    for row in [*wave_rows, *coverage.get("sources", [])]:
        key = row.get("source_id")
        if key not in expected or row.get("status") not in STATES:
            invalid.append(key)
            continue
        if row.get("scan_wave") != expected[key].get("scan_wave"):
            invalid.append(key)
            continue
        # A source can be retried; use the latest timestamp rather than double-counting.
        if key in observed and row["status"] == "not_attempted" and observed[key]["status"] != "not_attempted":
            continue
        if key not in observed or observed[key]["status"] == "not_attempted" or str(row.get("checked_at", "")) >= str(observed[key].get("checked_at", "")):
            observed[key] = row
    counts = {state: 0 for state in STATES}
    by_wave = {}
    for wave in range(6):
        planned = [s for s in sources if s.get("scan_wave") == wave]
        rows = [observed[s["key"]] for s in planned if s["key"] in observed]
        counts_wave = {state: sum(r["status"] == state for r in rows) for state in STATES}
        for state, count in counts_wave.items():
            counts[state] += count
        by_wave[str(wave)] = {
            "planned": len(planned), "recorded": len(rows),
            "attempted": sum(r["status"] != "not_attempted" for r in rows),
            "effective_reads": sum(r["status"] in READ for r in rows),
            "blocked": counts_wave["blocked"], "failed": counts_wave["failed"],
            "unsupported": counts_wave["unsupported"],
            "missing": [s["key"] for s in planned if s["key"] not in observed],
        }
    discovery_rows = coverage.get("discovery") or coverage.get("discovery_targets") or []
    discovered = {}
    for row in discovery_rows:
        key = row.get("source_id") or row.get("key")
        if key == "bne" and "bne-indexed-discovery" in discovery_keys:
            key = "bne-indexed-discovery"
        # A discovery target can be revisited in another wave; use the latest
        # evidence instead of treating repeated rows as additional coverage.
        if key not in discovered or str(row.get("checked_at", "")) >= str(discovered[key].get("checked_at", "")):
            discovered[key] = row
    target_missing = [t["key"] for t in targets if t["key"] not in discovered]
    target_pending = [t["key"] for t in targets if discovered.get(t["key"], {}).get("status") in (None, "not_attempted")]
    invalid_discovery = [key for key, row in discovered.items() if key not in {t["key"] for t in targets} or row.get("status") not in STATES]
    report = {
        "inventory_endpoints": len(sources), "discovery_targets": len(targets),
        "recorded_sources": len(observed), "effective_reads": sum(counts[x] for x in READ),
        "attempted": sum(counts[x] for x in STATES if x != "not_attempted"),
        "status_counts": counts, "waves": by_wave,
        "discovery_missing": target_missing, "discovery_pending": target_pending,
        "discovery_records_total": len(discovery_rows),
        "discovery_recorded_unique": sum(key in discovered for key in (t["key"] for t in targets)),
        "discovery_retry_rows": len(discovery_rows)-len(discovered),
        "invalid_source_records": invalid,
        "invalid_discovery_records": invalid_discovery,
        "retry_candidates": [{"source_id": s["key"], "scan_wave": s["scan_wave"], "url": s.get("url"), "last_status": observed[s["key"]]["status"], "reason": observed[s["key"]].get("reason", ""), "recovery_strategy": "indexed_search_or_official_source" if observed[s["key"]]["status"] in ("blocked", "unsupported") else "bounded_retry_then_alternative"} for s in sources if s["key"] in observed and observed[s["key"]]["status"] in ("blocked", "failed", "unsupported")],
        "daily_attempt_coverage_complete": len(observed) == len(sources) and counts["not_attempted"] == 0 and not invalid and not invalid_discovery and not target_missing and not target_pending,
        "daily_effective_coverage_complete": len(observed) == len(sources) and not invalid and not invalid_discovery and not target_missing and not target_pending and all(r["status"] in READ for r in observed.values()) and all(discovered[t["key"]]["status"] in READ for t in targets),
        "publication_confirmed": coverage.get("publication_confirmed", 0),
        "note": "No percentage threshold blocks verified offers. Blocked/failed/unsupported are attempts, not successful reads.",
    }
    return report

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--inventory", default="automation/chatgpt_source_inventory_v1.json")
    p.add_argument("--coverage", required=True)
    p.add_argument("--chile-date", default=dt.datetime.now(ZoneInfo("America/Santiago")).date().isoformat())
    p.add_argument("--output", default="")
    p.add_argument("--require-complete-attempts", action="store_true",
                   help="At the end-of-day gate, fail unless every inventory endpoint and discovery target has an attempted result.")
    args = p.parse_args()
    inventory = json.loads(pathlib.Path(args.inventory).read_text(encoding="utf-8"))
    coverage = json.loads(pathlib.Path(args.coverage).read_text(encoding="utf-8"))
    report = audit(inventory, coverage)
    report["audit_chile_date"] = args.chile_date
    report["coverage_date"] = coverage.get("date")
    report["coverage_date_matches_chile"] = coverage.get("date") == args.chile_date
    report["latest_record_at"] = max((str(r.get("checked_at", "")) for r in coverage.get("sources", [])), default="")
    output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        pathlib.Path(args.output).write_text(output, encoding="utf-8")
    print(output)
    if report["invalid_source_records"] or report["invalid_discovery_records"]:
        sys.exit(2)
    if args.require_complete_attempts and (
        not report["daily_attempt_coverage_complete"] or not report["coverage_date_matches_chile"]
    ):
        print("COVERAGE_INCOMPLETE_END_OF_DAY: source/discovery attempts missing", file=sys.stderr)
        sys.exit(3)

if __name__ == "__main__":
    main()
