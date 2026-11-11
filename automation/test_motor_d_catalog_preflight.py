"""Safety gate: complete public catalog is mandatory before producer stages jobs.

No network; use mocked read-only feed and isolated temporary directories.
"""
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date,datetime
from pathlib import Path
from unittest.mock import patch

import motor_d_express as producer
from motor_d_source_registry import learn,score

TODAY=date(2026,11,11)

class FixedClock(datetime):
    @classmethod
    def now(cls,tz=None):
        from zoneinfo import ZoneInfo
        fixed=datetime(2026,11,11,19,40,tzinfo=ZoneInfo("America/Santiago"))
        return fixed.astimezone(tz) if tz else fixed

URL="https://portal.chiletrabajos.cl/empresa/serfonac/trabajo/practica-contador-auditor-nacimiento-3911316"

def candidate(num=1,**kwargs):
    obj={
        "url": URL if num==1 else "https://www.chiletrabajos.cl/trabajo/operario-3919999",
        "http":200,"evidence":"individual_page_with_job_terms",
        "index_status":"open",
        "title":"Práctica Contador Auditor - Nacimiento" if num==1 else "Operario Mantenedor Nacimiento",
        "employer":"Serfonac","work_commune":"Nacimiento",
        "source_commune_not_confirmed":False,"application_evidence":True,
        "date_source":"2026-11-05","deadline":"2027-01-19"
    }
    obj.update(kwargs)
    return obj

