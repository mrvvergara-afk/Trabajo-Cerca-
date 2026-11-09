import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

import promover_revision_a_motor_d as promotion
from motor_d_express import produce

TODAY = date(2026, 11, 8)

def approved():
    return {
        "review_id": "ocr_example", "review_status": "approved",
        "publication_eligible": True, "approved_by": "reviewer",
        "approved_at": "2026-11-08T10:00:00Z",
        "evidence_sha256": "a" * 64,
        "url": "https://example.cl/omil/oferta",
        "title": "Operador de maquinaria", "employer": "Empresa Ejemplo",
        "work_commune": "Mulchén", "date_source": "2026-11-07",
        "application_evidence": True,
        "evidence": "individual_page_with_job_terms", "http": 200,
        "source_commune_not_confirmed": False,
        "work_location_verified": True, "employer_verified": True,
        "application_route_verified": True
    }

class PromotionTests(unittest.TestCase):
    def test_approved_produces_batch_when_explicitly_requested(self):
        report, decisions = promotion.prepare({
            "schema": "trabajo-cerca.motor-d-review.v1",
            "items": [approved()]}, TODAY)
        self.assertEqual(len(report["candidates"]), 1)
        self.assertEqual(decisions[0]["state"], "EXPRESS")
        with tempfile.TemporaryDirectory() as tmp:
            summary = produce(report, root=Path(tmp), today=TODAY)
            self.assertEqual(summary["daily_batch_offers"], 1)
            self.assertTrue((Path(tmp) / "index.json").exists())

    def test_pending_rejected_and_incomplete_never_produce(self):
        items = []
        for status in ("pending", "rejected"):
            item = approved()
            item["review_status"] = status
            items.append(item)
        missing = approved()
        missing["application_route_verified"] = False
        items.append(missing)
        report, _ = promotion.prepare({
            "schema": "trabajo-cerca.motor-d-review.v1", "items": items}, TODAY)
        self.assertEqual(report["candidates"], [])
        with tempfile.TemporaryDirectory() as tmp:
            summary = produce(report, root=Path(tmp), today=TODAY)
            self.assertEqual(summary["daily_batch_offers"], 0)
            self.assertEqual(summary["recovery_batch_offers"], 0)

    def test_approval_without_publication_flag_is_not_eligible(self):
        item = approved()
        item["publication_eligible"] = False
        report, _ = promotion.prepare({
            "schema": "trabajo-cerca.motor-d-review.v1", "items": [item]}, TODAY)
        self.assertEqual(report["candidates"], [])

if __name__ == "__main__":
    unittest.main()
