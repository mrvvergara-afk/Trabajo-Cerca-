"""PDF closeout never converts municipal documents into approved jobs."""
import json
import unittest
from pathlib import Path

from qa_municipal_pdf_closeout import closeout, classify_document
from trabajo_cerca.municipal_feed import is_broad_municipal_index


TODAY=__import__("datetime").date(2026,11,9)
B_C_CASE={"evidence_id":"review-traiguen-3","url":
          "https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/",
          "owner":"B","status":"document_or_multi_position_review"}
ARTICLE=B_C_CASE["url"]
PDF="https://mtraiguen.cl/wp-content/uploads/2026/10/DAEX-BASES-Y-CALENDARIO.pdf"
OVERVIEW="https://mtraiguen.cl/category/bolsa-de-empleo-o-concurso/"
GENERIC="https://mtraiguen.cl/wp-content/uploads/2023/07/Plano-Traiguen.pdf"


def doc(url,publisher=ARTICLE):
    return {"url":url,"source":"Municipio Traiguén","commune":"Traiguén",
            "publisher_page":publisher,"review_required":True}


def report(*docs):
    return {"date":"2026-11-09T23:46:35-03:00","documents_for_review":list(docs)}


def receipt(*items):
    return {"records":list(items)}


def read_status(status="candidato_para_revision", sha="a"*64, deadline=None,
                extractor="pdf_text", origin=None):
    return {"decision":status,"sha256":sha,"deadline":deadline,
            "extractor":extractor,"source_date_evidence":origin,
            "publication_date_confirmed":False,"http":200}


