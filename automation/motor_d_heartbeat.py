"""Compact evidence of a complete Motor D scan; never proof of job publication."""
import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path

COMMUNES = ("Angol", "Collipulli", "Ercilla", "Lumaco", "Los Sauces", "Purén",
            "Renaico", "Traiguén", "Victoria", "Mulchén", "Negrete", "Nacimiento")


def project(report, raw_sha256):
    if not isinstance(report, dict):
        raise ValueError("invalid_report")
    try:
        scanned = datetime.fromisoformat(report.get("date"))
    except (ValueError, TypeError):
        raise ValueError("invalid_scan_timestamp")
    if scanned.tzinfo is None or scanned.utcoffset() is None:
        raise ValueError("scan_timestamp_missing_timezone")
    expected = report.get("communes_expected")
    if not isinstance(expected, list) or len(expected) != 12 or set(expected) != set(COMMUNES):
        raise ValueError("invalid_scan_territory")
    if report.get("missing_communes") != []:
        raise ValueError("incomplete_territorial_scan")
    counts = {}
    for key in ("sources_total", "sources_accessible", "sources_blocked",
                "job_candidates_total", "express_ready_candidates"):
        value = report.get(key)
        if type(value) is not int or value < 0:
            raise ValueError("invalid_" + key)
        counts[key] = value
    if counts["sources_total"] < 1 or counts["sources_accessible"] < 1:
        raise ValueError("no_public_source_accessible")
    if counts["sources_accessible"] + counts["sources_blocked"] > counts["sources_total"]:
        raise ValueError("inconsistent_source_counts")
    if not isinstance(raw_sha256, str) or len(raw_sha256) != 64:
        raise ValueError("invalid_source_hash")
    return {
        "schema_version": 1,
        "producer": "motor_d_territorial",
        "scan_completed_at": scanned.isoformat(),
        "communes_expected": list(COMMUNES),
        "missing_communes": [],
        **counts,
        "source_report_sha256": raw_sha256,
        "published_in_trabajo_cerca": 0,
        "publication_confirmed": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source_report", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    raw = args.source_report.read_bytes()
    payload = project(json.loads(raw), hashlib.sha256(raw).hexdigest())
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.destination.with_suffix(args.destination.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.destination)
    print(json.dumps({"producer": payload["producer"], "scan_completed_at": payload["scan_completed_at"],
                      "sources_accessible": payload["sources_accessible"],
                      "offers_published": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
