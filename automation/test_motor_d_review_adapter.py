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
            self.assertIsNone(saved["items"][0]["text_excerpt"])

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

class EvidencePersistenceTests(unittest.TestCase):
    def test_changed_document_requires_revalidation_and_removes_excerpt(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp)/'source.json', Path(tmp)/'queue.json'
            row = {'url':'https://example.cl/afiche.pdf','document_sha256':'a'*64}
            source.write_text(json.dumps([row]))
            adapter.adapt(source, target, date(2026,11,8))
            queue = json.loads(target.read_text())
            queue['items'][0].update(review_status='approved', review_signature='signed',
                publication_eligible=True, review_notes='Verified',
                vigencia_verified_at='2026-11-08T10:00:00Z', revalidate_after='2026-11-10T10:00:00Z')
            target.write_text(json.dumps(queue))
            adapter.adapt(source, target, date(2026,11,9))
            same = json.loads(target.read_text())['items'][0]
            self.assertEqual(same['review_signature'], 'signed')
            self.assertEqual(same['review_notes'], 'Verified')
            row.update(document_sha256='b'*64, text_excerpt='Juan 912345678 persona@example.cl 12.345.678-5')
            source.write_text(json.dumps([row]))
            adapter.adapt(source, target, date(2026,11,9))
            changed = json.loads(target.read_text())['items'][0]
            self.assertEqual(changed['review_status'], 'pending')
            self.assertFalse(changed['publication_eligible'])
            self.assertIsNone(changed['review_signature'])
            self.assertNotIn('912345678', target.read_text())
            self.assertNotIn('persona@example.cl', target.read_text())

    def test_redacts_personal_contact_data(self):
        value = adapter.sanitize_excerpt('912345678 45 234567 persona@example.cl 12.345.678-5')
        for private in ('912345678', '234567', 'persona@example.cl', '12.345.678-5'):
            self.assertNotIn(private, value)