class MunicipalDocumentCloseoutTests(unittest.TestCase):
    def test_real_report_has_broad_index_archive_noise(self):
        source=json.loads((Path(__file__).resolve().parent/
                          "motor_d_discovery"/"territorial_daily.json").read_text(encoding="utf8"))
        docs=source["documents_for_review"]
        self.assertGreaterEqual(len(docs),16)
        overview=[d for d in docs if is_broad_municipal_index(d.get("publisher_page") or "")]
        # The previous report has six unrelated Traiguén category PDFs. The
        # next scan has zero. Both are acceptable while scripts stay idempotent.
        self.assertLessEqual(len(overview),6)
        self.assertTrue(all(d["url"].lower().endswith(".pdf") for d in docs))

    def test_old_category_footers_are_skipped_without_http_or_ocr(self):
        def forbidden(*_args,**_kwargs):
            raise AssertionError("generic category PDF must never be read")
        result=closeout(report(doc(GENERIC,OVERVIEW)),receipt(),[],True,
                        reader=forbidden,today=TODAY)
        self.assertEqual(result["documents_skipped_before_read"],1)
        self.assertEqual(result["documents_examined_or_blocked"],0)
        self.assertEqual(result["new_pdf_cases_to_B"],0)
        self.assertEqual(result["new_publications"],0)

    def test_traiguen_third_party_verified_expiry_prevents_publication(self):
        def reader(*_args,**_kwargs):
            return read_status("plazo_vencido_no_publicar",deadline="2026-11-02")
        result=closeout(report(doc(PDF)),receipt(B_C_CASE),[],True,
                        reader=reader,today=TODAY)
        self.assertEqual(result["review_receipts"][0]["status"],
                         "expired_deadline_verified_in_document")
        self.assertEqual(result["review_receipts"][0]["evidence_deadline"],"2026-11-02")
        self.assertEqual(result["new_pdf_cases_to_B"],0)
        self.assertEqual(result["existing_reviews_with_pdf_evidence"],1)
        self.assertFalse(result["review_receipts"][0]["publication_eligible"])

    def test_traiguen_33_page_preview_stays_in_existing_B_review_not_new_case(self):
        def reader(*_args,**_kwargs):
            return {**read_status("documento_parcial_revision_obligatoria",
                                  extractor="pdf_preview_partial"),"original_classification":
                    "candidato_para_revision"}
        result=closeout(report(doc(PDF)),receipt(B_C_CASE),[],True,
                        reader=reader,today=TODAY)
        self.assertEqual(result["review_receipts"][0]["status"],
                         "document_attached_to_existing_review")
        self.assertEqual(result["review_receipts"][0]["linked_existing_review_id"],
                         "review-traiguen-3")
        self.assertEqual(result["new_pdf_cases_to_B"],0)
        self.assertEqual(result["joined_existing_review_cases"][0]["linked_pdf_evidence_count"],1)

    def test_pdf_without_parent_review_yields_one_B_case_only(self):
        one=doc("https://municipalidadrenaico.cl/wp-content/uploads/2026/07/TECNICO-EXTENSIONISTA.pdf",
                "https://municipalidadrenaico.cl/concursos-publicos/")
        result=closeout(report(one),receipt(),[],True,
                        reader=lambda *_args,**_kwargs:read_status(),today=TODAY)
        self.assertEqual(result["new_pdf_cases_to_B"],1)
        self.assertEqual(result["new_document_review_queue"]["items"][0]["owner"],"B")
        self.assertFalse(result["new_document_review_queue"]["approved_for_publication"])
        self.assertFalse(result["new_document_review_queue"]["items"][0]["publication_eligible"])

    def test_published_parent_never_creates_another_job(self):
        # No worksite is inferred from the source; only publisher identity.
        one=doc(PDF)
        published=[{"id":"public_existing","kind":"job_offer","active":True,
                    "url":ARTICLE}]
        result=closeout(report(one),receipt(),published,True,
                        reader=lambda *_args,**_kwargs:read_status(),today=TODAY)
        self.assertEqual(result["new_pdf_cases_to_B"],0)
        self.assertEqual(result["review_receipts"][0]["status"],
                         "parent_offer_already_public_document_only")

    def test_same_pdf_sha_under_different_valid_urls_counted_once(self):
        docs=[doc(PDF),doc("https://mtraiguen.cl/wp-content/uploads/2026/10/dup.pdf")]
        result=closeout(report(*docs),receipt(),[],True,
                        reader=lambda *_args,**_kwargs:read_status(),today=TODAY)
        self.assertEqual(result["new_pdf_cases_to_B"],1)
        self.assertEqual(result["documents_skipped_before_read"],1)
        self.assertEqual(result["excluded_or_deduplicated_pdf_refs"][0]["status"],
                         "duplicate_document_content_sha256")

    def test_duplicate_document_url_never_downloaded_twice(self):
        calls=[]
        def reader(*_args,**_kwargs):
            calls.append(1)
            return read_status()
        result=closeout(report(doc(PDF),doc(PDF)),receipt(),[],True,
                        reader=reader,today=TODAY)
        self.assertEqual(len(calls),1)
        self.assertEqual(result["documents_skipped_before_read"],1)

    def test_feed_missing_blocks_evidence_download_and_claims_of_absence(self):
        def forbidden(*_args,**_kwargs):
            raise AssertionError("no read during catalog outage")
        result=closeout(report(doc(PDF)),receipt(B_C_CASE),[],False,
                        reader=forbidden,today=TODAY)
        self.assertEqual(result["review_receipts"][0]["status"],"catalog_unavailable")
        self.assertIsNone(result["public_feed_rows"])
        self.assertEqual(result["new_pdf_cases_to_B"],0)
        self.assertEqual(result["new_publications"],0)

    def test_unreadable_document_is_not_declared_zero_vacancies(self):
        got=closeout(report(doc(PDF)),receipt(),[],True,
                     reader=lambda *_args,**_kwargs:{"decision":"robots_no_confirmado"},
                     today=TODAY)
        self.assertEqual(got["review_receipts"][0]["status"],
                         "reader_blocked_or_unavailable")
        self.assertEqual(got["new_pdf_cases_to_B"],0)

    def test_incomplete_pdf_is_review_not_approval(self):
        got=classify_document(doc(PDF),{
            **read_status("documento_parcial_revision_obligatoria",
                          extractor="pdf_preview_partial",deadline=None),
            "original_classification":"candidato_para_revision"
        },today=TODAY)
        self.assertEqual(got["status"],"document_ocr_or_full_review_required")
        self.assertEqual(got["owner"],"B")
        self.assertFalse(got["publication_eligible"])

    def test_old_pdf_url_without_deadline_cannot_prove_closure(self):
        stale=doc("https://munipuren.cl/wp-content/uploads/2026/02/bases-laborales.pdf",
                  "https://munipuren.cl/llamados-a-concurso-2026/")
        got=closeout(report(stale),receipt(),[],True,
                     reader=lambda *_args,**_kwargs:read_status(
                         "documento_antiguo_revision_vigencia"),today=TODAY)
        self.assertEqual(got["review_receipts"][0]["status"],
                         "document_evidence_requires_signed_review")
        self.assertEqual(got["new_pdf_cases_to_B"],1)
        self.assertIsNone(got["review_receipts"][0]["evidence_deadline"])

    def test_recent_publication_date_unconfirmed_in_pdf(self):
        got=classify_document(doc(PDF),read_status(
            "candidato_para_revision",origin="2026-11-08"),today=TODAY)
        self.assertEqual(got["evidence_source_date_unconfirmed"],"2026-11-08")
        self.assertFalse(got["publication_eligible"])


if __name__=="__main__":
    unittest.main()
