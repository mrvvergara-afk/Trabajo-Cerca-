"""Verifica el paquete aislado de navegación de cuatro espacios (no es una prueba de navegador)."""
import json
import unittest
from pathlib import Path

PATCH = Path(__file__).resolve().parents[1] / "docs/APPDEPLOY_UI_V99_CUATRO_ESPACIOS_PATCH_20261113.json"

class DesignPatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.patch = json.loads(PATCH.read_text(encoding="utf-8"))
        cls.diffs = cls.patch["files"][0]["diffs"]

    def test_target_is_existing_v99(self):
        self.assertEqual(self.patch["app_id"], "trabajo-cerca-laboratorio-3ojgro")
        self.assertEqual(self.patch["base_version"], "1794540131218")
        self.assertEqual(self.patch["files"][0]["filename"], "src/App.tsx")
        self.assertEqual(len(self.diffs), 4)

    def test_replacements_preserve_four_real_destinations(self):
        gateway = self.diffs[1]["to"]
        for value in ("Buscar empleo", "Publicar mi perfil gratis", "Servicios y negocios", "Publicidad comercial"):
            self.assertIn(value, gateway)
        self.assertEqual(gateway.count("<button"), 3)  # The unchanged employment card is fourth.
        mobile = self.diffs[3]["to"]
        self.assertEqual(mobile.count("<button"), 4)
        for value in ("Empleos", "Perfiles", "Servicios", "Anunciar"):
            self.assertIn(value, mobile)

    def test_hiring_not_misrepresented_as_employer_job_offer(self):
        secondary = self.diffs[2]["to"]
        self.assertIn("necesidad de contratación", secondary)
        self.assertNotIn("Publicar oferta laboral", secondary)

    def test_no_backend_or_data_mutation(self):
        self.assertEqual([file["filename"] for file in self.patch["files"]], ["src/App.tsx"])
        self.assertTrue(self.patch["validation"]["production_unchanged"])

if __name__ == "__main__":
    unittest.main()
