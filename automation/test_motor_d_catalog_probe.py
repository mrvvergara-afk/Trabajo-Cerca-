"""Offline regressions for the read-only Motor D public catalog preflight."""
import unittest
from motor_d_catalog_probe import (
    source_identity, check_ready_offers, read_full_feed
)


def offer(url="https://www.chiletrabajos.cl/trabajo/reponedor-traiguen-3924463"):
    return {"id_fuente": "d_12345678", "url_original": url,
            "cargo": "Reponedor PART TIME PARA TRAIGUEN", "empresa": "Cultiva",
            "comunas": ["Traiguén"]}


class CatalogProbeTests(unittest.TestCase):
    def test_chiletrabajos_aliases_share_job_identity(self):
        self.assertEqual(
            source_identity("https://www.chiletrabajos.cl/trabajo/3924463"),
            source_identity("https://www.chiletrabajos.cl/trabajo/part-time-para-traiguen-en-la-araucania-3924463"))
        self.assertEqual(
            source_identity("https://portal.chiletrabajos.cl/empresa/cultiva/trabajo/3924463"),
            source_identity("https://www.chiletrabajos.cl/trabajo/3924463"))
        self.assertIsNone(source_identity("http://127.0.0.1/offer"))

    def test_complete_catalog_recognizes_job_id_even_when_slug_changes(self):
        rows=[{"kind":"job_offer","url":"https://www.chiletrabajos.cl/trabajo/3924463",
               "title":"Different display title","company":"Cultiva",
               "workCommunes":["Traiguén"]}]
        self.assertEqual(
            check_ready_offers([offer()], rows, True)["d_12345678"],
            "already_published_source_identity")

    def test_complete_catalog_checks_exact_title_company_and_worksite(self):
        rows=[{"kind":"job_offer","url":"https://example.cl/different-source",
               "title":"Reponedor part time para Traiguen","company":"Cultiva",
               "workCommunes":["Traiguén"]}]
        self.assertEqual(
            check_ready_offers([offer()], rows, True)["d_12345678"],
            "already_published_semantic")

    def test_recruitment_commune_cannot_create_false_semantic_duplicate(self):
        # An OMIL's location is not evidence of actual job worksite.
        published=[{"kind":"job_offer","url":"https://example.cl/different",
                    "title":"Reponedor part time para Traiguen",
                    "company":"Cultiva","workCommunes":["Nacimiento"],
                    "recruitmentCommunes":["Traiguén"]}]
        self.assertEqual(
            check_ready_offers([offer()],published,True)["d_12345678"],
            "not_found_in_complete_feed")

    def test_same_title_elsewhere_is_not_a_local_duplicate(self):
        rows=[{"kind":"job_offer","url":"https://example.cl/different",
               "title":"Reponedor part time para Traiguen","company":"Cultiva",
               "workCommunes":["Punta Arenas"]}]
        self.assertEqual(
            check_ready_offers([offer()], rows, True)["d_12345678"],
            "not_found_in_complete_feed")

    def test_unavailable_catalog_cannot_prove_an_absent_offer(self):
        self.assertEqual(
            check_ready_offers([offer()], [], False)["d_12345678"],
            "catalog_unavailable")

    def test_paginated_catalog_requires_complete_unique_cursor(self):
        seen=[]
        def fetch(cursor):
            seen.append(cursor)
            if cursor is None:
                return {"items":[{"id":"1"}],"nextCursor":"page2","totalJobOffers":2}
            if cursor=="page2":
                return {"items":[{"id":"2"}],"nextCursor":None,"totalJobOffers":2}
            raise ValueError("unexpected cursor")
        rows,complete,error=read_full_feed(fetch)
        self.assertTrue(complete)
        self.assertEqual([x["id"] for x in rows],["1","2"])
        self.assertEqual(seen,[None,"page2"])
        self.assertIsNone(error)

    def test_real_pr_requires_complete_catalog_even_if_no_new_offers(self):
        from pathlib import Path
        workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/motor-d-territorial-daily.yml").read_text(encoding="utf-8")
        self.assertIn("PR_CATALOG_GATE_FAILED", workflow)
        self.assertIn("for attempt in range(3)", workflow)
        self.assertLess(workflow.index("if not complete:"), workflow.index("existing=check_ready_offers(ready,catalog,complete)"))

    def test_partial_or_degraded_feed_fails_closed(self):
        cases=[
            lambda cursor: {"items":[{"id":"1"}],"totalJobOffers":2},
            lambda cursor: {"items":[],"feedRebuilding":True},
            lambda cursor: {"items":[],"degraded":True},
            lambda cursor: {"items":[],"nextCursor":"loop"},
            lambda cursor: (_ for _ in ()).throw(TimeoutError("network timeout"))
        ]
        for fetch in cases:
            with self.subTest(fetch=fetch):
                rows,complete,reason=read_full_feed(fetch,max_pages=3)
                self.assertFalse(complete)
                self.assertEqual(rows,[])
                self.assertTrue(reason)


if __name__=="__main__":
    unittest.main()
