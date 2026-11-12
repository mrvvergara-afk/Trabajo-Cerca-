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

    def test_official_conaf_career_index_is_permanently_registered_for_all_12_towns(self):
        import motor_d_territorial_daily as d
        from motor_d_source_registry import plan
        from motor_d_social_sources import SOURCES
        all_sources=plan(d.SEEDS,d.INDEED_SEEDS,social_refs=SOURCES)
        conaf=[x for x in all_sources["public"] if
               x["url"]=="https://www.conaf.cl/quienes-somos/concursos-laborales/"]
        self.assertEqual(len(conaf),1)
        self.assertEqual(set(conaf[0]["communes"]),set(COMMUNES))
        self.assertIn("daily",conaf[0]["origins"])

    def test_partial_index_never_counts_as_complete_source_coverage(self):
        from bs4 import BeautifulSoup
        from unittest.mock import patch
        import motor_d_territorial_daily as d
        from motor_d_source_registry import assess
        url="https://empleos.ejemplo.cl/convocatorias"
        body="<html><h1>Ofertas laborales</h1>"+ "".join(
            '<a href="/vacante/'+str(i)+'">Oferta laboral operario '+str(i)+'</a>'
            for i in range(44))+"</html>"
        catalog=BeautifulSoup(body,"html.parser")
        detail=BeautifulSoup("<h1>Oferta laboral operario</h1><p>Requisitos de trabajo</p>","html.parser")
        with patch.object(d,"request_page",side_effect=lambda u:
                          (200,catalog,None) if u==url else (200,detail,None)):
            report=d.inspect(("Angol","Ofertas empleo",url))
        self.assertEqual(report["index_candidates_detected"],44)
        self.assertEqual(report["links_found"],35)
        self.assertTrue(report["index_incomplete"])
        self.assertEqual(report["status"],"scanned_partial_index")
        source={"id":performance_key(url),"url":url,"name":"Ofertas empleo",
                "communes":list(COMMUNES),"anchor":"Angol","kind":"portal"}
        inventory={"public":[source],"social":[],"historical_job_links":0,
                   "unregistered_publishers":[]}
        cover=assess(inventory,[report],{})
        self.assertEqual(cover["unresolved_total"],1)
        self.assertEqual(cover["pending"][0]["status"],"index_pagination_required")
        pending=build_recovery_queue(cover,WHEN)
        self.assertEqual(pending["group_counts"],{"partial_index":1})
        self.assertTrue(all(pending["per_commune"][t]["pending"]==1 for t in COMMUNES))

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
