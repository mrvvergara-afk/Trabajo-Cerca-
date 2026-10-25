import datetime as dt
import unittest
from unittest.mock import patch

from trabajo_cerca_lector_documental import allowed, parse_deadline, classify, clean_text, extract_text, verified_article_date, article_body_text


class LectorDocumentalTests(unittest.TestCase):
    def test_accepts_only_approved_official_sources(self):
        self.assertTrue(allowed("https://mtraiguen.cl/wp-content/uploads/2026/10/bases.pdf"))
        self.assertTrue(allowed("https://victoriachile.cl/category/omil/"))
        self.assertFalse(allowed("https://evil.example/fake.pdf"))
        self.assertFalse(allowed("http://munipuren.cl/archivo.pdf"))
        self.assertFalse(allowed("https://munipuren.cl:8080/archivo.pdf"))
        self.assertFalse(allowed("https://munipuren.cl@evil.example/archivo.pdf"))

    def test_publication_metadata_date_is_evidence_not_web_crawl_time(self):
        html='<meta property="article:published_time" content="2026-10-23T09:31:00-03:00">'
        self.assertEqual(str(verified_article_date(html)), "2026-10-23")
        self.assertIsNone(verified_article_date("<footer>23 de octubre de 2026</footer>"))

    def test_news_article_body_excludes_header_job_links(self):
        html = """<nav>Oferta laboral falsa</nav><article><h1>Colegio requiere docentes</h1>
        <p>Presentar currículum y antecedentes en Traiguén para Profesor/a de Matemáticas.</p>
        </article><footer>Oferta laboral vieja</footer>"""
        body = article_body_text(html)
        self.assertIn("Profesor/a de Matemáticas", body)
        self.assertNotIn("Oferta laboral falsa", body)
        self.assertEqual(classify(body, dt.date(2026,10,25))["decision"], "candidato_fecha_pendiente")

    def test_generic_training_news_is_not_vacancy(self):
        self.assertEqual(classify("En Traiguén se realiza taller para profesores y docentes de matemáticas.",
                                  dt.date(2026,10,25))["decision"], "sin_evidencia_suficiente")

    def test_deadlines(self):
        self.assertEqual(parse_deadline("Postula hasta el 26 de octubre de 2026"), dt.date(2026, 10, 26))
        self.assertEqual(parse_deadline("Cierre de postulaciones: 23/10/2026"), dt.date(2026, 10, 23))

    def test_never_publish_old_job(self):
        text = "CONVOCATORIA LABORAL. Se necesita persona para Ercilla. Postular hasta el 23/10/2026."
        self.assertEqual(classify(text, dt.date(2026, 10, 25))["decision"], "plazo_vencido_no_publicar")

    def test_month_based_priority_is_not_original_date_proof(self):
        from trabajo_cerca_lector_documental import likely_older_than_days
        today = dt.date(2026, 10, 25)
        self.assertTrue(likely_older_than_days("https://munilumaco.cl/2026/09/bases.pdf", 20, today))
        self.assertFalse(likely_older_than_days("https://munilumaco.cl/2026/10/bases.pdf", 20, today))
        self.assertFalse(likely_older_than_days("https://munilumaco.cl/avisos/bases.pdf", 20, today))

    def test_chilean_deadline_with_del(self):
        self.assertEqual(parse_deadline("Postulación hasta 26 de octubre del 2026"),
                         dt.date(2026, 10, 26))

    def test_recent_candidate_always_requires_review(self):
        # Datos deliberadamente ficticios de prueba; nunca se transmiten a la aplicación.
        text = "OFERTA LABORAL. Se necesita pioneta para Victoria. Postular hasta el 26/10/2026."
        self.assertEqual(classify(text, dt.date(2026, 10, 25))["decision"], "candidato_fecha_pendiente")

    def test_old_decree_is_not_current_offer(self):
        text = ("MUNICIPALIDAD DE LUMACO DEPARTAMENTO DE RECURSOS HUMANOS "
                "APRUEBA LLAMADO A CONCURSOS PÚBLICOS Y BASES ADMINISTRATIVAS "
                "DE LOS CARGOS VACANTES. Lumaco, lunes 13 de julio de 2026. "
                "La comuna llama a concurso. Se puede postular.")
        out = classify(text, dt.date(2026, 10, 25))
        self.assertEqual(out["source_date_evidence"], "2026-07-13")
        self.assertEqual(out["decision"], "documento_antiguo_no_publicar")

    def test_unclear_document_date_does_not_count_as_verified(self):
        out=classify("Oferta laboral. Se necesita personal. Postular en Victoria.",
                     dt.date(2026,10,25))
        self.assertFalse(out["publication_date_confirmed"])
        self.assertEqual(out["decision"], "candidato_fecha_pendiente")

    def test_news_is_not_job(self):
        self.assertEqual(classify("Municipalidad anuncia talleres de capacitación en soldadura.",
                                  dt.date(2026, 10, 25))["decision"], "sin_evidencia_suficiente")

    def test_manifest_endpoint_is_public_app_and_read_only(self):
        from trabajo_cerca_lector_documental import ENDPOINT
        self.assertEqual(ENDPOINT,
          "https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro/api/ops/free-public-sources")

    def test_large_pdf_is_only_a_six_page_preview(self):
        import fitz
        document = fitz.open()
        for index in range(31):
            page = document.new_page()
            if index == 0:
                page.insert_text((70, 80), "OFERTA LABORAL. Convocatoria para la comuna de Traiguen. "*6)
        data = document.tobytes()
        document.close()
        preview, mode = extract_text(data, "application/pdf", "https://mtraiguen.cl/bases.pdf")
        self.assertEqual(mode, "pdf_preview_partial")
        self.assertIn("OFERTA LABORAL", preview)

    def test_pdf_limited_to_16_mib_but_images_stay_small(self):
        from trabajo_cerca_lector_documental import maximum_for_url
        self.assertEqual(maximum_for_url("https://mtraiguen.cl/bases.pdf"), 16 * 1024 * 1024)
        self.assertEqual(maximum_for_url("https://mtraiguen.cl/afiche.jpg"), 6000000)

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
