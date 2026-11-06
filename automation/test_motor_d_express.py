"""Offline regression tests: Motor D express classification and queue dedup."""
import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
import motor_d_express as engine

TODAY=date(2026,11,6)

def record(i=1, **patch):
    item={
        "url":f"https://municipio.example.cl/oferta-laboral-{i}",
        "http":200,
        "evidence":"individual_page_with_job_terms",
        "index_status":"open",
        "title":f"Operario agricola {i}",
        "employer":"Empresa Agricola",
        "work_commune":"Mulchén",
        "source_commune_not_confirmed":False,
        "application_evidence":True,
        "date_source":"2026-11-06"
    }
    item.update(patch)
    return item

class MotorDExpressTests(unittest.TestCase):
    def test_confirmed_individual_enters_express(self):
        state,why,offer=engine.classify(record(),TODAY)
        self.assertEqual(state,"EXPRESS")
        self.assertEqual(offer["comunas"],["Mulchén"])

    def test_unconfirmed_city_cannot_be_inferred_from_omil(self):
        state,_,offer=engine.classify(record(work_commune=None,source_commune_not_confirmed=True),TODAY)
        self.assertEqual(state,"SEGUNDA_PASADA")
        self.assertIsNone(offer)

    def test_missing_employer_or_application_requires_second_pass(self):
        for patch in ({"employer":None},{"application_evidence":False}):
            self.assertEqual(engine.classify(record(**patch),TODAY)[0],"SEGUNDA_PASADA")

    def test_closed_or_internal_is_discarded(self):
        for patch in ({"index_status":"closed"},{"evidence":"internal_only"},{"evidence":"directory_not_offer"}):
            self.assertEqual(engine.classify(record(**patch),TODAY)[0],"DESCARTADO")

    def test_date_window_is_exactly_today_and_yesterday(self):
        self.assertEqual(engine.classify(record(date_source="2026-11-05"),TODAY)[0],"EXPRESS")
        self.assertEqual(engine.classify(record(date_source="2026-11-04"),TODAY)[0],"DESCARTADO")
        self.assertEqual(engine.classify(record(date_source="2026-11-07"),TODAY)[0],"DESCARTADO")

    def test_old_posting_with_missing_fields_does_not_clog_second_pass(self):
        self.assertEqual(engine.classify(record(date_source="2026-11-01",employer=None,
            work_commune=None,source_commune_not_confirmed=True),TODAY)[0],"DESCARTADO")

    def test_new_links_for_out_of_territory_arauco_not_queued(self):
        for title in ("Operador/a Excavadora - Caminos - Zona Valdivia",
                      "Brigadista Operador/a Motosierrista - Zona Constitución"):
            with self.subTest(title=title):
                item=record(title=title,work_commune=None,source_commune_not_confirmed=True)
                self.assertEqual(engine.classify(item,TODAY)[0],"DESCARTADO")

    def test_aliases_are_allowed_as_normalized_communes(self):
        self.assertEqual(engine.classify(record(work_commune="Collipulli"),TODAY)[0],"EXPRESS")
        self.assertEqual(engine.classify(record(work_commune="Negrete"),TODAY)[0],"EXPRESS")
        self.assertEqual(engine.classify(record(work_commune="Quilaco"),TODAY)[0],"SEGUNDA_PASADA")

    def test_reject_unsafe_url(self):
        self.assertIsNone(engine.canonical_url("http://example.org/oferta"))
        self.assertIsNone(engine.canonical_url("https://127.0.0.1/job"))
        self.assertIsNone(engine.canonical_url("https://localhost/job"))

    def test_same_offer_deduplicated_before_batch(self):
        classified=engine.build({"candidates":[record(1),record(1)]},TODAY)
        self.assertEqual(len(classified["EXPRESS"]),1)
        self.assertEqual(len(classified["DUPLICADO"]),1)

    def test_sixteen_offers_split_in_two_persistent_batches(self):
        with tempfile.TemporaryDirectory() as tmp:
            report={"candidates":[record(i) for i in range(1,17)]}
            result=engine.produce(report,Path(tmp),TODAY)
            self.assertEqual(result["EXPRESS"],16)
            index=json.loads((Path(tmp)/"index.json").read_text(encoding="utf8"))
            self.assertEqual(len(index["batches"]),2)
            self.assertEqual([x["count"] for x in index["batches"]],[15,1])
            self.assertEqual(len(index["seen_offer_ids"]),16)
            engine.produce(report,Path(tmp),TODAY)
            index2=json.loads((Path(tmp)/"index.json").read_text(encoding="utf8"))
            self.assertEqual(len(index2["batches"]),2)
            self.assertEqual(result["published_confirmed"],0)

if __name__=="__main__":
    unittest.main()
