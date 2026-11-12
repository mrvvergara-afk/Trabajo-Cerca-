import unittest
from motor_a_coverage import summarize, COMMUNES

class MotorASourceCoverageTests(unittest.TestCase):
    def test_complete_roster_partial_sources_not_claimed_as_covered(self):
        municipal=[{"source":"Municipio "+c,"commune_scope":c,
                    "pages_scanned":1,"status":"html_only","errors":[]}
                   for c in sorted(COMMUNES)]
        companies=[{"source":prefix,"commune_scope":"regional",
                    "pages_scanned":1,"status":"html_only","errors":[]}
                   for prefix in ("Arauco ATS","CMPC ATS","SERFONAC ofertas",
                                  "SERFOCOL Trabajando","Brayben ofertas")]
        data=summarize(
            {"run_at":"2026-11-13T09:00:00Z",
             "diagnostics":municipal+companies,"candidates":[{"url":"x"}]},
            {"candidate_count":125,"diagnostics":[{}]*15},
            {"checked_at":"2026-11-13T09:17:00Z",
             "checked":60,"review_ready":13,"results":[{}]*60})
        self.assertEqual(data["local_sources_attempted"],17)
        self.assertEqual(len(data["municipalities_attempted"]),12)
        self.assertEqual(len(data["municipalities_readable"]),12)
        self.assertEqual(data["chiletrabajos_candidates"],125)
        self.assertEqual(data["job_details_checked"],60)
        self.assertFalse(data["coverage_complete"])
        self.assertFalse(data["publication_confirmed"])

    def test_unreachable_omil_detected_instead_of_false_coverage(self):
        diagnostics=[
            {"source":"Municipio "+c,"commune_scope":c,
             "pages_scanned":0 if c=="Mulchén" else 1,
             "status":"partial" if c=="Mulchén" else "html_only",
             "errors":[{"error":"timeout"}] if c=="Mulchén" else []}
            for c in sorted(COMMUNES)]
        data=summarize({"run_at":"2026-11-13T09:00:00Z",
                        "diagnostics":diagnostics,"candidates":[]},
                       {"candidate_count":0,"diagnostics":[{}]*15},
                       {"checked_at":"2026-11-13T09:17:00Z",
                        "checked":0,"review_ready":0,"results":[]})
        self.assertEqual(len(data["municipalities_attempted"]),12)
        self.assertIn("Mulchén",data["municipalities_unreadable"])
        self.assertEqual(data["local_sources_attempted"],12)
        self.assertEqual(len(data["source_failures"]),1)

    def test_invalid_input_must_not_create_healthy_receipt(self):
        with self.assertRaises(ValueError):
            summarize({"diagnostics":[]},{},{"results":[]})


if __name__=="__main__":
    unittest.main()
