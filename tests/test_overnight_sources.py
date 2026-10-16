import unittest

from scripts.overnight_sources import classify_snippet, page_clues


class OvernightSourcesTests(unittest.TestCase):
    def test_open_looking_notice_remains_unverified_candidate(self):
        item = classify_snippet("OMIL informa: se necesita operador. Postulación al correo. 15/10/2026", page=3, source_url="https://example.test/a.pdf")
        self.assertEqual(item["kind"], "candidate_requires_original_verification")
        self.assertFalse(item["verified"])
        self.assertFalse(item["published"])

    def test_closed_notice_is_historical(self):
        item = classify_snippet("Oferta laboral: administrativo. Plazo vencido 10/10/2026", page=2, source_url="https://example.test/a.pdf")
        self.assertEqual(item["kind"], "historical_closed_notice")

    def test_fair_or_bulk_slots_are_not_counted_as_individual_offers(self):
        item = classify_snippet("Feria laboral con 80 cupos y postulaciones presenciales", page=1, source_url="https://example.test/a.pdf")
        self.assertEqual(item["kind"], "aggregate_event_not_individual_offer")

    def test_page_numbers_survive_full_document_scan(self):
        clues = page_clues("Portada\fAvisos\nSe busca maestro para faena en Angol\nEnviar CV", "https://example.test/a.pdf")
        self.assertEqual(clues[0]["page"], 2)

    def test_a_fair_page_produces_one_aggregate_event_and_no_individual_candidates(self):
        text = "Feria de empleo con 13 empresas y distintos perfiles laborales\nSe buscan trabajadores agrícolas\nOMIL informa vacantes"
        clues = page_clues(text, "https://example.test/a.pdf")
        self.assertEqual(len(clues), 1)
        self.assertEqual(clues[0]["kind"], "aggregate_event_not_individual_offer")


if __name__ == "__main__":
    unittest.main()
