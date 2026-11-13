import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest_municipal_pdf_queue import merge, write_atomic  # noqa: E402


class PdfQueueTests(unittest.TestCase):
    def test_adds_pending_and_is_idempotent(self):
        existing = {"schema": "x", "items": []}
        rows = [{"url": "https://example.cl/a.pdf", "source": "Municipio", "commune": "Angol",
                 "status": "pending_document_review", "sha256": "a" * 64}]
        first = merge(existing, rows, "2026-11-12")
        second = merge(first, rows, "2026-11-13")
        self.assertEqual(first["items_total"], 1)
        self.assertEqual(first["pending_total"], 1)
        self.assertFalse(first["publication_enabled"])
        self.assertEqual(second["added_this_run"], 0)
        self.assertEqual(second["items"][0]["review_status"], "pending")

    def test_never_overwrites_signed_decision(self):
        signed = {"schema": "x", "items": [{
            "review_id": "pdf_" + __import__("hashlib").sha256(b"https://example.cl/a.pdf").hexdigest()[:20],
            "url": "https://example.cl/a.pdf", "review_status": "approved",
            "review_signature": "signed", "publication_eligible": True,
            "first_discovered": "2026-11-01",
        }]}
        rows = [{"url": "https://example.cl/a.pdf", "source": "Municipio"}]
        merged = merge(signed, rows, "2026-11-12")
        self.assertEqual(merged["items"][0]["review_status"], "approved")
        self.assertEqual(merged["items"][0]["review_signature"], "signed")
        self.assertTrue(merged["items"][0]["publication_eligible"])

    def test_existing_ocr_reference_same_pdf_is_not_duplicated(self):
        url = "https://example.cl/convocatoria.pdf"
        existing = {"schema": "x", "items": [{
            "review_id": "ocr_original_review", "url": url, "canonical_url": url,
            "review_status": "pending", "notes": "Documento en verificación",
            "first_discovered": "2026-11-01",
        }]}
        merged = merge(existing, [{"url": url, "source": "Municipio"}], "2026-11-13")
        self.assertEqual(len(merged["items"]), 1)
        self.assertEqual(merged["added_this_run"], 0)
        self.assertEqual(merged["items"][0]["review_id"], "ocr_original_review")
        self.assertEqual(merged["items"][0]["notes"], "Documento en verificación")

    def test_atomic_write(self):
        path = Path(__file__).with_name(".test_review_queue.json")
        try:
            write_atomic(path, {"items": [], "items_total": 0})
            self.assertEqual(json.loads(path.read_text())["items_total"], 0)
        finally:
            path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()