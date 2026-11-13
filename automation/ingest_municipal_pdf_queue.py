"""Consume the PDF closeout queue into the existing trusted-review inbox.

`qa_municipal_pdf_closeout.py` already emits review-only cases, but its JSON
was uploaded as an artifact with no consumer.  This adapter makes the handoff
durable and idempotent: cases enter `radar_ocr_pending.json` as pending, and
`revisar_ocr.py` remains the only component that can approve them.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import tempfile
from pathlib import Path


def _id(url: str) -> str:
    return "pdf_" + hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]


def _item(row: dict, today: str) -> dict:
    url = str(row.get("url") or "").strip()
    if not url.startswith("https://"):
        raise ValueError("invalid_pdf_url")
    item = {
        "review_id": _id(url),
        "canonical_url": url,
        "url": url,
        "source": str(row.get("source") or "Municipal PDF"),
        "origin": "qa_municipal_pdf_closeout",
        "reported_territories": [str(row.get("commune") or "")],
        "reader_status": str(row.get("status") or "pending_document_review"),
        "review_reason": "municipal_pdf_requires_human_evidence_review",
        "document_sha256": row.get("sha256"),
        "date_source": None,
        "date_discovered": today,
        "publication_date_confirmed": False,
        "work_location_verified": False,
        "employer_verified": False,
        "application_route_verified": False,
        "publication_eligible": False,
        "review_status": "pending",
        "review_signature": None,
        "first_discovered": today,
        "last_seen": today,
    }
    return item


def merge(existing: dict, rows: list[dict], today: str | None = None) -> dict:
    """Upsert only pending cases; never overwrite an approved/rejected signature."""
    today = today or dt.datetime.now(dt.timezone.utc).date().isoformat()
    if not isinstance(existing, dict) or not isinstance(existing.get("items"), list):
        raise ValueError("invalid_review_queue")
    by_id = {str(item.get("review_id")): item for item in existing["items"] if isinstance(item, dict)}
    # Reuse an existing OCR review for the same document URL, even if it has
    # an older ocr_* ID rather than this adapter's pdf_* ID.
    by_url = {str(item.get("canonical_url") or item.get("url") or "").strip(): str(item.get("review_id"))
              for item in existing["items"] if isinstance(item, dict)}
    added = 0
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("invalid_review_queue_row")
        item = _item(row, today)
        previous_key = item["review_id"] if item["review_id"] in by_id else by_url.get(url := item["url"])
        previous = by_id.get(previous_key) if previous_key else None
        if previous and previous.get("review_status") in ("approved", "rejected"):
            continue
        if previous:
            # Preserve partial human annotations, reviewer flags, and original
            # source fields. Only refresh last_seen; never replace an existing
            # review identity with a second one for the same document.
            item = {**item, **previous, "last_seen": today}
        else:
            added += 1
        by_id[item["review_id"]] = item
        by_url[url] = item["review_id"]
    items = sorted(by_id.values(), key=lambda item: (str(item.get("first_discovered") or ""), str(item.get("review_id") or "")))
    return {
        **existing,
        # Keep the existing trusted-review schema and unrelated metadata.
        "schema": existing.get("schema") or "trabajo-cerca.motor-d-review.v1",
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "items_total": len(items),
        "pending_total": sum(item.get("review_status") == "pending" for item in items),
        "publication_enabled": False,
        "added_this_run": added,
        "items": items,
    }


def write_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent,
                                         prefix=".review_queue_", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--queue", type=Path,
                        default=Path("automation/motor_d_review/radar_ocr_pending.json"))
    args = parser.parse_args()
    source = json.loads(args.input.read_text(encoding="utf-8"))
    rows = source.get("items") if isinstance(source, dict) else source
    if not isinstance(rows, list):
        raise ValueError("invalid_pdf_review_payload")
    existing = json.loads(args.queue.read_text(encoding="utf-8")) if args.queue.exists() else {
        "schema": "trabajo-cerca.review-queue.v1", "items": []}
    merged = merge(existing, rows)
    write_atomic(args.queue, merged)
    print(json.dumps({key: merged[key] for key in
                      ("items_total", "pending_total", "added_this_run", "publication_enabled")},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())