"""Offline regressions for user-provided Nacimiento OMIL posters, not publications."""
import json
import unittest
from pathlib import Path
from qa_omil_nacimiento_posters import POSTS, audit
from motor_d_catalog_probe import source_identity


class NacimientoOmilPosterTests(unittest.TestCase):
    def test_three_existing_portal_ids_not_three_new_vacancies(self):
        expected={"3923358","3923364","3923758"}
        self.assertEqual(len(POSTS),3)
        self.assertEqual({source_identity(x["url_original"]).split(":")[1]
                          for x in POSTS},expected)
        self.assertEqual(len({x["application_url"] for x in POSTS}),3)

    def test_omil_visit_day_is_not_rewritten_as_original_job_date_or_deadline(self):
        path=Path(__file__).resolve().parent/"motor_d_discovery"/"omil_nacimiento_20261109_evidence.json"
        source=json.loads(path.read_text(encoding="utf8"))
        self.assertEqual(source["observed_at_chile"],"2026-11-09")
        self.assertEqual(source["recruitment_office"]["application_date"],"2026-11-12")
        self.assertFalse(source["recruitment_office"]["date_is_confirmed_closing_deadline"])
        for offer in source["offers"]:
            self.assertEqual(offer["original_published_date"],"2026-11-05")
            self.assertEqual(offer["portal_expiration_date"],"2027-01-19")
            self.assertRegex(offer["screenshot_sha256"],r"^[0-9a-f]{64}$")
            self.assertTrue(offer["qr_application_url"].startswith("https://forms.gle/"))
        self.assertFalse(source["source_perma_posts_known"])

    def test_one_public_listing_detected_by_job_id_even_if_slug_changes(self):
        row={"id":"chatgpt_d_abc","kind":"job_offer",
             "url":"https://www.chiletrabajos.cl/trabajo/3923358",
             "title":"Mecánico Soldador","company":"Serfonac",
             "workCommunes":["Nacimiento"]}
        status=audit([row],True)
        self.assertEqual(status[0]["status"],"already_published_source_identity")
        self.assertEqual(status[0]["matching_public_records"][0]["id"],"chatgpt_d_abc")
        self.assertEqual(status[1]["status"],"not_found_in_complete_feed")
        self.assertEqual(status[2]["status"],"not_found_in_complete_feed")

    def test_two_records_with_same_origin_id_are_flagged_as_duplicates(self):
        rows=[{"id":str(i),"kind":"job_offer",
               "url":"https://www.chiletrabajos.cl/trabajo/3923364"}
              for i in ("A","B")]
        result=audit(rows,True)
        self.assertEqual(result[1]["public_duplicate_rows_for_same_id"],1)

    def test_unavailable_feed_does_not_claim_job_absent(self):
        for item in audit([],False):
            self.assertEqual(item["status"],"catalog_unavailable")
            self.assertEqual(item["matching_public_records"],[])
            self.assertFalse(item["qr_form_verified_by_http"])


if __name__=="__main__":
    unittest.main()
