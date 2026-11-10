"""Offline quality gates for the first 51 Motor D second-pass candidates."""
import json
import unittest
from datetime import date
from pathlib import Path
from motor_d_express import build
from qa_motor_d_second_pass import reconcile


def candidate(url, title="Operario", employer=None, work=None,
              original=None, source="Municipio Ejemplo", apply=False):
    return {
        "url":url, "title":title, "employer":employer, "work_commune":work,
        "date_source":original,"source":source,"deadline":None,
        "evidence":"individual_page_with_job_terms","http":200,
        "index_status":"open","source_commune_not_confirmed":work is None,
        "application_evidence":apply,
    }


def report(*items):
    return {"date":"2026-11-09T18:51:47-03:00","candidates":list(items)}


class SecondPassTests(unittest.TestCase):
    def test_actual_report_all_second_pass_records_are_accounted_for(self):
        root=Path(__file__).resolve().parent
        source=json.loads((root/"motor_d_discovery"/"territorial_daily.json").read_text(encoding="utf8"))
        expected=len(build(source,date.fromisoformat(source["date"][:10]))["SEGUNDA_PASADA"])
        output=reconcile(source,[],False,"outage")
        self.assertEqual(output["second_pass_count"],expected)
        self.assertEqual(sum(output["status_counts"].values()),expected)
        self.assertEqual(len({x["url"] for x in output["records"]}),expected)
        self.assertEqual(output["status_counts"],{"catalog_unavailable":expected})
        self.assertEqual(output["published_by_this_check"],0)
        self.assertFalse(output["quarantine_touched"])

    def test_portal_job_found_in_public_feed_closes_without_duplicate_import(self):
        job=candidate("https://www.chiletrabajos.cl/trabajo/conductor-nacimiento-3923758",
                      "Conductor de Transporte - Nacimiento","Serfonac Ltda",
                      original="2026-11-05",source="Chiletrabajos",apply=True)
        feed=[{"kind":"job_offer","active":True,"id":"chatgpt_3923758",
               "url":"https://www.chiletrabajos.cl/trabajo/3923758",
               "title":"Conductor","company":"Serfonac"}]
        result=reconcile(report(job),feed,True)
        row=result["records"][0]
        self.assertEqual(row["status"],"already_public_confirmed")
        self.assertEqual(row["public_ids_exact_origin"],["chatgpt_3923758"])
        self.assertIsNone(row["owner"])
        self.assertFalse(row["publication_eligible"])

    def test_two_public_ids_for_one_original_job_are_flagged(self):
        job=candidate("https://www.chiletrabajos.cl/trabajo/operario-3923758")
        feed=[{"kind":"job_offer","active":True,"id":id_,
               "url":"https://www.chiletrabajos.cl/trabajo/3923758"}
              for id_ in ("public1","public2")]
        row=reconcile(report(job),feed,True)["records"][0]
        self.assertEqual(row["status"],"public_source_duplicate_needs_resolution")
        self.assertEqual(row["owner"],"C")

    def test_fashionspark_valid_local_offer_unknown_date_not_discarded(self):
        job=candidate("https://fashionspark.hiringroom.com/jobs/get_vacancy/test0001",
                      "Asistente de Aseo PT 20 HR (Angol)",
                      "Fashion's Park","Angol",None,
                      "Fashion's Park · portal oficial de contratación",True)
        row=reconcile(report(job),[],True)["records"][0]
        self.assertEqual(row["status"],"official_ats_original_date_unknown_review")
        self.assertIn("original_publication_date_unknown",row["missing_evidence"])
        self.assertIsNone(row["original_publication_date"])
        self.assertEqual(row["discovery_report_date"],"2026-11-09")
        self.assertEqual(row["owner"],"C")
        self.assertFalse(row["publication_eligible"])

    def test_informational_page_is_not_mislabelled_job(self):
        job=candidate("https://victoriachile.cl/bodega-municipal/", "Bodega Municipal")
        row=reconcile(report(job),[],True)["records"][0]
        self.assertEqual(row["status"],"informational_page_not_individual_job")
        self.assertIsNone(row["owner"])

    def test_explicit_out_of_territory_job_is_not_sent_for_publication(self):
        job=candidate("https://jobs.arauco.com/Chile/job/operador",
                      "Operador Mantenedor Zona Valdivia","ARAUCO",
                      None,None,"Arauco empleo")
        row=reconcile(report(job),[],True)["records"][0]
        self.assertEqual(row["status"],"outside_12_communes_explicit_title")
        self.assertFalse(row["publication_eligible"])
        self.assertIsNone(row["owner"])

    def test_municipal_contest_requires_documental_review(self):
        job=candidate("https://mtraiguen.cl/municipalidad/bases-concurso/",
                      "Bases para llamado a Concurso Público de 3 Cargos.")
        row=reconcile(report(job),[],True)["records"][0]
        self.assertEqual(row["status"],"document_or_multi_position_review")
        self.assertEqual(row["owner"],"B")

    def test_explicit_commune_mismatch_never_approved(self):
        job=candidate("https://www.chiletrabajos.cl/trabajo/psicologo-comuna-ercilla-3999111",
                      "Psicólogo/a Organizacional - Comuna Ercilla",
                      "Empresa","Angol","2026-11-02","Chiletrabajos",True)
        row=reconcile(report(job),[],True)["records"][0]
        self.assertEqual(row["status"],"territorial_conflict_review")
        self.assertEqual(row["owner"],"C")

    def test_missing_feed_status_is_never_assumed_absent(self):
        job=candidate("https://www.chiletrabajos.cl/trabajo/operario-3999111")
        snap=reconcile(report(job),[],False,"feed_incomplete")
        self.assertEqual(snap["status_counts"],{"catalog_unavailable":1})
        self.assertEqual(snap["public_feed_error"],"feed_incomplete")
        self.assertIsNone(snap["public_feed_rows"])

    def test_semantic_overlap_is_not_certified_as_same_job(self):
        job=candidate("https://example.cl/operario", "Operario","Empresa",
                      "Nacimiento",None,"Municipio",True)
        feed=[{"id":"public123","kind":"job_offer","active":True,
               "title":"Operario","company":"Empresa",
               "workCommunes":["Nacimiento"],"url":"https://other.example/different"}]
        row=reconcile(report(job),feed,True)["records"][0]
        self.assertEqual(row["status"],"possible_semantic_duplicate_needs_review")
        self.assertEqual(row["public_ids_possible_semantic"],["public123"])

    def test_recruitment_commune_is_not_execution_proof(self):
        job=candidate("https://example.cl/operario","Operario","Empresa",
                      "Nacimiento",None,"Municipio",True)
        feed=[{"id":"public123","kind":"job_offer","active":True,
               "title":"Operario","company":"Empresa",
               "workCommunes":["Angol"],"recruitmentCommunes":["Nacimiento"],
               "url":"https://other.example/different"}]
        row=reconcile(report(job),feed,True)["records"][0]
        self.assertEqual(row["status"],"missing_source_evidence_review")

    def test_future_publication_date_from_other_source_is_never_substituted(self):
        job=candidate("https://example.cl/operario","Operario","Empresa",
                      "Nacimiento",None,"Municipio",True)
        row=reconcile(report(job),[],True)["records"][0]
        self.assertIsNone(row["original_publication_date"])
        self.assertFalse(row["publication_eligible"])


if __name__=="__main__":
    unittest.main()