class CatalogGateTests(unittest.TestCase):
    def test_preexisting_source_identity_never_stages_redundant_batch(self):
        source=candidate()
        key=producer.classify(source,TODAY)[2]["id_fuente"]
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            result=producer.produce(
                {"candidates":[source]},root,TODAY,
                publication_statuses={key:"already_published_source_identity"})
            self.assertEqual(result["recovery_batch_offers"],0)
            self.assertEqual(result["public_catalog_duplicates_skipped"],1)
            self.assertTrue(result["complete_public_catalog_checked"])
            manifest=json.loads((root/"index.json").read_text(encoding="utf-8"))
            self.assertEqual(len(manifest["batches"]),0)

    def test_semantic_duplicate_skipped_but_new_offer_staged(self):
        old,new=candidate(1),candidate(2)
        a=producer.classify(old,TODAY)[2]["id_fuente"]
        b=producer.classify(new,TODAY)[2]["id_fuente"]
        with tempfile.TemporaryDirectory() as folder:
            result=producer.produce(
                {"candidates":[old,new]},Path(folder),TODAY,
                publication_statuses={a:"already_published_semantic",
                                      b:"not_found_in_complete_feed"})
            self.assertEqual(result["recovery_batch_offers"],1)
            self.assertEqual(result["public_catalog_duplicates_skipped"],1)
            index=json.loads((Path(folder)/"index.json").read_text())
            self.assertEqual(index["seen_offer_ids"],[b])

    def test_unknown_catalog_status_fails_before_creating_batch(self):
        old=candidate()
        key=producer.classify(old,TODAY)[2]["id_fuente"]
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError,"unverified_public_catalog_status"):
                producer.produce(
                    {"candidates":[old]},Path(folder),TODAY,
                    publication_statuses={key:"catalog_unavailable"})
            self.assertFalse((Path(folder)/"index.json").exists())

    def test_invalid_catalog_statuses_cannot_enable_publication(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError,"catalog_statuses_invalid"):
                producer.produce(
                    {"candidates":[candidate()]},Path(folder),TODAY,
                    publication_statuses=["not_found_in_complete_feed"])
            self.assertFalse((Path(folder)/"index.json").exists())

    def test_actual_job_source_identity_unifies_aggregator_aliases(self):
        from motor_d_catalog_probe import source_identity
        other="https://www.chiletrabajos.cl/trabajo/practica-contador-auditor-nacimiento-3911316"
        self.assertEqual(source_identity(URL),source_identity(other))

    def test_source_ranking_rewards_complete_job_not_keyword_hits(self):
        complete=candidate(2)
        incomplete=dict(candidate(1),date_source=None,application_evidence=False)
        good_source={"id":"src-good","url":"https://portal.chiletrabajos.cl/empresa/serfonac/ofertas","kind":"portal"}
        poor_source={"id":"src-poor","url":"https://cl.indeed.com/jobs?l=Nacimiento","kind":"portal"}
        from motor_d_source_registry import performance_key
        good_source["id"]=performance_key(good_source["url"])
        poor_source["id"]=performance_key(poor_source["url"])
        data=learn({},[
            {"url":good_source["url"],"status":"scanned_with_candidates","candidates":[complete]},
            {"url":poor_source["url"],"status":"scanned_with_candidates","candidates":[incomplete]}
        ],"2026-11-11T19:39:00-03:00")
        self.assertEqual(data[good_source["id"]]["ready"],1)
        self.assertEqual(data[poor_source["id"]]["ready"],0)
        self.assertGreater(score(good_source,data),score(poor_source,data))
        twice=learn(data,[{"url":good_source["url"],"status":"scanned_with_candidates","candidates":[complete]}],
                    "2026-11-11T20:40:00-03:00")
        self.assertEqual(twice[good_source["id"]]["ready"],1)

    def test_main_unavailable_catalog_never_stages(self):
        report={"date":"2026-11-11T19:30:00-03:00","candidates":[candidate()]}
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            (root/"territorial_daily.json").write_text(json.dumps(report),encoding="utf-8")
            with patch.object(producer,"ROOT",root),patch.object(producer,"READY",root/"ready"),\
                 patch("motor_d_catalog_probe.read_full_feed",return_value=([],False,"feed_incomplete")),\
                 patch("time.sleep",return_value=None),\
                 patch.object(producer,"datetime",FixedClock):
                with redirect_stdout(io.StringIO()) as out:producer.main()
            self.assertIn("blocked_catalog_incomplete",out.getvalue())
            self.assertFalse((root/"ready"/"index.json").exists())
            gate=json.loads((root/"publication_gate.json").read_text(encoding="utf-8"))
            self.assertEqual(gate["state"],"blocked_catalog_incomplete")
            self.assertFalse(gate["feed_complete"])
            self.assertEqual(gate["ready_batch_offers_staged"],0)
            self.assertEqual(gate["eligible_before_catalog"],1)

    def test_main_complete_feed_stages_only_missing_candidate(self):
        # Production's complete catalog contains the first SERFONAC vacancy,
        # but the second Nacimiento offer is not in it.
        a,b=candidate(1),candidate(2)
        report={"date":"2026-11-11T19:30:00-03:00","candidates":[a,b]}
        feed=[{"kind":"job_offer","title":a["title"],"company":"Serfonac",
               "url":a["url"],"workCommunes":["Nacimiento"]}]
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            (root/"territorial_daily.json").write_text(json.dumps(report),encoding="utf-8")
            with patch.object(producer,"ROOT",root),patch.object(producer,"READY",root/"ready"),\
                 patch("motor_d_catalog_probe.read_full_feed",return_value=(feed,True,None)),\
                 patch.object(producer,"datetime",FixedClock):
                with redirect_stdout(io.StringIO()):producer.main()
            index=json.loads((root/"ready"/"index.json").read_text(encoding="utf-8"))
            self.assertEqual(len(index["batches"]),1)
            payload=json.loads((root/"ready"/index["batches"][0]["file"]).read_text(encoding="utf-8"))
            self.assertEqual(len(payload["offers"]),1)
            self.assertEqual(payload["offers"][0]["url_original"],b["url"])
            gate=json.loads((root/"publication_gate.json").read_text(encoding="utf-8"))
            self.assertEqual(gate["state"],"completed")
            self.assertTrue(gate["feed_complete"])
            self.assertEqual(gate["eligible_before_catalog"],2)
            self.assertEqual(gate["already_published_skipped"],1)
            self.assertEqual(gate["ready_batch_offers_staged"],1)

if __name__=="__main__":
    unittest.main()
