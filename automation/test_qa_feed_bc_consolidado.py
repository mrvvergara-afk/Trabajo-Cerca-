"""Pruebas aisladas para el control consolidado de catálogo y motores."""
import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
from unittest.mock import patch

FILE = pathlib.Path(__file__).with_name("qa_feed_bc_consolidado.py")
SPEC = importlib.util.spec_from_file_location("qa_feed_bc_consolidado", FILE)
qa = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(qa)


def scenario(feed=None, a=None, bc=None):
    pages = {
        "/api/listings?fresh=1": feed if feed is not None else {
            "items": [{"id": "job-1"}], "totalJobOffers": 1, "hasMore": False
        },
        "/api/ops/free-public-sources": a if a is not None else {
            "checkedAt": "2026-11-10T20:38:18Z",
            "summary": {"verified": 2, "stored": 2, "published": 0}
        },
        "/api/ops/fast-bc": bc if bc is not None else {
            "historicalQueuesReopened": False,
            "htmlLastBatch": {"found": 8, "checked": 3, "verified": 0, "legacyRecovered": 2}
        },
    }
    output = io.StringIO()
    with patch.object(qa, "get", side_effect=lambda path: pages[path]):
        with contextlib.redirect_stdout(output):
            exit_code = qa.main()
    return exit_code, json.loads(output.getvalue())


class FeedBCConsolidadoTests(unittest.TestCase):
    def test_healthy_feed_and_bc(self):
        code, report = scenario()
        self.assertEqual(code, 0)
        self.assertEqual(report["failures"], [])
        self.assertEqual(report["A"]["published"], 0)

    def test_rebuilding_empty_feed_fails(self):
        code, report = scenario(feed={
            "items": [], "degraded": True, "feedRebuilding": True,
            "totalJobOffers": 0
        })
        self.assertEqual(code, 1)
        self.assertTrue(any("reconstruccion" in x for x in report["failures"]))

    def test_missing_pagination_cursor_fails(self):
        code, report = scenario(feed={
            "items": [{"id": "job-1"}], "totalJobOffers": 30, "hasMore": True
        })
        self.assertEqual(code, 1)
        self.assertTrue(any("nextCursor" in x for x in report["failures"]))

    def test_bc_metrics_inconsistent_fails(self):
        code, report = scenario(bc={
            "historicalQueuesReopened": False,
            "htmlLastBatch": {"found": 8, "checked": 1, "verified": 2, "legacyRecovered": 3}
        })
        self.assertEqual(code, 1)
        self.assertTrue(any("verificadas supera" in x for x in report["failures"]))
        self.assertTrue(any("recuperadas supera" in x for x in report["failures"]))

    def test_duplicate_ids_same_page(self):
        code, report = scenario(feed={
            "items": [{"id": "a"}, {"id": "a"}], "totalJobOffers": 2, "hasMore": False
        })
        self.assertEqual(code, 1)
        self.assertTrue(any("identificadores duplicados" in x for x in report["failures"]))

    def test_a_published_exceeds_stored(self):
        code, report = scenario(a={
            "summary": {"verified": 2, "stored": 1, "published": 2}
        })
        self.assertEqual(code, 1)
        self.assertTrue(any("incoherencia" in x for x in report["failures"]))

    def test_bc_index_page_must_not_publish(self):
        code, report = scenario(bc={
            "historicalQueuesReopened": False,
            "htmlLastBatch": {
                "found": 1, "checked": 1, "verified": 1,
                "outcomes": [{"url": "https://ssan.redsalud.gob.cl/trabaje-con-nosotros/", "decision": "verified_for_public_feed"}]
            }
        })
        self.assertEqual(code, 1)
        self.assertTrue(any("pagina indice" in x for x in report["failures"]))

    def test_cross_page_duplicates(self):
        feed = {"items": [{"id": "a"}], "totalJobOffers": 2,
                "hasMore": True, "nextCursor": "v2:test:1"}
        pages = {
            "/api/listings?fresh=1": feed,
            "/api/listings?cursor=v2%3Atest%3A1": {"items": [{"id": "a"}]},
            "/api/ops/free-public-sources": {"summary": {"verified": 0, "stored": 0, "published": 0}},
            "/api/ops/fast-bc": {"historicalQueuesReopened": False, "htmlLastBatch": {}},
        }
        output = io.StringIO()
        with patch.object(qa, "get", side_effect=lambda path: pages[path]):
            with contextlib.redirect_stdout(output):
                code = qa.main()
        self.assertEqual(code, 1)
        self.assertTrue(any("duplicadas entre paginas" in x for x in json.loads(output.getvalue())["failures"]))

    def test_historical_queues_not_reopened(self):
        code, report = scenario(bc={
            "historicalQueuesReopened": True,
            "htmlLastBatch": {"found": 0, "checked": 0, "verified": 0}
        })
        self.assertEqual(code, 1)
        self.assertTrue(any("colas historicas" in x for x in report["failures"]))


if __name__ == "__main__":
    unittest.main()
