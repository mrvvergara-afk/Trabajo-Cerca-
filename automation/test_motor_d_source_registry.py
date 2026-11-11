"""Safety contract: all sources, all 12 communes, no top-N omissions."""
import unittest
from motor_d_source_registry import plan,ranked,assess,learn,COMMUNES

class FullInventoryTests(unittest.TestCase):
    def setUp(self):
        self.registry=plan(
            [("Angol","Municipalidad","https://muniejemplo.cl/")],
            [("Angol","Indeed · Angol","https://cl.indeed.com/jobs?l=Angol")],
            config={"territories":list(COMMUNES),
                    "seed_urls":[{"url":"https://kitempleo.cl/empleo/123456"}],
                    "discovery":[{"id":"P1","territory":"Mulchén","url":"https://mipleo.cl/ofertas","type":"portal"},
                                 {"id":"M1","territory":"Angol","url":"https://www.muniejemplo.cl/","type":"municipal"},
                                 {"id":"P2","territory":"Chile","url":"https://empleospublicos.cl/convocatorias","type":"portal"}],
                    "social_reference":[{"id":"S1","work_cities":["Nacimiento"],
                                         "url":"https://instagram.com/omilnacimiento/"}]},
            audit={"seed_pages":[]},social_refs=[])
    def fake(self,source):
        return {"commune":source["anchor"],"source":source["name"],"url":source["url"],
                "status":"scanned_no_candidates","checked_at":"2026-11-11T18:00:00-03:00",
                "http":200,"links_found":0,"candidates":[]}
    def test_full_source_roster_and_historical_links_separate(self):
        x=self.registry
        self.assertEqual(len(x["public"]),4)
        self.assertEqual(len(x["social"]),1)
        self.assertEqual(len(x["added"]),2)
        self.assertEqual(x["historical_job_links"],1)
        self.assertEqual(x["unregistered_publishers"][0]["host"],"kitempleo.cl")
        national=next(s for s in x["public"] if "empleospublicos.cl" in s["url"])
        self.assertEqual(len(national["communes"]),12)
    def test_rank_never_discards_low_yield_sources(self):
        x=self.registry
        best=next(v for v in x["public"] if "mipleo.cl" in v["url"])
        prev={best["id"]:{"ready":4,"individual":8,"blocked":0}}
        ranked_items=ranked(x,prev)
        self.assertEqual(ranked_items[0]["id"],best["id"])
        self.assertEqual(set(s["id"] for s in x["public"]),
                         set(s["id"] for s in ranked_items))
    def test_social_not_counted_as_success(self):
        x=self.registry
        r=assess(x,[self.fake(s) for s in x["public"]],{})
        self.assertEqual(r["not_attempted"],0)
        self.assertTrue(r["all_automatic_sources_attempted"])
        self.assertFalse(r["all_registered_sources_accessible"])
        self.assertEqual(r["unresolved_total"],1)
        self.assertEqual(r["per_commune"]["Nacimiento"]["social_unread"],1)
    def test_source_unvisited_must_be_explicit(self):
        x=self.registry
        report=assess(x,[self.fake(s) for s in x["public"][:-1]],{})
        self.assertFalse(report["all_automatic_sources_attempted"])
        self.assertEqual(report["not_attempted"],1)
        self.assertEqual(report["unresolved_total"],2)
    def test_a_block_does_not_mean_zero_offers(self):
        rows=[self.fake(s) for s in self.registry["public"]]
        rows[0]["status"]="http_restricted"
        r=assess(self.registry,rows,{})
        self.assertEqual(r["unresolved_total"],2)
        self.assertFalse(r["all_registered_sources_accessible"])
    def test_only_real_individual_evidence_drives_future_ranking(self):
        row=self.fake(self.registry["public"][0])
        row["candidates"]=[{"id":"generic-page","evidence":"directory_not_offer"},
                           {"id":"real-job-1","evidence":"individual_page_with_job_terms","express_ready":True}]
        x=learn({},[row],"2026-11-11T18:00:00-03:00")
        record=x[self.registry["public"][0]["id"]]
        self.assertEqual(record["ready"],1)
        self.assertEqual(record["individual"],1)
        # The exact same vacancy re-read later must not increase yield.
        again=learn(x,[row],"2026-11-11T22:00:00-03:00")
        self.assertEqual(again[self.registry["public"][0]["id"]]["ready"],1)
        self.assertEqual(again[self.registry["public"][0]["id"]]["individual"],1)
    def test_national_homepage_does_not_certify_local_coverage(self):
        x=self.registry
        source=next(s for s in x["public"] if "mipleo.cl" in s["url"])
        original=source["kind"]
        source["kind"]="portal_unfiltered_requires_geofilter"
        results=[self.fake(s) for s in x["public"]]
        report=assess(x,results,{})
        self.assertTrue(report["all_automatic_sources_attempted"])
        self.assertFalse(report["all_registered_sources_accessible"])
        self.assertTrue(any(r["status"]=="needs_territorial_filter" for r in report["pending"]))
        self.assertEqual(report["per_commune"]["Mulchén"]["needs_geofilter"],1)
        source["kind"]=original

    def test_industrial_employers_are_included_from_verified_employer_pages(self):
        from motor_d_social_sources import SOURCES
        import motor_d_territorial_daily as d
        full=plan(d.SEEDS,d.INDEED_SEEDS,social_refs=SOURCES)
        expected={
          "cmpc.csod.com": ("Collipulli","Nacimiento"),
          "jobs.arauco.com": ("Collipulli","Nacimiento"),
          "portal.chiletrabajos.cl/empresa/serfonac/ofertas": ("Nacimiento","Lumaco"),
          "portal.chiletrabajos.cl/empresa/brayben/ofertas": ("Collipulli","Nacimiento"),
          "serfocol.trabajando.cl": ("Mulchén","Nacimiento"),
          "safcoltda.cl": ("Collipulli",),
        }
        for address,territory in expected.items():
            rows=[x for x in full["public"] if address in x["url"]]
            self.assertTrue(rows,"Missing "+address)
            self.assertTrue(any(all(t in row["communes"] for t in territory)
                                for row in rows),"Territory mismatch for "+address)

    def test_actual_source_inventory_exceeds_old_hardcoded_56(self):
        from motor_d_social_sources import SOURCES
        import motor_d_territorial_daily as d
        full=plan(d.SEEDS,d.INDEED_SEEDS,social_refs=SOURCES)
        self.assertGreaterEqual(len(full["social"]),26)
        self.assertGreaterEqual(full["historical_job_links"],39)
        self.assertGreater(len(full["public"]),140)
        # Seven AppDeploy A portal families must be executed for all 12 towns,
        # even when HTTP 403 prevents reading a provider.
        from motor_d_source_registry import load_data,HERE
        portals=load_data(HERE/"motor_d_portal_families.json",True)
        self.assertEqual(len(portals["providers"]),7)
        for family in portals["providers"]:
            relevant=[x for x in full["public"] if "a_portal" in x["origins"]
                      and x["name"].startswith("Portal "+family["name"]+" · ")]
            self.assertEqual(len(relevant),12,family["name"])
        from motor_d_source_registry import load_data
        daily=load_data(HERE/"trabajo_cerca/fuentes_diarias.json",True)
        self.assertTrue(any("mipleo.cl" in x["url"] for x in daily["discovery"]))
        self.assertTrue(any("kitempleo.cl" in x["url"] for x in daily["discovery"]))
        self.assertEqual(set(COMMUNES),{p for row in full["public"] for p in row["communes"]})

if __name__=="__main__":unittest.main()
