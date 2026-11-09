#!/usr/bin/env python3
"""Consume reviewed OCR candidates without automatically publishing them."""
import argparse
import datetime as dt
import json
import hashlib
import re
from ocr_review_security import verify, timestamp, redact
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    from motor_d_express import classify, produce
except ModuleNotFoundError:
    from automation.motor_d_express import classify, produce

REQUIRED = ("approved_by", "approved_at", "document_sha256", "review_notes", "vigencia_verified_at", "revalidate_after", "application_url", "title",
            "employer", "work_commune", "date_source")

def eligible(item, today=None, key=None, document_loader=None, now=None):
    today = today or dt.date.today()
    now = now or (dt.datetime.now(dt.timezone.utc) if today == dt.datetime.now(dt.timezone.utc).date()
           else dt.datetime.combine(today, dt.time.max, dt.timezone.utc))
    if any(redact(item.get(k)) != item.get(k) for k in ("title", "employer")):
        return False
    if not verify(item, key):
        return False
    try:
        if not (timestamp(item["approved_at"]) <= now and
                timestamp(item["vigencia_verified_at"]) <= now < timestamp(item["revalidate_after"])):
            return False
        if (timestamp(item["revalidate_after"]) - timestamp(item["vigencia_verified_at"])).total_seconds() > 7*86400:
            return False
        if item.get("deadline") and dt.date.fromisoformat(item["deadline"]) < today:
            return False
        if not re.fullmatch(r"[a-f0-9]{64}", item.get("document_sha256", "")):
            return False
        if document_loader is None or hashlib.sha256(document_loader(item["url"])).hexdigest() != item["document_sha256"]:
            return False
    except (ValueError, TypeError, KeyError, OSError, TimeoutError, ConnectionError):
        return False
    if item.get("extractor") not in {"pdf_text", "pdf_ocr_local", "imagen_ocr_local", "html_text", "article_body_text"} or item.get("publication_date_confirmed") is not True:
        return False
    from motor_d_express import canonical_url
    if not canonical_url(item.get("application_url")):
        return False
    if item.get("review_status") != "approved":
        return False
    if item.get("publication_eligible") is not True:
        return False
    if not all(item.get(k) for k in REQUIRED):
        return False
    if not all(item.get(k) is True for k in
               ("work_location_verified", "employer_verified",
                "application_route_verified", "application_evidence")):
        return False
    if item.get("evidence") != "individual_page_with_job_terms":
        return False
    if item.get("http") != 200:
        return False
    if item.get("source_commune_not_confirmed") is not False:
        return False
    return True

def prepare(queue, today=None, key=None, document_loader=None, now=None):
    today = today or dt.date.today()
    if queue.get("schema") != "trabajo-cerca.motor-d-review.v1":
        raise ValueError("Esquema de revisión desconocido")
    candidates = []
    decisions = []
    for item in queue.get("items", []):
        if not isinstance(item, dict):
            continue
        if not eligible(item, today, key, document_loader, now):
            decisions.append({"review_id": item.get("review_id"),
                              "state": "not_eligible"})
            continue
        record = {key: item.get(key) for key in
                  ("url", "title", "employer", "work_commune",
                   "date_source", "application_evidence", "evidence",
                   "http", "source_commune_not_confirmed", "deadline", "review_id",
                   "document_sha256", "application_url")}
        record["ocr_revalidate_after"] = item["revalidate_after"]
        record["ocr_document_sha256"] = item["document_sha256"]
        record["promotion_id"] = "ocr_" + hashlib.sha256((item["review_id"] + item["document_sha256"]).encode()).hexdigest()[:24]
        state, reason, _ = classify(record, today)
        decisions.append({"review_id": item.get("review_id"),
                          "state": state, "reason": reason})
        if state in ("EXPRESS", "RECUPERACION"):
            candidates.append(record)
    return {"candidates": candidates}, decisions

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="automation/motor_d_review/radar_ocr_pending.json")
    parser.add_argument("--output", default="automation/motor_d_review/promotion_preview.json")
    parser.add_argument("--produce-batches", action="store_true",
                        help="Explicitly generate Motor D batches for eligible approved items")
    parser.add_argument("--ready-dir", default="automation/motor_d_ready")
    args = parser.parse_args()
    queue = json.loads(Path(args.input).read_text(encoding="utf-8"))
    from trabajo_cerca.trabajo_cerca_lector_documental import fetch_bytes, allowed, robots_ok
    def load(url):
        if not allowed(url) or not robots_ok(url):
            raise ValueError("Documento no permitido")
        return fetch_bytes(url)[0]
    local_day = dt.datetime.now(ZoneInfo("America/Santiago")).date()
    report, decisions = prepare(queue, today=local_day, document_loader=load,
                                now=dt.datetime.now(dt.timezone.utc))
    result = {"candidates_eligible": len(report["candidates"]),
              "decisions": decisions, "batches_generated": False}
    if args.produce_batches:
        result["motor_d"] = produce(report, root=Path(args.ready_dir), today=local_day)
        result["batches_generated"] = True
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()
