#!/usr/bin/env python3
"""Adaptador Radar -> cola de revisión Motor D. Nunca crea lotes publicables."""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import ipaddress
import json
import re
from pathlib import Path
from urllib.parse import urlsplit, parse_qsl, urlencode

def canonical(raw: str) -> str:
    try:
        u = urlsplit(str(raw or ""))
        if u.scheme != "https" or not u.hostname or u.username or u.password or u.port:
            return ""
        host = u.hostname.lower().removeprefix("www.")
        if host == "localhost" or host.endswith((".local", ".internal")):
            return ""
        try:
            if not ipaddress.ip_address(host).is_global:
                return ""
        except ValueError:
            pass
        query = urlencode(sorted((k,v) for k,v in parse_qsl(u.query) if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}))
        return "https://" + host + (u.path.rstrip("/") or "/") + (("?" + query) if query else "")
    except (ValueError, TypeError):
        return ""

def sanitize_excerpt(value):
    from ocr_review_security import redact
    return redact(value)

def adapt(source_path: Path, review_path: Path, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    if not source_path.exists():
        raise FileNotFoundError(f"No existe entrada del radar: {source_path}")
    rows = json.loads(source_path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("candidatos_revision.json debe contener una lista")
    review_path.parent.mkdir(parents=True, exist_ok=True)
    if review_path.exists():
        saved = json.loads(review_path.read_text(encoding="utf-8"))
    else:
        saved = {"schema": "trabajo-cerca.motor-d-review.v1", "items": []}
    if not isinstance(saved, dict) or not isinstance(saved.get("items"), list):
        raise ValueError("Cola de revisión existente con formato inválido")
    items = saved["items"]
    by_url = {x.get("canonical_url"): x for x in items if isinstance(x, dict)}
    added = updated = rejected = 0
    for row in rows:
        if not isinstance(row, dict):
            rejected += 1
            continue
        url = canonical(row.get("url"))
        if not url:
            rejected += 1
            continue
        key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
        discovered = row.get("date_discovered") or today.isoformat()
        candidate = {
            "review_id": "ocr_" + key,
            "canonical_url": url,
            "url": row.get("url"),
            "source": row.get("source_id") or row.get("source") or "radar_sin_fuente",
            "origin": row.get("origin") or "radar_documental",
            "reported_territories": row.get("reported_territories") or [],
            "possible_communes": row.get("possible_communes") or [],
            "reader_status": row.get("reader_status") or row.get("status") or "revision_obligatoria",
            "review_reason": row.get("reader_status") or row.get("status") or "evidencia_documental_requiere_revision",
            "extractor": row.get("extractor"),
            "text_excerpt": None,  # Raw OCR stays outside versioned/public artifacts.
            "document_sha256": row.get("document_sha256"),
            "original_classification": row.get("original_classification"),
            "date_source": row.get("published_date_evidence"),
            "date_discovered": discovered,
            "deadline": row.get("deadline_evidence"),
            "publication_date_confirmed": row.get("publication_date_confirmed") is True,
            "work_location_verified": False,
            "employer_verified": False,
            "application_route_verified": False,
            "publication_eligible": False,
            "review_status": "pending"
        }
        if url in by_url:
            existing = by_url[url]
            first_seen = existing.get("first_discovered") or existing.get("date_discovered") or discovered
            protected_keys = {
                "review_status", "review_reason", "review_notes", "review_signature",
                "document_sha256", "vigencia_verified_at", "revalidate_after", "application_url", "approved_by", "approved_at",
                "date_source", "publication_date_confirmed",
                "rejected_by", "rejected_at", "evidence_sha256",
                "work_location_verified", "employer_verified",
                "application_route_verified", "publication_eligible",
                "title", "employer", "work_commune", "application_evidence",
                "evidence", "http", "source_commune_not_confirmed"
            }
            protected = {k: v for k, v in existing.items() if k in protected_keys}
            old_deadline = existing.get("deadline")
            changed = bool(existing.get("document_sha256") and
                           candidate.get("document_sha256") != existing.get("document_sha256"))
            changed = changed or any(candidate.get(k) and existing.get(k) and candidate[k] != existing[k]
                                     for k in ("date_source", "deadline", "extractor"))
            existing.update(candidate)
            existing.update(protected)
            if not existing.get("deadline") and old_deadline:
                existing["deadline"] = old_deadline
            if changed:
                existing.update(review_status="rejected" if protected.get("review_status") == "rejected" else "pending", publication_eligible=False,
                                work_location_verified=False, employer_verified=False,
                                application_route_verified=False, publication_date_confirmed=False,
                                review_signature=None, document_sha256=candidate.get("document_sha256"),
                                review_reason="evidencia_modificada_revalidacion_obligatoria")
            if existing.get("deadline") and existing["deadline"] < today.isoformat():
                existing.update(publication_eligible=False, review_signature=None)
            existing["first_discovered"] = first_seen
            existing["last_seen"] = today.isoformat()
            updated += 1
        else:
            candidate["first_discovered"] = discovered
            candidate["last_seen"] = today.isoformat()
            items.append(candidate)
            by_url[url] = candidate
            added += 1
    for item in items:
        item["text_excerpt"] = None
        try:
            from ocr_review_security import timestamp
            expired = item.get("revalidate_after") and timestamp(item["revalidate_after"]).date() <= today
        except (ValueError, TypeError):
            expired = True
        if expired or (item.get("deadline") and item["deadline"] < today.isoformat()):
            item.update(publication_eligible=False, review_signature=None)
    if len(items) > 5000:
        raise RuntimeError("Cola supera 5000 registros; requiere archivo histórico explícito")
    payload = {
        "schema": "trabajo-cerca.motor-d-review.v1",
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "items_total": len(items),
        "pending_total": sum(x.get("review_status") == "pending" for x in items),
        "publication_enabled": False,
        "items": items
    }
    review_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + chr(10), encoding="utf-8")
    return {"input_candidates": len(rows), "added": added, "updated": updated,
            "rejected_invalid_url": rejected, "pending_total": payload["pending_total"],
            "publication_enabled": False, "output": str(review_path)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="resultados/candidatos_revision.json")
    ap.add_argument("--output", default="automation/motor_d_review/radar_ocr_pending.json")
    args = ap.parse_args()
    print(json.dumps(adapt(Path(args.input), Path(args.output)), ensure_ascii=False))

if __name__ == "__main__":
    main()
