import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

import adaptar_radar_a_motor_d_review as adapter

class MotorDReviewAdapterTests(unittest.TestCase):
    def test_ocr_candidate_is_persisted_only_for_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            source=root/"candidates.json"
            target=root/"review.json"
            source.write_text(json.dumps([{
                "url":"https://www.munimulchen.cl/afiche-omil.pdf",
                "source_id":"M02",
                "origin":"fuente_web_publica",
                "reported_territories":["Mulchén"],
                "reader_status":"candidato_fecha_pendiente",
                "published_date_evidence":"2026-10-15",
                "date_discovered":"2026-11-08",
                "deadline_evidence":None,
                "extractor":"pdf_ocr_local",
                "text_excerpt":"OFERTA LABORAL. Se necesita operador. [teléfono]",
                "possible_communes":["Mulchén"],
                "publication_date_confirmed":True
            }]),encoding="utf-8")
            result=adapter.adapt(source,target,date(2026,11,8))
            saved=json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(result["added"],1)
            self.assertFalse(saved["publication_enabled"])
            self.assertEqual(saved["items"][0]["review_status"],"pending")
            self.assertFalse(saved["items"][0]["publication_eligible"])
            self.assertEqual(saved["items"][0]["date_source"],"2026-10-15")
            self.assertEqual(saved["items"][0]["date_discovered"],"2026-11-08")
            self.assertIn("[teléfono]",saved["items"][0]["text_excerpt"])

    def test_same_canonical_url_updates_instead_of_duplicating(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            source=root/"candidates.json"
            target=root/"review.json"
            row={"url":"https://www.munimulchen.cl/oferta/","reader_status":"candidato_para_revision"}
            source.write_text(json.dumps([row]),encoding="utf-8")
            adapter.adapt(source,target,date(2026,11,7))
            row["url"]="https://munimulchen.cl/oferta"
            source.write_text(json.dumps([row]),encoding="utf-8")
            result=adapter.adapt(source,target,date(2026,11,8))
            saved=json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(result["updated"],1)
            self.assertEqual(len(saved["items"]),1)
            self.assertEqual(saved["items"][0]["first_discovered"],"2026-11-07")
            self.assertEqual(saved["items"][0]["last_seen"],"2026-11-08")

    def test_rejects_non_https_and_local_urls(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            source=root/"candidates.json"
            target=root/"review.json"
            source.write_text(json.dumps([
                {"url":"http://example.cl/oferta"},
                {"url":"https://127.0.0.1/private"},
                {"url":"https://localhost/private"}
            ]),encoding="utf-8")
            result=adapter.adapt(source,target,date(2026,11,8))
            self.assertEqual(result["rejected_invalid_url"],3)
            self.assertEqual(result["added"],0)

    def test_repeated_radar_does_not_erase_review_decisions(self):
        for status in ("approved", "rejected"):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                source, target = root / "input.json", root / "queue.json"
                source.write_text(json.dumps([{"url": "https://example.cl/omil",
                    "deadline_evidence": "2026-12-01"}]), encoding="utf-8")
                adapter.adapt(source, target, date(2026, 11, 8))
                saved = json.loads(target.read_text(encoding="utf-8"))
                item = saved["items"][0]
                item.update({"review_status": status, "review_reason": "decision_humana",
                    "work_location_verified": True, "employer_verified": True,
                    "application_route_verified": True,
                    "publication_eligible": status == "approved"})
                target.write_text(json.dumps(saved), encoding="utf-8")
                source.write_text(json.dumps([{"url": "https://example.cl/omil"}]),
                                  encoding="utf-8")
                adapter.adapt(source, target, date(2026, 11, 9))
                result = json.loads(target.read_text(encoding="utf-8"))["items"][0]
                self.assertEqual(result["review_status"], status)
                self.assertEqual(result["review_reason"], "decision_humana")
                self.assertTrue(result["work_location_verified"])
                self.assertEqual(result["deadline"], "2026-12-01")
                self.assertEqual(result["publication_eligible"], status == "approved")

    def test_redacts_chilean_landline(self):
        self.assertEqual(adapter.sanitize_excerpt("Llamar al 45 234567"),
                         "Llamar al [teléfono]")

if __name__=="__main__":
    unittest.main()
