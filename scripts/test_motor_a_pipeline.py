import datetime as dt
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from chiletrabajos_direct import ALIASES, PLACES, discover
from verify_candidates import check, choose, verify
from motor_a_handoff import merge

D_READER=Path(__file__).resolve().parents[1]/"automation"/"motor_a_handoff.py"
spec=importlib.util.spec_from_file_location("motor_a_d_review_loader",D_READER)
d_reader=importlib.util.module_from_spec(spec)
spec.loader.exec_module(d_reader)

ORIGINAL="https://www.chiletrabajos.cl/trabajo/tecnico-operador-mantenedor-3921234"


class MotorAPipelineTests(unittest.TestCase):
    def test_all_twelve_communes_and_sublocalities_no_thirteenth(self):
        self.assertEqual(len(PLACES),12)
        self.assertNotIn("Mininco",PLACES)
        self.assertNotIn("Coihue",PLACES)
        self.assertEqual(ALIASES["Collipulli"],["Collipulli","Mininco"])
        self.assertEqual(ALIASES["Negrete"],["Negrete","Coihue","Coigüe"])
        seen=[]
        def fake(url):
            seen.append(url)
            return '<a href="'+ORIGINAL+'">Técnico Operador Mantenedor</a>'
        data=discover(fake)
        self.assertEqual(data["candidate_count"],1)
        self.assertEqual(len(data["diagnostics"]),15)
        self.assertEqual(len(data["candidates"][0]["commune_queries"]),12)
        self.assertFalse(data["candidates"][0]["work_location_verified"])
        self.assertEqual(len(seen),15)

    def test_crossposted_under_angol_but_worksite_is_mininco(self):
        raw='<title>Trabajo en Angol</title><p>Requisitos para empleo</p>'+(
            '<script type="application/ld+json">'+
            json.dumps({"@type":"JobPosting","jobLocation":{
                "@type":"Place","address":{"addressLocality":"Mininco"}}})+
            '</script>')
        result=check({"url":ORIGINAL,"commune_query":"Angol"},
                     lambda url:(url,200,raw))
        self.assertEqual(result["status"],"review_ready")
        self.assertEqual(result["work_commune"],"Collipulli")
        self.assertEqual(result["reason"],"jobposting_structured_location")

    def test_two_distinct_structured_worksites_need_review(self):
        raw='<p>Requisitos</p><script type="application/ld+json">'+json.dumps({
            "@type":"JobPosting",
            "jobLocation":[{"address":{"addressLocality":"Angol"}},
                           {"address":{"addressLocality":"Nacimiento"}}]
        })+'</script>'
        result=check({"url":ORIGINAL},lambda url:(url,200,raw))
        self.assertEqual(result["status"],"pending")
        self.assertEqual(result["reason"],"multiple_structured_locations")

    def test_unrelated_city_in_page_does_not_verify_worksite(self):
        raw='<title>Empleo</title><p>Oficina de RRHH en Angol. Requisitos.</p>'
        result=check({"url":ORIGINAL},lambda url:(url,200,raw))
        self.assertEqual(result["status"],"pending")
        self.assertEqual(result["reason"],"worksite_not_individually_confirmed")

    def test_older_verified_identity_gets_next_slot(self):
        first={"url":ORIGINAL,"commune_query":"Angol"}
        other={"url":"https://www.chiletrabajos.cl/trabajo/empleo-industria-3925555","commune_query":"Angol"}
        previous={ORIGINAL:"2026-11-12T05:00:00+00:00",
                  other["url"]:"2026-11-10T05:00:00+00:00"}
        selected=choose([first,other],previous,limit=1)
        self.assertEqual(selected[0]["url"],other["url"])
        report,updated=verify({"candidates":[first,other]},previous,limit=1,
            checker=lambda row:{"status":"pending","reason":"incomplete"})
        self.assertEqual(report["checked"],1)
        self.assertEqual(report["results"][0]["candidate_url"],other["url"])
        self.assertIn(other["url"],updated)

    def test_merge_review_only_undated_and_duplicate_id_stable(self):
        now=dt.datetime(2026,11,12,tzinfo=dt.timezone.utc)
        row={"candidate_url":ORIGINAL,"status":"review_ready","title":"Operador",
             "work_commune":"Collipulli","reason":"jobposting_structured_location"}
        first=merge(None,{"results":[row]},now)
        self.assertEqual(first["items_total"],1)
        self.assertIs(first["items"][0]["publication_eligible"],False)
        self.assertIs(first["items"][0]["date_source_verified"],False)
        second=merge(first,{"results":[row]},now+dt.timedelta(hours=2))
        self.assertEqual(second["items_total"],1)
        self.assertEqual(first["items"][0]["id"],second["items"][0]["id"])
        closed=merge(second,{"results":[{"candidate_url":ORIGINAL,"status":"rejected",
                "reason":"closed_notice"}]},now+dt.timedelta(hours=3))
        self.assertEqual(closed["items_total"],0)

    def test_d_consumer_does_not_trust_a_without_source_reread(self):
        today=dt.datetime(2026,11,12,tzinfo=dt.timezone.utc)
        fake=merge(None,{"results":[{
            "candidate_url":ORIGINAL,"status":"review_ready",
            "work_commune":"Collipulli"}]},today)
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"review.json"
            path.write_text(json.dumps(fake),encoding="utf8")
            result=d_reader.read(path,now=today)
            self.assertEqual(result["total"],1)
            self.assertEqual(result["selected"],1)
            self.assertEqual(result["probes"][0][0],"Collipulli")
            self.assertEqual(result["probes"][0][2],ORIGINAL)
            invalid=merge(None,{"results":[{
                "candidate_url":"https://evil.example/trabajo/test-3921234",
                "status":"review_ready","work_commune":"Collipulli"}]},today)
            self.assertEqual(invalid["items_total"],0)
            fake["items"][0]["publication_eligible"]=True
            path.write_text(json.dumps(fake),encoding="utf8")
            result=d_reader.read(path,now=today)
            self.assertEqual(result["total"],0)
            self.assertEqual(result["invalid"],1)


if __name__=="__main__":
    unittest.main()
