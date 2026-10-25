import datetime as dt
import unittest
from unittest.mock import patch

from trabajo_cerca_lector_documental import allowed, parse_deadline, classify, clean_text, extract_text


class LectorDocumentalTests(unittest.TestCase):
    def test_accepts_only_approved_official_sources(self):
        self.assertTrue(allowed("https://mtraiguen.cl/wp-content/uploads/2026/10/bases.pdf"))
        self.assertTrue(allowed("https://victoriachile.cl/category/omil/"))
        self.assertFalse(allowed("https://evil.example/fake.pdf"))
        self.assertFalse(allowed("http://munipuren.cl/archivo.pdf"))
        self.assertFalse(allowed("https://munipuren.cl:8080/archivo.pdf"))
        self.assertFalse(allowed("https://munipuren.cl@evil.example/archivo.pdf"))

    def test_deadlines(self):
        self.assertEqual(parse_deadline("Postula hasta el 26 de octubre de 2026"), dt.date(2026, 10, 26))
        self.assertEqual(parse_deadline("Cierre de postulaciones: 23/10/2026"), dt.date(2026, 10, 23))

    def test_never_publish_old_job(self):
        text = "CONVOCATORIA LABORAL. Se necesita persona para Ercilla. Postular hasta el 23/10/2026."
        self.assertEqual(classify(text, dt.date(2026, 10, 25))["decision"], "plazo_vencido_no_publicar")

    def test_recent_candidate_always_requires_review(self):
        # Datos deliberadamente ficticios de prueba; nunca se transmiten a la aplicación.
        text = "OFERTA LABORAL. Se necesita pioneta para Victoria. Postular hasta el 26/10/2026."
        self.assertEqual(classify(text, dt.date(2026, 10, 25))["decision"], "candidato_para_revision")

    def test_news_is_not_job(self):
        self.assertEqual(classify("Municipalidad anuncia talleres de capacitación en soldadura.",
                                  dt.date(2026, 10, 25))["decision"], "sin_evidencia_suficiente")

    def test_manifest_endpoint_is_public_app_and_read_only(self):
        from trabajo_cerca_lector_documental import ENDPOINT
        self.assertEqual(ENDPOINT,
          "https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/api/ops/free-public-sources")

    def test_image_reader_invokes_local_ocr_only(self):
        with patch("trabajo_cerca_lector_documental.ocr_bytes", return_value="Oferta laboral Victoria"):
            text, mode = extract_text(b"image_fixture", "image/png", "https://victoriachile.cl/afiche.png")
            self.assertEqual(text, "Oferta laboral Victoria")
            self.assertEqual(mode, "imagen_ocr_local")

    def test_html_scripts_excluded(self):
        self.assertEqual(clean_text("<p>Oferta laboral</p><script>ignoreMe()</script>"),
                         "Oferta laboral")


if __name__ == "__main__":
    unittest.main()
