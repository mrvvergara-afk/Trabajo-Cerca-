"""Offline regression tests: daily and controlled recovery flows for Motor D."""
import json
import tempfile
import unittest
from unittest.mock import patch
from datetime import date
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
    def test_bad_candidate_does_not_abort_valid_offer_and_reports_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = engine.produce({"candidates": [None, record(1)]}, Path(tmp), TODAY)
            self.assertEqual(result["DESCARTADO"], 1)
            self.assertEqual(result["daily_batch_offers"], 1)
            self.assertEqual(result["review_reasons"]["DESCARTADO"]["registro_invalido"], 1)

    def test_non_list_inventory_is_rejected_before_writing(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "lista de candidatos"):
                engine.produce({"candidates": {"bad": True}}, Path(tmp), TODAY)
            self.assertFalse((Path(tmp) / "index.json").exists())

    def test_missing_original_date_explained_in_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = engine.produce({"candidates": [record(date_source=None)]}, Path(tmp), TODAY)
            self.assertEqual(result["daily_batch_offers"], 0)
            self.assertEqual(result["review_reasons"]["SEGUNDA_PASADA"]
                             ["fecha_original_no_acreditada; verificar fecha y vigencia"], 1)

    def test_confirmed_today_or_yesterday_enters_daily_express(self):
        for published in ("2026-11-06","2026-11-05"):
            with self.subTest(published=published):
                state,_,offer=engine.classify(record(date_source=published),TODAY)
                self.assertEqual(state,"EXPRESS")
                self.assertEqual(offer["tipo_lote"],"radar_diario")
                self.assertEqual(offer["fecha_descubrimiento"],TODAY.isoformat())

    def test_older_open_offer_enters_separate_recovery(self):
        state,reason,offer=engine.classify(record(date_source="2026-10-29"),TODAY)
        self.assertEqual(state,"RECUPERACION")
        self.assertEqual(reason,"oferta_antigua_vigente_no_descartar")
        self.assertEqual(offer["fecha_publicacion"],"2026-10-29")
        self.assertEqual(offer["fecha_descubrimiento"],"2026-11-06")
        self.assertEqual(offer["tipo_lote"],"recuperacion_vigente")

    def test_missing_original_date_is_second_pass_not_silently_discarded(self):
        state,reason,offer=engine.classify(record(date_source=None),TODAY)
        self.assertEqual(state,"SEGUNDA_PASADA")
        self.assertIn("fecha_original_no_acreditada",reason)
        self.assertIsNone(offer)

    def test_unconfirmed_city_cannot_be_inferred_from_omil(self):
        state,_,offer=engine.classify(record(work_commune=None,source_commune_not_confirmed=True),TODAY)
        self.assertEqual(state,"SEGUNDA_PASADA")
        self.assertIsNone(offer)

    def test_missing_employer_or_application_requires_second_pass_for_old_and_new(self):
        for published in ("2026-11-06","2026-10-29"):
            for patch in ({"employer":None},{"application_evidence":False}):
                with self.subTest(published=published,patch=patch):
                    self.assertEqual(engine.classify(record(date_source=published,**patch),TODAY)[0],"SEGUNDA_PASADA")

    def test_closed_or_internal_is_discarded_even_if_old(self):
        for patch in ({"index_status":"closed"},{"evidence":"internal_only"},{"evidence":"directory_not_offer"}):
            with self.subTest(patch=patch):
                self.assertEqual(engine.classify(record(date_source="2026-10-01",**patch),TODAY)[0],"DESCARTADO")

    def test_future_posting_date_requires_second_pass(self):
        self.assertEqual(engine.classify(record(date_source="2026-11-07"),TODAY)[0],"SEGUNDA_PASADA")

    def test_out_of_territory_arauco_not_queued(self):
        for title in ("Operador/a Excavadora - Caminos - Zona Valdivia",
                      "Brigadista Operador/a Motosierrista - Zona Constitución"):
            with self.subTest(title=title):
                item=record(title=title,work_commune=None,source_commune_not_confirmed=True)
                self.assertEqual(engine.classify(item,TODAY)[0],"DESCARTADO")

    def test_aliases_allowed_and_quilaco_excluded(self):
        self.assertEqual(engine.classify(record(work_commune="Collipulli"),TODAY)[0],"EXPRESS")
        self.assertEqual(engine.classify(record(work_commune="Negrete"),TODAY)[0],"EXPRESS")
        self.assertEqual(engine.classify(record(work_commune="Quilaco"),TODAY)[0],"SEGUNDA_PASADA")

    def test_locality_aliases_with_accents_and_case(self):
        for locality, expected in (("Mininco", "Collipulli"), ("MININCO", "Collipulli"),
                                   ("Coihue", "Negrete"), ("Coigüe", "Negrete"),
                                   ("COIGÜE", "Negrete")):
            with self.subTest(locality=locality):
                state, _, offer = engine.classify(record(work_commune=locality), TODAY)
                self.assertEqual(state, "EXPRESS")
                self.assertEqual(offer["comunas"], [expected])

    def test_reject_unsafe_url(self):
        self.assertIsNone(engine.canonical_url("http://example.org/oferta"))
        self.assertIsNone(engine.canonical_url("https://127.0.0.1/job"))
        self.assertIsNone(engine.canonical_url("https://localhost/job"))

    def test_same_offer_deduplicated_by_source_url(self):
        classified=engine.build({"candidates":[record(1),record(1)]},TODAY)
        self.assertEqual(len(classified["EXPRESS"]),1)
        self.assertEqual(len(classified["DUPLICADO"]),1)

    def test_same_job_deduplicated_by_title_company_and_territory_across_urls(self):
        first=record(1,title="Operario agrícola",date_source="2026-11-06")
        second=record(2,title="Operario agrícola",date_source="2026-10-30")
        classified=engine.build({"candidates":[first,second]},TODAY)
        self.assertEqual(len(classified["EXPRESS"]),1)
        self.assertEqual(len(classified["RECUPERACION"]),0)
        self.assertEqual(len(classified["DUPLICADO"]),1)

    def test_atomic_manifest_write_failure_keeps_previous_valid_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "index.json"
            engine.atomic_json_write(target, {"schema_version": 1, "batches": []})
            before = target.read_bytes()
            with patch.object(engine.os, "replace", side_effect=OSError("simulated interruption")):
                with self.assertRaises(OSError):
                    engine.atomic_json_write(target, {"schema_version": 1, "batches": [1]})
            self.assertEqual(target.read_bytes(), before)
            self.assertEqual(list(Path(tmp).glob(".motor_d_*.tmp")), [])

    def test_atomic_batch_write_is_valid_json_and_leaves_no_temp_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "20261106" / "motor-d-test.json"
            engine.atomic_json_write(target, {"offers": [{"cargo": "Operario"}]})
            self.assertEqual(json.loads(target.read_text(encoding="utf8"))["offers"][0]["cargo"], "Operario")
            self.assertEqual(list(target.parent.glob(".motor_d_*.tmp")), [])

    def test_full_manifest_does_not_write_unindexed_batch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            entries = [{"batch_id": f"motor-d-20261101-{i:018x}",
                        "file": f"20261101/motor-d-20261101-{i:018x}.json", "count": 0}
                       for i in range(256)]
            (root / "20261101").mkdir()
            for entry in entries:
                (root / entry["file"]).write_text(json.dumps({"offers": []}), encoding="utf8")
            engine.atomic_json_write(root / "index.json",
                                     {"schema_version": 1, "batches": entries, "seen_offer_ids": []})
            with self.assertRaisesRegex(RuntimeError, "Límite de manifiesto"):
                engine.produce({"candidates": [record()]}, root, TODAY)
            self.assertFalse((root / "20261106").exists())
            self.assertEqual(len(json.loads((root / "index.json").read_text())["batches"]), 256)

    def test_daily_and_recovery_are_written_to_separate_batches(self):
        with tempfile.TemporaryDirectory() as tmp:
            candidates=[record(i) for i in range(1,17)]
            candidates += [record(100,date_source="2026-10-29"),
                           record(101,date_source="2026-10-20")]
            result=engine.produce({"candidates":candidates},Path(tmp),TODAY)
            index=json.loads((Path(tmp)/"index.json").read_text(encoding="utf8"))
            self.assertEqual(result["EXPRESS"],16)
            self.assertEqual(result["RECUPERACION"],2)
            self.assertEqual(result["daily_batch_offers"],16)
            self.assertEqual(result["recovery_batch_offers"],2)
            self.assertEqual([x["count"] for x in index["batches"]],[15,1,2])
            self.assertEqual([x["batch_type"] for x in index["batches"]],["daily","daily","recovery"])
            recovery=json.loads((Path(tmp)/index["batches"][2]["file"]).read_text(encoding="utf8"))
            self.assertEqual(recovery["batch_type"],"recovery")
            self.assertEqual(recovery["offers"][0]["tipo_lote"],"recuperacion_vigente")
            self.assertEqual(len(index["seen_offer_ids"]),18)
            engine.produce({"candidates":candidates},Path(tmp),TODAY)
            index2=json.loads((Path(tmp)/"index.json").read_text(encoding="utf8"))
            self.assertEqual(len(index2["batches"]),3)
            self.assertEqual(result["published_confirmed"],0)

if __name__=="__main__":
    unittest.main()
