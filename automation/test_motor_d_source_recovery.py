"""Reconcile historical zero-yield ranking; preserve all blocked sources."""
import json
import unittest
from pathlib import Path

from motor_d_source_registry import COMMUNES,learn,performance_key,score
from motor_d_source_recovery import build_recovery_queue,recovery_category

REPORT=Path(__file__).resolve().parent/"motor_d_discovery"/"territorial_daily.json"
WHEN="2026-11-11T21:19:00-03:00"
EMPLOYER_URL="https://portal.chiletrabajos.cl/empresa/serfonac/ofertas"
JOB_URL="https://portal.chiletrabajos.cl/empresa/serfonac/trabajo/mecanico-nacimiento-3923358"

def verified_job(**changes):
    row={
        "id":"84c0f7db2dec86a56a12","url":JOB_URL,"http":200,
        "evidence":"individual_page_with_job_terms","index_status":"open",
        "title":"Mecánico de maquinaria Nacimiento","employer":"Serfonac",
        "work_commune":"Nacimiento","source_commune_not_confirmed":False,
        "date_source":"2026-11-05","deadline":"2027-01-19",
        "application_evidence":True,
        "express_ready":False,
    }
    row.update(changes)
    return row

def scan(rows,source=EMPLOYER_URL):
    return {"url":source,"status":"scanned_with_candidates","candidates":rows}

def stub_inventory():
    pending=[
        {"id":"portal1","name":"Indeed","url":"https://cl.indeed.com/jobs?l=Angol",
         "status":"blocked_or_failed","communes":["Angol"]},
        {"id":"portal2","name":"Computrabajo","url":"https://cl.computrabajo.com/empleos-en-angol",
         "status":"blocked_or_failed","communes":["Angol"]},
        {"id":"official3","name":"Sitio público","url":"https://ejemplo.gov.cl/empleos",
         "status":"blocked_or_failed","communes":["Nacimiento"]},
        {"id":"social4","name":"OMIL Nacimiento","url":"https://www.instagram.com/omilnacimiento",
         "status":"requires_authorized_reader","communes":["Nacimiento"]},
        {"id":"special5","name":"CMPC","url":"https://cmpc.csod.com/careers",
         "status":"requires_specialized_reader","communes":["Collipulli","Nacimiento"]},
        {"id":"filter6","name":"Mipleo","url":"https://www.mipleo.cl/ofertas",
         "status":"needs_territorial_filter","communes":list(COMMUNES)},
    ]
    return {"registered_total":12,"unresolved_total":len(pending),
            "pending":pending,"per_commune":{x:{"registered":1} for x in COMMUNES}}

class RecoveryAndRankingTests(unittest.TestCase):
    def test_ranking_migrates_old_eligible_jobs_previously_marked_express_false(self):
        key=performance_key(EMPLOYER_URL)
        # Old state already saw the source ID while ready was permanently 0.
        old={key:{"attempts":4,"ready":0,"individual":1,"blocked":0,
                  "seen_candidate_ids":["84c0f7db2dec86a56a12"]}}
        first=learn(old,[scan([verified_job()])],WHEN)
        self.assertEqual(first[key]["ready"],1)
        self.assertEqual(first[key]["new_verified_this_scan"],1)
        self.assertEqual(first[key]["individual"],1)
        self.assertEqual(first[key]["seen_eligible_candidate_ids"],["chiletrabajos:3923358"])
        second=learn(first,[scan([verified_job()])],WHEN)
        self.assertEqual(second[key]["ready"],1)
        self.assertEqual(second[key]["new_verified_this_scan"],0)
        self.assertEqual(second[key]["individual"],1)

    def test_ranking_prefers_eligible_recovery_over_raw_keywords(self):
        other="https://cl.indeed.com/jobs?l=Angol"
        rows=[scan([verified_job()]),scan([verified_job(
              url="https://www.chiletrabajos.cl/trabajo/ninguna-fecha-3991112",
              date_source=None,employer=None,express_ready=True)],other)]
        stats=learn({},rows,WHEN)
        good={"id":performance_key(EMPLOYER_URL),"kind":"portal"}
        bad={"id":performance_key(other),"kind":"portal"}
        self.assertEqual(stats[good["id"]]["ready"],1)
        self.assertEqual(stats[bad["id"]]["ready"],0)
        self.assertGreater(score(good,stats),score(bad,stats))

    def test_duplicate_employer_aliases_count_one_individual_job(self):
        source=EMPLOYER_URL
        alias=verified_job(id="changed-display-id",
                           url="https://www.chiletrabajos.cl/trabajo/mecanico-nacimiento-3923358")
        stats=learn({},[scan([verified_job(),alias])],WHEN)
        self.assertEqual(stats[performance_key(source)]["ready"],1)
        self.assertEqual(stats[performance_key(source)]["individual"],1)

    def test_recovery_queue_categorizes_every_pending_without_falsifying_access(self):
        full=stub_inventory()
        a=build_recovery_queue(full,WHEN)
        self.assertEqual(a["total_pending"],6)
        self.assertTrue(a["all_sources_preserved"])
        self.assertTrue(a["no_blocked_or_unread_source_claimed_recovered"])
        self.assertEqual(a["group_counts"],{
            "failed_public_source":1,"regional_query":1,"restricted_job_portal":2,
            "social_reference":1,"specialized_reader":1})
        self.assertEqual([x["priority_tier"] for x in a["tasks"]],[1,2,3,4,4,5])
        self.assertEqual(a["per_commune"]["Nacimiento"]["pending"],4)
        self.assertEqual(a["per_commune"]["Angol"]["pending"],3)
        self.assertTrue(all(x["recovered"] is False for x in a["tasks"]))

    def test_recovery_queue_refuses_to_erase_missing_communes(self):
        x=stub_inventory();del x["per_commune"]["Angol"]
        with self.assertRaisesRegex(ValueError,"incomplete_12_commune_inventory"):
            build_recovery_queue(x,WHEN)

    def test_recovery_queue_rejects_duplicate_or_mismatched_pending_records(self):
        x=stub_inventory()
        x["pending"][1]["id"]=x["pending"][0]["id"]
        with self.assertRaisesRegex(ValueError,"missing_or_duplicate_source_id"):
            build_recovery_queue(x,WHEN)
        x=stub_inventory()
        x["unresolved_total"]=5
        with self.assertRaisesRegex(ValueError,"recovery_roster_does_not_match_scan"):
            build_recovery_queue(x,WHEN)

    def test_bad_unresolved_state_is_not_silently_classified_as_success(self):
        with self.assertRaisesRegex(ValueError,"unexpected_unresolved_source_status"):
            recovery_category({"status":"accessible"})

    def test_real_12_commune_inventory_recovery_queue_has_no_loss(self):
        scan_report=json.loads(REPORT.read_text(encoding="utf-8"))
        inventory=scan_report["source_inventory"]
        recovery=build_recovery_queue(inventory,scan_report["date"])
        self.assertEqual(len(recovery["tasks"]),inventory["unresolved_total"])
        self.assertEqual(set(x["id"] for x in recovery["tasks"]),
                         set(x["id"] for x in inventory["pending"]))
        self.assertEqual(set(recovery["per_commune"]),set(COMMUNES))
        self.assertEqual(recovery["group_counts"]["social_reference"],
                         inventory["social_registered"])
        self.assertEqual(sum(recovery["group_counts"].values()),inventory["unresolved_total"])

if __name__=="__main__":
    unittest.main()
