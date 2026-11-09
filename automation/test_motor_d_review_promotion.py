import json
import hashlib
from ocr_review_security import signature
KEY = "test-only-review-key-" * 3
DOCUMENT = b"complete synthetic evidence"
import tempfile
import unittest
from datetime import date
from pathlib import Path

import promover_revision_a_motor_d as promotion
from motor_d_express import produce

TODAY = date(2026, 11, 8)

def approved():
    item = {
        "review_id": "ocr_example", "review_status": "approved",
        "publication_eligible": True, "approved_by": "reviewer",
        "approved_at": "2026-11-08T10:00:00Z",
        "document_sha256": hashlib.sha256(DOCUMENT).hexdigest(),
        "review_notes": "Synthetic verified evidence", "publication_date_confirmed": True,
        "vigencia_verified_at": "2026-11-08T09:00:00Z",
        "revalidate_after": "2026-11-10T09:00:00Z",
        "application_url": "https://example.cl/apply", "extractor": "pdf_text",
        "url": "https://munimulchen.cl/omil/oferta",
        "title": "Operador de maquinaria", "employer": "Empresa Ejemplo",
        "work_commune": "Mulchén", "date_source": "2026-11-07",
        "application_evidence": True,
        "evidence": "individual_page_with_job_terms", "http": 200,
        "source_commune_not_confirmed": False,
        "work_location_verified": True, "employer_verified": True,
        "application_route_verified": True
    }

    item["review_signature"] = signature(item, KEY)
    return item

def prepare(queue, today=TODAY):
    return promotion.prepare(queue, today, KEY, lambda _: DOCUMENT)

class PromotionTests(unittest.TestCase):
    def test_approved_produces_batch_when_explicitly_requested(self):
        report, decisions = prepare({
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
        report, _ = prepare({
            "schema": "trabajo-cerca.motor-d-review.v1", "items": items}, TODAY)
        self.assertEqual(report["candidates"], [])
        with tempfile.TemporaryDirectory() as tmp:
            summary = produce(report, root=Path(tmp), today=TODAY)
            self.assertEqual(summary["daily_batch_offers"], 0)
            self.assertEqual(summary["recovery_batch_offers"], 0)

    def test_approval_without_publication_flag_is_not_eligible(self):
        item = approved()
        item["publication_eligible"] = False
        report, _ = prepare({
            "schema": "trabajo-cerca.motor-d-review.v1", "items": [item]}, TODAY)
        self.assertEqual(report["candidates"], [])

if __name__ == "__main__":
    unittest.main()

class SecurityRegressionTests(unittest.TestCase):
    def report(self, items, document=DOCUMENT):
        return promotion.prepare({'schema': 'trabajo-cerca.motor-d-review.v1', 'items': items},
                                 TODAY, KEY, lambda _: document)[0]

    def signed(self, **patch):
        item = approved()
        item.update(patch)
        item['review_signature'] = signature(item, KEY)
        return item

    def test_manual_json_changes_cannot_authorize(self):
        item = approved()
        item['employer'] = 'Changed employer'
        self.assertEqual(self.report([item])['candidates'], [])
        item = approved()
        item.pop('review_signature')
        self.assertEqual(self.report([item])['candidates'], [])

    def test_expired_and_missing_fields_even_when_signed(self):
        for patch in ({'deadline': '2026-11-07'}, {'employer': ''}, {'work_commune': ''},
                      {'application_url': ''}, {'title': ''},
                      {'revalidate_after': '2026-11-08T12:00:00Z'},
                      {'publication_date_confirmed': False}, {'extractor': 'pdf_preview_partial'},
                      {'work_commune': 'Quilaco'}):
            with self.subTest(patch=patch):
                self.assertEqual(self.report([self.signed(**patch)])['candidates'], [])

    def test_changed_document_and_unavailable_evidence_block(self):
        self.assertEqual(self.report([approved()], b'changed')['candidates'], [])
        result, _ = promotion.prepare({'schema': 'trabajo-cerca.motor-d-review.v1',
            'items': [approved()]}, TODAY, KEY)
        self.assertEqual(result['candidates'], [])

    def test_old_still_valid_offer_recovers_original_date_and_deadline(self):
        item = self.signed(date_source='2025-01-01', deadline='2026-12-01')
        report = self.report([item])
        with tempfile.TemporaryDirectory() as tmp:
            result = produce(report, Path(tmp), TODAY)
            self.assertEqual(result['recovery_batch_offers'], 1)
            index = json.loads((Path(tmp)/'index.json').read_text())
            batch = json.loads((Path(tmp)/index['batches'][0]['file']).read_text())
            self.assertEqual(batch['offers'][0]['fecha_publicacion'], '2025-01-01')
            self.assertEqual(batch['offers'][0]['fecha_cierre'], '2026-12-01')

    def test_cross_run_html_ocr_and_review_id_deduplication(self):
        original = self.report([approved()])
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(produce(original, Path(tmp), TODAY)['daily_batch_offers'], 1)
            for patch in ({}, {'url': 'https://other.cl/same-job'},
                          {'url': 'https://other.cl/changed-title', 'title': 'Otro cargo distinto'}):
                candidate = dict(original['candidates'][0], **patch)
                self.assertEqual(produce({'candidates':[candidate]}, Path(tmp), TODAY)['daily_batch_offers'], 0)
        # HTML first, OCR later: shared job key prevents a second incorporation.
        with tempfile.TemporaryDirectory() as tmp:
            html = dict(original['candidates'][0])
            html.pop('review_id'); html.pop('promotion_id')
            produce({'candidates':[html]}, Path(tmp), TODAY)
            ocr = dict(original['candidates'][0], url='https://example.cl/afiche.pdf')
            self.assertEqual(produce({'candidates':[ocr]}, Path(tmp), TODAY)['daily_batch_offers'], 0)

    def test_trusted_reviewer_approve_and_reject(self):
        from revisar_ocr import review
        import datetime as dt
        item = approved()
        fields = {k:v for k,v in item.items() if k in __import__('ocr_review_security').FIELDS
                  and k not in {'review_id','canonical_url','url','approved_by','approved_at',
                                'document_sha256','review_status','publication_eligible'}}
        result = review({'review_id': 'ocr_example','url': item['url']}, 'approve',
                        'reviewer', 'Verificado', fields, DOCUMENT, KEY,
                        dt.datetime(2026,11,8,10,tzinfo=dt.timezone.utc))
        self.assertEqual(len(self.report([result])['candidates']), 1)
        rejected = review(result, 'reject', 'reviewer', 'Cerrada', {}, DOCUMENT, KEY)
        self.assertEqual(self.report([rejected])['candidates'], [])
