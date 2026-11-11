"""Regression for publication visibility without importing or altering any batch."""
import json
import tempfile
import unittest
from pathlib import Path

from qa_motor_d_manifest_public import load_batches, reconcile, READY


def batch(batch_id, records, quarantined=False):
    return {"batch_id":batch_id,"quarantined":quarantined,
            "offers":[{"id_fuente":id_,"cargo":title,"empresa":"Empresa",
                       "comunas":["Nacimiento"],"fecha_publicacion":"2026-11-09",
                       "url_original":url} for id_,title,url in records]}


class MotorDPublicationReconciliationTests(unittest.TestCase):
    def test_real_main_manifest_preserves_quarantine_and_recognizes_historical_overlap(self):
        batches=load_batches(READY)
        # This manifest grows whenever real approved batches are published.
        # Hardcoding the historical 12/58/34 counts caused CI to fail merely
        # because the seven new verified CMPC jobs created the 13th batch.
        self.assertGreaterEqual(len(batches),13)
        snap=reconcile(batches,[],False,"catalog_unavailable")
        actual_total=sum(len(b["offers"]) for b in batches)
        actual_held=sum(len(b["offers"]) for b in batches if b["quarantined"])
        self.assertEqual(snap["manifest_offer_records"],actual_total)
        self.assertEqual(snap["active_offer_records"],actual_total-actual_held)
        self.assertEqual(snap["quarantined_offer_records"],actual_held)
        self.assertEqual(snap["quarantined_batches"],2)
        self.assertEqual(actual_held,24)  # immutable quarantined history
        self.assertGreaterEqual(snap["active_offer_records"],41)
        self.assertGreaterEqual(len(snap["active_source_overlaps"]),2)
        self.assertEqual(snap["unexpected_active_source_overlaps"],[])
        self.assertGreaterEqual(len(snap["held_sources_also_in_active_batches"]),17)
        self.assertEqual(snap["active_status_counts"],{"catalog_unavailable":actual_total-actual_held})
        self.assertEqual(snap["created_publications_by_this_check"],0)

    def test_distinguishes_public_visibility_from_source_job_with_different_internal_id(self):
        seed="https://www.chiletrabajos.cl/trabajo/tecnico-nacimiento-3923358"
        batches=[batch("batch-1",[("d_a","Mecánico",seed)])]
        published=[{"kind":"job_offer","active":True,"id":"free-public-123",
                    "url":"https://www.chiletrabajos.cl/trabajo/3923358",
                    "title":"Mecánico","company":"Empresa","workCommunes":["Nacimiento"]}]
        result=reconcile(batches,published,True)
        self.assertEqual(result["active_status_counts"],{"visible_by_origin_identity":1})
        self.assertEqual(result["active_records"][0]["public_ids"],["free-public-123"])
        self.assertEqual(result["created_publications_by_this_check"],0)

    def test_exact_public_id_only_is_evidence_of_current_visibility_not_new_publication(self):
        batches=[batch("batch-2",[("d_A","Soldador","https://municipio.example/aviso")])]
        feed=[{"kind":"job_offer","id":"chatgpt_d_A","active":True,"url":"https://other.example/work"}]
        snap=reconcile(batches,feed,True)
        self.assertEqual(snap["active_status_counts"],{"visible_by_public_id":1})
        self.assertEqual(snap["created_publications_by_this_check"],0)

    def test_recruitment_commune_cannot_prove_semantic_duplication(self):
        batches=[batch("batch-3",[("d_a","Operario","https://example.cl/a")])]
        row={"kind":"job_offer","id":"public-123","active":True,"title":"Operario",
             "company":"Empresa","workCommunes":["Angol"],
             "recruitmentCommunes":["Nacimiento"],"url":"https://example.cl/b"}
        snap=reconcile(batches,[row],True)
        self.assertEqual(snap["active_status_counts"],{"not_found_in_complete_public_feed":1})

    def test_exact_semantic_is_uncertain_not_confirmed_by_source_identity(self):
        batches=[batch("batch-3",[("d_a","Operario","https://example.cl/a")])]
        row={"kind":"job_offer","id":"public-123","active":True,"title":"Operario",
             "company":"Empresa","workCommunes":["Nacimiento"],"url":"https://example.cl/b"}
        snap=reconcile(batches,[row],True)
        self.assertEqual(snap["active_status_counts"],{"possible_semantic_match_not_confirmed":1})

    def test_inactive_public_row_does_not_count_as_current_visibility(self):
        batches=[batch("batch-4",[("d_a","Operario","https://example.cl/a")])]
        row={"kind":"job_offer","id":"public-123","active":False,"url":"https://example.cl/a"}
        snap=reconcile(batches,[row],True)
        self.assertEqual(snap["active_status_counts"],{"not_found_in_complete_public_feed":1})

    def test_new_duplicate_origin_across_active_batches_is_not_silenced(self):
        target="https://www.chiletrabajos.cl/trabajo/operador-collipulli-3999112"
        rows=[batch("old",[("d_1","Operador",target)]),
              batch("new",[("newid","Operador","https://www.chiletrabajos.cl/trabajo/3999112")])]
        snap=reconcile(rows,[],True)
        self.assertEqual(len(snap["unexpected_active_source_overlaps"]),1)
        self.assertEqual(snap["unexpected_active_source_overlaps"][0]["origin_identity"],
                         "chiletrabajos:3999112")

    def test_quarantined_offer_never_counts_as_publication_or_active(self):
        target="https://www.chiletrabajos.cl/trabajo/oferta-3999101"
        batches=[batch("held",[("id1","Operario",target)],True),
                 batch("live",[("id2","Operario","https://www.chiletrabajos.cl/trabajo/3999101")])]
        snap=reconcile(batches,[],False,"feed_down")
        self.assertEqual(snap["active_offer_records"],1)
        self.assertEqual(snap["quarantined_offer_records"],1)
        self.assertEqual(snap["held_sources_also_in_active_batches"],["chiletrabajos:3999101"])
        self.assertEqual(snap["quarantined_records"][0]["status"],
                         "quarantined_not_authorized_for_import")

    def test_duplicate_public_source_id_is_alert_even_with_different_slugs(self):
        target="https://www.chiletrabajos.cl/trabajo/oferta-3999101"
        rows=[{"kind":"job_offer","id":id_,"url":url}
              for id_,url in (("public-A",target),
                              ("public-B","https://www.chiletrabajos.cl/trabajo/3999101"))]
        snap=reconcile([batch("batch",[("d_1","Operario",target)])],rows,True)
        self.assertEqual(len(snap["public_source_duplicate_ids"]),1)
        self.assertEqual(snap["public_source_duplicate_ids"][0]["count"],2)

    def test_untrusted_manifest_path_or_missing_quarantine_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/"index.json").write_text(json.dumps({
                "schema_version":1,
                "batches":[{"batch_id":"motor-d-20261109-abcdef0123456789ab",
                            "file":"../../secret.json","count":1}],
                "quarantined_batches":[]}),encoding="utf-8")
            with self.assertRaises(ValueError):
                load_batches(root)
            (root/"index.json").write_text(json.dumps({
                "schema_version":1,"batches":[],
                "quarantined_batches":[{"batch_id":"missing"}]}),encoding="utf-8")
            with self.assertRaises(ValueError):
                load_batches(root)


if __name__=="__main__":
    unittest.main()
