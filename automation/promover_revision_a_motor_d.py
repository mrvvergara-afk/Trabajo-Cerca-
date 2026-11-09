#!/usr/bin/env python3
"""Consume reviewed OCR candidates without automatically publishing them."""
import argparse
import datetime as dt
import json
from pathlib import Path

try:
    from motor_d_express import classify, produce
except ModuleNotFoundError:
    from automation.motor_d_express import classify, produce

REQUIRED = ("approved_by", "approved_at", "evidence_sha256", "title",
            "employer", "work_commune", "date_source")

def eligible(item):
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

def prepare(queue, today=None):
    today = today or dt.date.today()
    if queue.get("schema") != "trabajo-cerca.motor-d-review.v1":
        raise ValueError("Esquema de revisión desconocido")
    candidates = []
    decisions = []
    for item in queue.get("items", []):
        if not isinstance(item, dict):
            continue
        if not eligible(item):
            decisions.append({"review_id": item.get("review_id"),
                              "state": "not_eligible"})
            continue
        record = {key: item.get(key) for key in
                  ("url", "title", "employer", "work_commune",
                   "date_source", "application_evidence", "evidence",
                   "http", "source_commune_not_confirmed")}
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
    report, decisions = prepare(queue)
    result = {"candidates_eligible": len(report["candidates"]),
              "decisions": decisions, "batches_generated": False}
    if args.produce_batches:
        result["motor_d"] = produce(report, root=Path(args.ready_dir))
        result["batches_generated"] = True
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()
