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
    if len({t.get("key") for t in targets}) != len(targets):
        raise ValueError("duplicate_discovery_target")
    if set(inventory.get("target_communes", [])) != COMMUNES:
        raise ValueError("inventory_communes_mismatch")
    expected = {s["key"]: s for s in sources}
    observed = {}
    invalid = []
    for row in coverage.get("sources", []):
        key = row.get("source_id")
        if key not in expected or row.get("status") not in STATES:
            invalid.append(key)
            continue
        if row.get("scan_wave") != expected[key].get("scan_wave"):
            invalid.append(key)
            continue
        # A source can be retried; use the latest timestamp rather than double-counting.
        if key not in observed or str(row.get("checked_at", "")) >= str(observed[key].get("checked_at", "")):
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
    discovered = {r.get("source_id"): r for r in coverage.get("discovery", [])}
    target_missing = [t["key"] for t in targets if t["key"] not in discovered]
    target_pending = [t["key"] for t in targets if discovered.get(t["key"], {}).get("status") in (None, "not_attempted")]
    report = {
        "inventory_endpoints": len(sources), "discovery_targets": len(targets),
        "recorded_sources": len(observed), "effective_reads": sum(counts[x] for x in READ),
        "attempted": sum(counts[x] for x in STATES if x != "not_attempted"),
        "status_counts": counts, "waves": by_wave,
        "discovery_missing": target_missing, "discovery_pending": target_pending,
        "invalid_source_records": invalid,
        "daily_attempt_coverage_complete": len(observed) == len(sources) and not invalid and not target_missing and not target_pending,
        "daily_effective_coverage_complete": len(observed) == len(sources) and all(r["status"] in READ for r in observed.values()) and not target_missing and not target_pending,
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
    if report["invalid_source_records"]:
        sys.exit(2)

if __name__ == "__main__":
    main()
