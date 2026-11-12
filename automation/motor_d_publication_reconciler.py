"""Reconcile GitHub Motor D batches against the LIVE AppDeploy public catalog.

Only a complete, non-rebuilding public feed may confirm presence or absence.
This job NEVER imports, republishes, deletes or changes historical batch files.
Internal AppDeploy receipts are a separate stronger assertion; matching a
public item is described precisely as "visible by source identity".
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
from time import sleep

from motor_d_catalog_probe import check_ready_offers, read_full_feed

ROOT = Path(__file__).resolve().parent / "motor_d_ready"
BATCH_PATH = re.compile(r"^\d{8}/motor-d-\d{8}-[0-9a-f]{18}\.json$")
ACTIVE = {"already_published_source_identity"}
SEMANTIC = {"already_published_semantic"}


def load_batch(root, entry):
    name = entry.get("file")
    if not isinstance(name, str) or not BATCH_PATH.fullmatch(name):
        raise ValueError("unsafe_batch_path")
    path = root / name
    data = json.loads(path.read_text(encoding="utf-8"))
    if (data.get("schema_version") != 1 or
            data.get("batch_id") != entry.get("batch_id") or
            data.get("approval") != "approved_for_publication" or
            not isinstance(data.get("offers"), list)):
        raise ValueError("invalid_batch_schema")
    return data["offers"]


def reconcile(index, history, rows, load_offers, checked_at=None):
    """Pure reconciliation; leave snapshots and prior source files untouched."""
    if not isinstance(index, dict) or index.get("schema_version") != 1:
        raise ValueError("invalid_batch_index")
    batches = index.get("batches")
    if not isinstance(batches, list) or len(batches) > 256:
        raise ValueError("invalid_batch_list")
    if not isinstance(rows, list) or not all(isinstance(x, dict) for x in rows):
        raise ValueError("complete_public_feed_required")
    if not isinstance(history, dict) or not isinstance(history.get("items", []), list):
        raise ValueError("invalid_history")
    stamp = checked_at or datetime.now(timezone.utc).isoformat()
    quarantined = {x.get("batch_id") for x in index.get("quarantined_batches", [])
                   if isinstance(x, dict)}
    offers = {}
    batch_entries = []
    original_missing = {}
    for old in history.get("items", []):
        if isinstance(old, dict) and old.get("id_fuente") and old.get("url_original"):
            original_missing[old["id_fuente"]] = old
    for b in batches:
        b_id = b.get("batch_id")
        if not isinstance(b_id, str):
            raise ValueError("invalid_batch_id")
        batch_offers = load_offers(b)
        entry = {"batch_id": b_id, "historically_quarantined": b_id in quarantined,
                 "offer_count": len(batch_offers), "source_confirmed": 0,
                 "semantic_only": 0, "not_found": 0}
        for item in batch_offers:
            if not isinstance(item, dict) or not all(item.get(k) for k in
                ("id_fuente", "url_original", "cargo", "empresa", "comunas")):
                raise ValueError("invalid_batch_offer")
            identifier = str(item["id_fuente"])
            if b_id in quarantined:
                # Do not revive old quarantined offers, even if their URL appears.
                continue
            # A later non-quarantined batch supersedes any earlier batch with the
            # same stable source id. Preserve which batch last asserted it.
            offers[identifier] = {**item, "_batch_id": b_id}
        batch_entries.append(entry)
    candidate_list = list(offers.values())
    statuses = check_ready_offers(candidate_list, rows, True)
    for item in candidate_list:
        status = statuses.get(item["id_fuente"], "catalog_status_unavailable")
        batch = next(x for x in reversed(batch_entries) if x["batch_id"] == item["_batch_id"])
        key = "source_confirmed" if status in ACTIVE else (
            "semantic_only" if status in SEMANTIC else "not_found")
        batch[key] += 1
    legacy_pending, resolved, legacy_semantic_only = [], [], []
    if original_missing:
        pending_status = check_ready_offers(list(original_missing.values()), rows, True)
        for identifier, old in original_missing.items():
            status = pending_status.get(identifier)
            record = dict(old)
            if status in ACTIVE:
                resolved.append({
                    "id_fuente": identifier, "url_original": old["url_original"],
                    "status": "confirmed_visible_in_live_feed_by_source",
                    "checked_at": stamp, "prior_batch_ids": old.get("prior_batch_ids", [])
                })
            elif status in SEMANTIC:
                record["catalog_status"] = "semantic_only_requires_source_or_receipt"
                legacy_pending.append(record)
                legacy_semantic_only.append(identifier)
            else:
                record["catalog_status"] = "not_found_in_complete_feed"
                legacy_pending.append(record)
    counters = Counter(statuses.values())
    unresolved = [
        {"id_fuente": x["id_fuente"], "url_original": x["url_original"],
         "batch_id": x["_batch_id"], "status": statuses.get(x["id_fuente"])}
        for x in candidate_list if statuses.get(x["id_fuente"]) not in ACTIVE
    ]
    confirmation = {
        "schema_version": 1, "source": "complete_appdeploy_public_feed",
        "scope": "url_or_stable_job_id_checked; no_private_receipt_claim",
        "checked_at": stamp, "feed_complete": True, "feed_rows": len(rows),
        "indexed_batches": len(batches), "quarantined_batches": len(quarantined),
        "distinct_nonquarantined_offers": len(candidate_list),
        "source_confirmed": counters["already_published_source_identity"],
        "semantic_only": counters["already_published_semantic"],
        "not_found": counters["not_found_in_complete_feed"],
        "latest_batch": batch_entries[-1] if batch_entries else None,
        "batches": batch_entries,
        "unresolved_active_batches": unresolved,
        "previously_flagged_resolved": len(resolved),
        "previously_flagged_still_pending": len(legacy_pending),
        "prior_pending_resolution": resolved,
    }
    updated = {
        "schema_version": 1,
        "scan_date": history.get("scan_date"),
        "checked_at": stamp, "feed_complete": True,
        "feed_rows": len(rows),
        "state": "clear" if not legacy_pending else "needs_receipt_review",
        "historical_missing_from_catalog": len(legacy_pending),
        "released_from_quarantine": history.get("released_from_quarantine", 0),
        "released_items": history.get("released_items", []),
        "items": legacy_pending,
        "resolved_published_items": resolved,
        "confirmation_file": "publication_confirmation.json",
        "semantic_only_requires_receipt": legacy_semantic_only
    }
    return confirmation, updated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Read real public feed; emit QA preview only")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    root = args.root
    index = json.loads((root / "index.json").read_text(encoding="utf-8"))
    previous_path = root / "publication_reconciliation.json"
    history = json.loads(previous_path.read_text(encoding="utf-8")) if previous_path.exists() else {"items":[]}
    rows, complete, error = [], False, "not_checked"
    for attempt in range(3):
        rows, complete, error = read_full_feed(max_pages=30)
        if complete:
            break
        if attempt < 2:
            sleep(2 * (attempt + 1))
    if not complete:
        # Never turn an HTTP 403/timeout or partial feed into missing job claims.
        print("PUBLICATION_RECONCILIATION_BLOCKED " +
              json.dumps({"state":"blocked_catalog_incomplete","error":error,
                          "wrote_snapshots":False}, ensure_ascii=False), flush=True)
        return 2
    latest, updated = reconcile(index, history, rows,
                                lambda b: load_batch(root, b))
    record = {"state":updated["state"],
              "source_confirmed": latest["source_confirmed"],
              "semantic_only": latest["semantic_only"],
              "not_found": latest["not_found"],
              "prior_missing_resolved": latest["previously_flagged_resolved"],
              "prior_missing_remaining": latest["previously_flagged_still_pending"],
              "latest_batch": latest["latest_batch"],
              "feed_rows": latest["feed_rows"],
              "committed_to_github":not args.dry_run}
    print("MOTOR_D_PUBLICATION_RECONCILED " +
          json.dumps(record, ensure_ascii=False), flush=True)
    if args.dry_run:
        path = Path("output/publication_reconciliation_live_preview.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"confirmation":latest,"reconciliation":updated},
                       ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    else:
        # GitHub Actions records are versioned alongside the source manifest.
        from motor_d_express import atomic_json_write
        atomic_json_write(root / "publication_confirmation.json",latest)
        atomic_json_write(previous_path,updated)
    return 0


if __name__ == "__main__":
    sys.exit(main())
