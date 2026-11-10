import unittest
from unittest.mock import patch
from descubrir_ofertas_municipales import candidate_links, attached_public_pdfs, discover

URL="https://victoriachile.cl/category/omil/"

class DescubrimientoTests(unittest.TestCase):
    def test_authorized_municipal_feed_is_used_when_html_index_forbidden(self):
        source="https://victoriachile.cl/category/omil/"
        post="https://victoriachile.cl/convocatoria-laboral-bodega/"
        feed={"status":"ok","pages":[{"url":post,"anchor":"Oferta laboral bodega",
                                      "kind":"local_page"}],
              "checked":[{"url":"https://victoriachile.cl/feed/","status":"usable"}],
              "sources_blocked":0,"sources_accessible":1}
        reader=lambda item: {"url":item["url"],"kind":item["kind"],
                              "decision":"candidato_para_revision"}
        with patch("descubrir_ofertas_municipales.discover_municipal",return_value=feed), \
             patch("descubrir_ofertas_municipales.robots_ok",return_value=False), \
             patch("descubrir_ofertas_municipales.read_one",side_effect=reader), \
             patch("descubrir_ofertas_municipales.fetch_bytes",
                   return_value=(b"<article>Sin PDF</article>","text/html")), \
             patch("descubrir_ofertas_municipales.time.sleep"):
            result=discover({"url":source,"source":"OMIL Victoria"},max_links=5)
        self.assertEqual(result["status"],"feed_only_index_unavailable")
        self.assertEqual(result["feed_status"],"ok")
        self.assertEqual(result["links_found"],1)
        self.assertEqual(len(result["checked"]),1)
        self.assertEqual(result["checked"][0]["url"],post)

    def test_municipal_embedded_pdf_is_sent_to_reader_once_not_to_publication(self):
        source="https://municipalidadrenaico.cl/concursos-publicos/"
        article="https://municipalidadrenaico.cl/oferta-laboral-operario/"
        pdf="https://municipalidadrenaico.cl/wp-content/uploads/BASES.pdf"
        page=("<main><a href='/oferta-laboral-operario/'>"
              "Oferta laboral operario</a></main>").encode()
        body=("<article><h1>Oferta laboral operario</h1>"
              "<iframe src='/wp-content/uploads/BASES.pdf'></iframe>"
              "</article>").encode()
        feed={"status":"ok","pages":[{"url":article,"anchor":"Oferta laboral operario",
                                      "kind":"local_page"}],
              "checked":[],"sources_blocked":0,"sources_accessible":1}
        outputs=[]
        def document_reader(item):
            outputs.append((item["url"],item["kind"]))
            return {"url":item["url"],"kind":item["kind"],
                    "decision":"candidato_para_revision"}
        def fetch(url,*_):
            if url==source:return page,"text/html"
            if url==article:return body,"text/html"
            raise AssertionError("unexpected fetch "+url)
        with patch("descubrir_ofertas_municipales.discover_municipal",return_value=feed), \
             patch("descubrir_ofertas_municipales.robots_ok",return_value=True), \
             patch("descubrir_ofertas_municipales.fetch_bytes",side_effect=fetch), \
             patch("descubrir_ofertas_municipales.read_one",side_effect=document_reader), \
             patch("descubrir_ofertas_municipales.time.sleep"):
            result=discover({"url":source,"source":"OMIL Renaico"},max_links=5)
        self.assertEqual(result["status"],"index_read")
        self.assertEqual(result["links_found"],1)
        self.assertEqual(outputs,[(article,"local_page"),(pdf,"document")])
        self.assertEqual(len(result["checked"]),2)

    def test_only_real_individual_links(self):
        html="""<nav><a href='/convocatoria-laboral-trampa/'>Oferta laboral</a></nav>
          <main><a href='/2026/10/oferta-laboral-junior/'>Oferta laboral junior</a>
          <a href='/category/omil/'>OMIL</a>
          <a href='https://evil.example/postulacion'>Postulación</a></main>"""
        out=candidate_links(URL,html)
        self.assertEqual(len(out),1)
        self.assertIn('oferta-laboral-junior',out[0]['url'])

    def test_real_job_headlines_are_detected(self):
        html = """<main>
          <a href="/oferta-laboral-colegio-bicentenario-louis-pasteur-de-traiguen-requiere-docentes-para-diversas-areas/">
          OFERTA LABORAL: Colegio Bicentenario requiere docentes para diversas áreas</a>
          <a href="/omil-traiguen-abre-convocatoria-para-el-cargo-de-coordinador-de-visual-merchandising/">
          OMIL Traiguén abre convocatoria de visual merchandising</a>
          <a href="/departamento-salud-traiguen-abre-concurso-publico/">
          Departamento de Salud abre concurso público</a>
          <a href="/visita-oficial-de-la-municipalidad/">Evento municipal</a>
        </main>"""
        urls=candidate_links("https://www.traiguencity.cl/noticias/traiguen/general/", html, limit=5)
        self.assertEqual(len(urls),3)

    def test_old_year_link_is_retained_for_vigencia_check(self):
        html="<main><a href='/2025/10/oferta-laboral/'>Oferta laboral</a></main>"
        self.assertEqual(len(candidate_links(URL,html)),1)

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

    def test_old_dated_pdf_is_not_rejected_before_deadline_review(self):
        html = "<main><a href='/2025/09/convocatoria.pdf'>Bases del concurso</a></main>"
        items = attached_public_pdfs("https://victoriachile.cl/convocatoria/", html)
        self.assertEqual(len(items), 1)

    def test_nested_link_label_is_read_without_navigation_false_positives(self):
        html = """<nav><a href='/oferta-laboral-falsa/'>Oferta</a></nav>
          <main><a href='/convocatoria-2026/'><span>Convocatoria</span>
          <strong>laboral</strong></a></main>"""
        result = candidate_links(URL, html)
        self.assertEqual(len(result), 1)
        self.assertIn("convocatoria-2026", result[0]["url"])
        self.assertIn("laboral", result[0]["anchor"])

    def test_finite_limit(self):
        html="<main>"+''.join(
          f"<a href='/empleo-{i}/'>Oferta laboral {i}</a>" for i in range(30))+"</main>"
        self.assertEqual(len(candidate_links(URL,html,3)),3)

if __name__=="__main__":
    unittest.main()
