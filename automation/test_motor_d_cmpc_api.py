"""CMPC official Cornerstone JSON adapter: real requisitions, strict safety."""
from datetime import date, datetime
import json
import unittest
from unittest.mock import patch

import motor_d_cmpc_api as api
import motor_d_territorial_daily as engine
from motor_d_express import classify
from motor_d_source_registry import assess, plan


TODAY=date(2026,11,12)
OFFICIAL_URL="https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc"

def row(number=18859,city="Nacimiento",published="2026-11-11",expires="2026-12-01",
        title="Supervisor/a Mantención Industrial"):
    return {
        "requisitionId":number,
        "displayJobTitle":title,
        "locations":[{"city":city,"country":"CL"}],
        "postingEffectiveDate":published,
        "postingExpirationDate":expires,
    }


class Response:
    def __init__(self,jobs,status=200,mime="application/json"):
        self.status_code=status
        self.headers={"Content-Type":mime}
        self.raw=json.dumps({"data":{"requisitions":jobs}}).encode("utf-8")
        self.closed=False

    def iter_content(self,n):
        for at in range(0,len(self.raw),n):
            yield self.raw[at:at+n]

    def close(self):
        self.closed=True


class CmpcOfficialReaderTests(unittest.TestCase):
    def test_exact_official_career_url_only(self):
        self.assertTrue(api.source_is_official_cmpc(OFFICIAL_URL))
        for wrong in (
            "http://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc",
            "https://evil.example/ux/ats/careersite/4/home?c=cmpc",
            OFFICIAL_URL+"&c=other",
            "https://cmpc.csod.com/ux/ats/careersite/5/home?c=cmpc",
            "https://cmpc.csod.com/ux/ats/careersite/4/home?c=other",
        ):
            self.assertFalse(api.source_is_official_cmpc(wrong),wrong)

    def test_official_mininco_alias_and_original_date(self):
        candidate,why=api.parse_requisition(row(city="Mininco"),TODAY)
        self.assertEqual(why,"eligible")
        self.assertEqual(candidate["work_commune"],"Collipulli")
        self.assertEqual(candidate["explicit_worksite_commune"],"Collipulli")
        self.assertEqual(candidate["raw_worksite_city"],"Mininco")
        self.assertEqual(candidate["employer"],"CMPC")
        self.assertEqual(candidate["date_source"],"2026-11-11")
        self.assertEqual(candidate["deadline"],"2026-12-01")
        self.assertTrue(candidate["application_evidence"])
        self.assertEqual(candidate["url"],
            "https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/18859?c=cmpc")
        status,_,offer=classify(candidate,TODAY)
        self.assertEqual(status,"EXPRESS")
        self.assertEqual(offer["comunas"],["Collipulli"])
        self.assertEqual(offer["empresa"],"CMPC")

    def test_old_still_open_makes_recovery_not_discarded(self):
        candidate,why=api.parse_requisition(row(published="2026-10-10"),TODAY)
        self.assertEqual(why,"eligible")
        status,_,offer=classify(candidate,TODAY)
        self.assertEqual(status,"RECUPERACION")
        self.assertEqual(offer["fecha_publicacion"],"2026-10-10")

    def test_no_unproven_dates_locations_employer_or_expired_job(self):
        cases=[
            (row(city="Temuco"),"not_target_commune"),
            (row(published=""),"original_date_unconfirmed"),
            (row(published="2026-11-13"),"original_date_unconfirmed"),
            (row(expires="2026-11-11"),"expired"),
            (row(expires="not-a-date"),"expiry_invalid"),
            (row(number=None),"requisition_id_missing"),
            (row(title="x"),"title_missing"),
        ]
        for candidate,reason in cases:
            with self.subTest(reason=reason):
                offer,why=api.parse_requisition(candidate,TODAY)
                self.assertIsNone(offer)
                self.assertEqual(why,reason)

    def test_mixed_countries_and_multiple_cities_never_autopublish(self):
        for loc in (
            [{"city":"Nacimiento","country":"CL"},{"city":"Santiago","country":"CL"}],
            [{"city":"Collipulli","country":"CL"},{"city":"Lima","country":"PE"}],
            [{"city":"Collipulli","country":"CL"},{"city":"Angol","country":"CL"}],
        ):
            with self.subTest(loc=loc):
                candidate={**row(),"locations":loc}
                offer,why=api.parse_requisition(candidate,TODAY)
                self.assertIsNone(offer)
                self.assertIn(why,{"ambiguous_worksite_cities","mixed_or_unknown_countries"})

    def test_read_two_pages_and_stop_on_short_page(self):
        responses=[
            Response([row(18859,city="Mininco")]),
        ]
        def fake_post(url,**kw):
            self.assertEqual(url,api.API_URL)
            self.assertFalse(kw["allow_redirects"])
            self.assertTrue(kw["stream"])
            self.assertEqual(kw["headers"]["Origin"],"https://cmpc.csod.com")
            self.assertEqual(kw["json"]["careerSiteId"],4)
            return responses.pop(0)
        report=api.read_cmpc_requisitions(TODAY,post=fake_post)
        self.assertEqual(report["http"],200)
        self.assertTrue(report["official_api_index_complete"])
        self.assertEqual(report["official_api_candidates"],1)
        self.assertEqual(report["official_api_reason_counts"]["eligible"],1)

    def test_second_page_and_no_infinite_pagination(self):
        calls=[]
        def fake_post(_url,**kw):
            calls.append(kw["json"]["pageNumber"])
            data=[row(i+10000,city="Nacimiento") for i in range(2)] if calls[-1]==1 else []
            return Response(data)
        report=api.read_cmpc_requisitions(TODAY,post=fake_post,page_size=2)
        self.assertEqual(calls,[1,2])
        self.assertTrue(report["official_api_index_complete"])
        self.assertEqual(report["official_api_candidates"],2)

    def test_blocked_api_does_not_claim_source_is_covered(self):
        result=api.read_cmpc_requisitions(TODAY,post=lambda *_a,**_k:Response([],403))
        self.assertEqual(result["status"],"http_restricted")
        self.assertFalse(result["official_api_index_complete"])
        self.assertEqual(result["official_api_candidates"],0)

    def test_engine_uses_api_for_cmpc_instead_of_generic_html(self):
        with patch.object(engine,"NOW", datetime.fromisoformat("2026-11-12T12:00:00-03:00")), \
             patch.object(engine,"read_cmpc_requisitions",
                          return_value=api.read_cmpc_requisitions(
                              TODAY,post=lambda *_a,**_kw:Response([row()]))) as read, \
             patch.object(engine,"request_page",side_effect=AssertionError("no generic HTML")):
            result=engine.inspect(("Nacimiento","CMPC empleo",OFFICIAL_URL))
        self.assertEqual(read.call_count,1)
        self.assertEqual(result["source_reader"],"official_cmpc_cornerstone_json")
        self.assertEqual(result["details_opened"],1)
        self.assertEqual(result["links_found"],1)
        self.assertEqual(result["candidates"][0]["work_commune"],"Nacimiento")
        self.assertTrue(result["candidates"][0]["date_recent_2d"])

    def test_source_registry_official_empty_page_is_different_from_broken_html(self):
        cfg={"territories":list(engine.COMMUNES),"seed_urls":[],"discovery":[],"social_reference":[]}
        planned=plan([("Nacimiento","CMPC empleo",OFFICIAL_URL)],[],
                     config=cfg,audit={"seed_pages":[]},social_refs=[],portals={})
        baseline={
            "commune":"Nacimiento","source":"CMPC empleo","url":OFFICIAL_URL,
            "status":"scanned_no_candidates","checked_at":"2026-11-12T12:00:00-03:00",
            "http":200,"candidates":[]
        }
        fallback=assess(planned,[baseline],{})
        self.assertEqual(fallback["pending"][0]["status"],"requires_specialized_reader")
        official={**baseline,"source_reader":"official_cmpc_cornerstone_json",
                  "official_api_index_complete":True}
        ready=assess(planned,[official],{})
        self.assertEqual(ready["unresolved_total"],0)
        self.assertEqual(ready["automatic_attempted"],1)


if __name__=="__main__":
    unittest.main()
