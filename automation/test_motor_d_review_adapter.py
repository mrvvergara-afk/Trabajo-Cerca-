import json
import tempfile
import unittest
from unittest.mock import patch
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

    def test_real_radar_evidence_maps_into_review_without_auto_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp)/"source.json", Path(tmp)/"queue.json"
            source.write_text(json.dumps([{
                "url": "https://municipalidadcollipulli.cl/omil/oferta",
                "source_id": "OMIL-COL",
                "reported_territories": ["Collipulli"],
                "reader_status": "candidato_para_revision",
                "published_date_evidence": "2026-11-09",
                "deadline_evidence": "2026-12-01",
                "document_sha256": "a" * 64,
                "publication_date_confirmed": True,
                "http": 200, "extractor": "article_body_text"
            }]), encoding="utf-8")
            result = adapter.adapt(source, target, date(2026, 11, 9))
            item = json.loads(target.read_text())["items"][0]
            self.assertEqual(result["added"], 1)
            self.assertEqual(item["document_sha256"], "a" * 64)
            self.assertEqual(item["date_source"], "2026-11-09")
            self.assertEqual(item["deadline"], "2026-12-01")
            self.assertEqual(item["http"], 200)
            self.assertEqual(item["review_status"], "pending")
            self.assertFalse(item["publication_eligible"])

    def test_legacy_documental_evidence_fields_are_not_lost(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp)/"source.json", Path(tmp)/"queue.json"
            source.write_text(json.dumps([{
                "url": "https://municipalidadcollipulli.cl/omil/afiche.pdf",
                "source_date_evidence": "2026-11-07",
                "deadline": "2026-12-01",
                "sha256": "b" * 64,
                "publication_date_confirmed": False
            }]), encoding="utf-8")
            adapter.adapt(source, target, date(2026, 11, 9))
            item = json.loads(target.read_text())["items"][0]
            self.assertEqual(item["date_source"], "2026-11-07")
            self.assertEqual(item["deadline"], "2026-12-01")
            self.assertEqual(item["document_sha256"], "b" * 64)
            self.assertFalse(item["publication_date_confirmed"])
            self.assertFalse(item["publication_eligible"])

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

    def test_atomic_queue_write_keeps_valid_json_after_repeated_scans(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp)/"source.json", Path(tmp)/"queue.json"
            source.write_text(json.dumps([{"url": "https://example.cl/omil"}]), encoding="utf-8")
            adapter.adapt(source, target, date(2026, 11, 8))
            first = json.loads(target.read_text(encoding="utf-8"))
            first["items"][0]["review_status"] = "rejected"
            target.write_text(json.dumps(first), encoding="utf-8")
            adapter.adapt(source, target, date(2026, 11, 9))
            second = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(second["items_total"], 1)
            self.assertEqual(second["items"][0]["review_status"], "rejected")
            self.assertEqual(list(Path(tmp).glob(".motor_d_review_*.tmp")), [])

    def test_failed_atomic_replace_preserves_previous_queue(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp)/"source.json", Path(tmp)/"queue.json"
            source.write_text(json.dumps([{"url": "https://example.cl/omil"}]), encoding="utf-8")
            adapter.adapt(source, target, date(2026, 11, 8))
            before = target.read_bytes()
            with patch.object(adapter.os, "replace", side_effect=OSError("simulated interruption")):
                with self.assertRaises(OSError):
                    adapter.adapt(source, target, date(2026, 11, 9))
            self.assertEqual(target.read_bytes(), before)
            self.assertEqual(list(Path(tmp).glob(".motor_d_review_*.tmp")), [])

    def test_missing_recrawl_hash_does_not_revoke_signed_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp)/"source.json", Path(tmp)/"queue.json"
            row = {"url": "https://example.cl/afiche.pdf", "document_sha256": "a" * 64}
            source.write_text(json.dumps([row]), encoding="utf-8")
            adapter.adapt(source, target, date(2026, 11, 8))
            queue = json.loads(target.read_text(encoding="utf-8"))
            queue["items"][0].update(review_status="approved", review_signature="signed",
                                     publication_eligible=True)
            target.write_text(json.dumps(queue), encoding="utf-8")
            row.pop("document_sha256")
            source.write_text(json.dumps([row]), encoding="utf-8")
            adapter.adapt(source, target, date(2026, 11, 9))
            saved = json.loads(target.read_text(encoding="utf-8"))["items"][0]
            self.assertEqual(saved["review_status"], "approved")
            self.assertEqual(saved["document_sha256"], "a" * 64)
            self.assertEqual(saved["review_signature"], "signed")

    def test_changed_deadline_without_new_hash_preserves_last_fingerprint(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp)/"source.json", Path(tmp)/"queue.json"
            row = {"url": "https://example.cl/afiche.pdf",
                   "document_sha256": "a" * 64, "deadline_evidence": "2026-12-01"}
            source.write_text(json.dumps([row]), encoding="utf-8")
            adapter.adapt(source, target, date(2026, 11, 8))
            queue = json.loads(target.read_text(encoding="utf-8"))
            queue["items"][0].update(review_status="approved", review_signature="signed",
                                     publication_eligible=True)
            target.write_text(json.dumps(queue), encoding="utf-8")
            row.pop("document_sha256")
            row["deadline_evidence"] = "2026-12-02"
            source.write_text(json.dumps([row]), encoding="utf-8")
            adapter.adapt(source, target, date(2026, 11, 9))
            saved = json.loads(target.read_text(encoding="utf-8"))["items"][0]
            self.assertEqual(saved["review_status"], "pending")
            self.assertFalse(saved["publication_eligible"])
            self.assertIsNone(saved["review_signature"])
            self.assertEqual(saved["document_sha256"], "a" * 64)

    def test_malformed_deadline_revokes_approval_without_losing_queue(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, target = Path(tmp)/"source.json", Path(tmp)/"queue.json"
            source.write_text(json.dumps([{"url": "https://example.cl/oferta",
                                          "deadline_evidence": {"invalid": "date"}}]))
            adapter.adapt(source, target, date(2026, 11, 10))
            queue = json.loads(target.read_text())
            queue["items"][0].update(review_status="approved",
                                      review_signature="signed", publication_eligible=True)
            target.write_text(json.dumps(queue))
            adapter.adapt(source, target, date(2026, 11, 10))
            item = json.loads(target.read_text())["items"][0]
            self.assertFalse(item["publication_eligible"])
            self.assertIsNone(item["review_signature"])
            self.assertEqual(item["review_status"], "approved")

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

class FullReviewToReadyContractTests(unittest.TestCase):
    def test_radar_candidate_only_reaches_ready_after_signed_review(self):
        """Radar -> evidence queue -> verified review -> Motor D batch; no fake publication."""
        import datetime as dt
        import hashlib
        from revisar_ocr import review
        from promover_revision_a_motor_d import prepare
        from motor_d_express import produce
        key = "integration-test-review-key-" * 3
        document = b"Fixture individual job evidence, deterministic and complete"
        today = date(2026, 11, 9)
        now = dt.datetime(2026, 11, 9, 15, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source, target = root / "radar.json", root / "review.json"
            source.write_text(json.dumps([{
                "url": "https://www.munimulchen.cl/omil/operador",
                "source_id": "OMIL-MUL",
                "reader_status": "candidato_para_revision",
                "published_date_evidence": "2026-11-08",
                "deadline_evidence": "2026-11-30",
                "document_sha256": hashlib.sha256(document).hexdigest(),
                "extractor": "html_text", "http": 200,
                "publication_date_confirmed": True,
                "possible_communes": ["Mulchén"]
            }]), encoding="utf-8")
            adapter.adapt(source, target, today)
            queue = json.loads(target.read_text())
            pending = queue["items"][0]
            first, _ = prepare(queue, today, key, lambda _: document, now)
            self.assertEqual(first["candidates"], [])
            fields = {
                "title": "Operador de maquinaria", "employer": "Empresa Ejemplo",
                "work_commune": "Mulchén",
                "application_url": "https://www.munimulchen.cl/postular",
                "application_evidence": True,
                "evidence": "individual_page_with_job_terms",
                "source_commune_not_confirmed": False,
                "work_location_verified": True, "employer_verified": True,
                "application_route_verified": True,
                "publication_date_confirmed": True,
                "vigencia_verified_at": "2026-11-09T14:00:00Z",
                "revalidate_after": "2026-11-10T14:00:00Z"
            }
            verified = review(pending, "approve", "fixture-reviewer",
                              "Evidencia comprobada en fixture", fields, document, key, now)
            report, decisions = prepare({"schema": queue["schema"], "items": [verified]},
                                        today, key, lambda _: document, now)
            self.assertEqual(decisions[0]["state"], "EXPRESS")
            self.assertEqual(len(report["candidates"]), 1)
            ready = root / "ready"
            summary = produce(report, ready, today)
            self.assertEqual(summary["daily_batch_offers"], 1)
            self.assertEqual(summary["published_confirmed"], 0)
            index = json.loads((ready / "index.json").read_text())
            self.assertEqual(len(index["batches"]), 1)
            batch = json.loads((ready / index["batches"][0]["file"]).read_text())
            self.assertEqual(batch["offers"][0]["fecha_publicacion"], "2026-11-08")
            self.assertEqual(batch["offers"][0]["comunas"], ["Mulchén"])
