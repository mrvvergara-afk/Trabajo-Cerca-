"""Evidence-gate regressions: source images are not publication approvals."""
import json
import unittest
from pathlib import Path
from omil_evidence_gate import evaluate


class OmilEvidenceGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parent / "motor_d_discovery" / "omil_nacimiento_20261109_evidence.json"
        cls.payload = json.loads(path.read_text(encoding="utf8"))

    def test_user_supplied_three_posters_match_same_three_existing_public_jobs(self):
        source_ids = ["3923358", "3923364", "3923758"]
        public_rows = [
            {"kind":"job_offer", "id":"public-"+number,
             "url":"https://www.chiletrabajos.cl/trabajo/"+number,
             "workCommunes":["Nacimiento"]} for number in source_ids
        ]
        result = evaluate(self.payload, public_rows, True)
        self.assertEqual(result["existing_count"],3)
        self.assertEqual(result["review_count"],0)
        self.assertEqual(result["new_publications"],0)
        self.assertEqual({x["origin_identity"] for x in result["records"]},
                         {"chiletrabajos:"+x for x in source_ids})
        self.assertTrue(all(x["decision"]=="existing_public_offer" for x in result["records"]))
        self.assertTrue(all(x["publication_eligible"] is False for x in result["records"]))

    def test_missing_catalog_cannot_claim_three_new_ads(self):
        result = evaluate(self.payload, [], False, "feed_incomplete")
        self.assertEqual(result["existing_count"],0)
        self.assertEqual(result["review_count"],0)
        self.assertEqual(result["blocked_count"],3)
        self.assertEqual(result["public_catalog_checked"],None)
        self.assertTrue(all(x["decision"]=="catalog_unavailable" for x in result["records"]))

    def test_unmatched_poster_routes_to_review_and_never_publication(self):
        payload={"observed_at_chile":"2026-11-09",
                 "source_profile":"https://www.instagram.com/omilnacimiento/",
                 "source_perma_posts_known":False,
                 "recruitment_office":{"application_date":"2026-11-12"},
                 "offers":[{
                     "title":"Operador de terreno",
                     "employer":"Empresa Ejemplo",
                     "work_commune":"Nacimiento",
                     "original_published_date":"2026-11-09",
                     "origin_url":"https://municipio.example/ofertas/operador",
                     "screenshot_sha256":"a"*64,
                     "portal_expiration_date":"2026-12-10",
                     "qr_application_url":"https://forms.gle/abc"
                 }]}
        result=evaluate(payload, [], True)
        row=result["records"][0]
        self.assertEqual(result["review_count"],1)
        self.assertEqual(row["decision"],"manual_document_review_required")
        self.assertEqual(row["original_published_date"],"2026-11-09")
        self.assertEqual(row["omil_application_day"],"2026-11-12")
        self.assertFalse(row["publication_eligible"])
        self.assertIn("ruta_de_postulacion_qr_no_verificada",row["reasons"])
        self.assertIn("permalink_red_social_no_verificado",row["reasons"])
        self.assertNotIn("sin_hash_documental_comprobable",row["reasons"])

    def test_date_of_omil_recruitment_never_substitutes_original_published_date(self):
        sample={"observed_at_chile":"2026-11-09",
                "recruitment_office":{"application_date":"2026-11-12"},
                "offers":[{"title":"Técnico", "employer":"Empresa",
                            "screenshot_sha256":"f"*64}]}
        out=evaluate(sample, [], True)["records"][0]
        self.assertIsNone(out["original_published_date"])
        self.assertEqual(out["omil_application_day"],"2026-11-12")
        self.assertIn("fecha_original_no_verificada",out["reasons"])

    def test_minimisers_never_assert_worksite_from_source_account(self):
        sample={"observed_at_chile":"2026-11-09",
                "source_profile":"https://www.instagram.com/omilnacimiento/",
                "offers":[{"title":"Operador","employer":"Serfonac",
                           "source_worksite_evidence":"OMIL Nacimiento",
                           "origin_url":"https://www.chiletrabajos.cl/trabajo/999991"}]}
        out=evaluate(sample, [], True)["records"][0]
        self.assertIsNone(out["work_commune_confirmed"])
        self.assertIn("comuna_ejecucion_sin_prueba_explicita",out["reasons"])

    def test_invalid_dates_and_malformed_input_are_not_silently_corrected(self):
        with self.assertRaises(ValueError):
            evaluate({"offers":[],"observed_at_chile":"today"}, [], True)
        with self.assertRaises(ValueError):
            evaluate([], [], True)
        sample={"observed_at_chile":"2026-11-09",
                "offers":[{"original_published_date":"2027-01-01"}]}
        row=evaluate(sample, [], True)["records"][0]
        self.assertIn("fecha_original_posterior_a_descubrimiento",row["reasons"])
        self.assertFalse(row["publication_eligible"])


if __name__ == "__main__":
    unittest.main()
