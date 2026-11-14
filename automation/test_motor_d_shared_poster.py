"""Regression: distinct positions on one official poster are not URL duplicates."""
import unittest
from datetime import date
from motor_d_express import build

class SharedPosterRoles(unittest.TestCase):
    def test_two_distinct_roles_one_url(self):
        base = {
            "url": "https://example.org/convocatoria-2026",
            "evidence": "individual_page_with_job_terms",
            "http": 200,
            "deadline": "2026-11-18",
            "work_commune": "Mulchén",
            "source_commune_not_confirmed": False,
            "employer": "Municipalidad de Mulchén",
            "date_source": "2026-11-05",
            "application_evidence": True,
        }
        a = {**base, "title": "Kinesiólogo/a"}
        b = {**base, "title": "Psicólogo/a"}
        result = build({"candidates": [a,b,a.copy()]}, date(2026,11,14))
        accepted = [x["offer"] for x in result["RECUPERACION"]]
        self.assertEqual(len(accepted),2)
        self.assertEqual(len(result["DUPLICADO"]),1)
        self.assertEqual(len({x["id_fuente"] for x in accepted}),2)

if __name__ == "__main__":
    unittest.main()
