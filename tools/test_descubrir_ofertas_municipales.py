import unittest
from descubrir_ofertas_municipales import candidate_links, attached_public_pdfs

URL="https://victoriachile.cl/category/omil/"

class DescubrimientoTests(unittest.TestCase):
    def test_only_real_individual_links(self):
        html="""<nav><a href='/convocatoria-laboral-trampa/'>Oferta laboral</a></nav>
          <main><a href='/2026/10/oferta-laboral-junior/'>Oferta laboral junior</a>
          <a href='/category/omil/'>OMIL</a>
          <a href='https://evil.example/postulacion'>Postulación</a></main>"""
        out=candidate_links(URL,html)
        self.assertEqual(len(out),1)
        self.assertIn('oferta-laboral-junior',out[0]['url'])

    def test_old_year_never_eligible(self):
        html="<main><a href='/2025/10/oferta-laboral/'>Oferta laboral</a></main>"
        self.assertEqual(candidate_links(URL,html),[])

    def test_ignores_news_without_recruitment(self):
        html="<main><a href='/noticia/capacitacion-agricola/'>Taller gratuito</a></main>"
        self.assertEqual(candidate_links(URL,html),[])

    def test_pdf_attachment_only_same_publisher(self):
        html = """<main><a href='/files/bases-de-llamado.pdf'>Bases del concurso</a>
          <a href='https://evil.example/bases.pdf'>Otro archivo</a>
          <a href='/2025/09/archivo.pdf'>Expirado</a></main>"""
        items = attached_public_pdfs("https://victoriachile.cl/convocatoria-laboral/", html)
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["url"].endswith("bases-de-llamado.pdf"))

    def test_finite_limit(self):
        html="<main>"+''.join(
          f"<a href='/empleo-{i}/'>Oferta laboral {i}</a>" for i in range(30))+"</main>"
        self.assertEqual(len(candidate_links(URL,html,3)),3)

if __name__=="__main__":
    unittest.main()
