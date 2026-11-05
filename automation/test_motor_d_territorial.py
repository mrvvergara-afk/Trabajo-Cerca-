"""Regresiones Motor D: evitar falsos positivos, respetar cierres, conservar 12 comunas."""
import unittest
from bs4 import BeautifulSoup
import motor_d_territorial_daily as engine

class TerritorialSafetyTests(unittest.TestCase):
    def test_exactly_twelve_communes_and_no_quilaco(self):
        self.assertEqual(len(engine.COMMUNES),12)
        self.assertEqual(len(set(engine.COMMUNES)),12)
        self.assertNotIn("Quilaco",engine.COMMUNES)
        self.assertEqual(set(town for town,_,_ in engine.SEEDS),set(engine.COMMUNES))

    def test_index_closed_overrides_stale_detail(self):
        html='<div class="vacante">Postulación Cerrada <a href="/oferta-laboral-convocatoria-conaf/">CONVOCATORIA CONAF</a></div>'
        items=engine.links_from(BeautifulSoup(html,"html.parser"),"https://www.munimulchen.cl/empleos/")
        self.assertEqual(len(items),1)
        self.assertEqual(items[0][2],"closed")

    def test_open_index(self):
        html='<div>Postulación Abierta <a href="/oferta-laboral-operarios/">Operarios agrícolas</a></div>'
        items=engine.links_from(BeautifulSoup(html,"html.parser"),"https://www.munimulchen.cl/empleos/")
        self.assertEqual(items[0][2],"open")

    def test_ignore_index_page_self_link(self):
        html='<a href="/pagina-central-ofertas-laborales/">Ofertas Laborales</a>'
        items=engine.links_from(BeautifulSoup(html,"html.parser"),"https://www.munimulchen.cl/pagina-central-ofertas-laborales/")
        self.assertEqual(items,[])

    def test_external_host_is_not_followed(self):
        html='<a href="https://example.org/trabajo-operadores">Trabajo Operadores</a>'
        items=engine.links_from(BeautifulSoup(html,"html.parser"),"https://www.munimulchen.cl/empleos/")
        self.assertEqual(items,[])

    def test_closed_wording_is_recognized(self):
        self.assertTrue(engine.CLOSED.search("Postulación Cerrada"))
        self.assertTrue(engine.CLOSED.search("Postulaciones Cerradas"))
        self.assertFalse(engine.CLOSED.search("Postulación Abierta"))

    def test_closed_variants_with_whitespace(self):
        for phrase in ("Postulación   Cerrada", "Postulaciones Cerradas", "Proceso finalizado", "Convocatoria cerrada"):
            with self.subTest(phrase=phrase):
                self.assertTrue(engine.CLOSED.search(phrase))
        self.assertFalse(engine.CLOSED.search("Postulación abierta"))

    def test_internal_call_with_spaces(self):
        self.assertTrue(engine.INTERNAL_ONLY.search("Concurso    interno"))
        self.assertTrue(engine.GENERAL_INDEX.fullmatch("Llamado a concurso público"))

    def test_internal_jobs_are_not_open_public_offers(self):
        self.assertTrue(engine.INTERNAL_ONLY.search("Concurso Interno profesional"))
        self.assertTrue(engine.GENERAL_INDEX.fullmatch("Concursos Públicos"))
        self.assertTrue(engine.GENERAL_INDEX.fullmatch("Concursos Internos"))

    def test_closed_link_label_overrides_stale_page(self):
        html='<a href="/oferta-laboral-camion/">Oferta Laboral Postulación Cerrada Conductor Camión</a>'
        items=engine.links_from(BeautifulSoup(html,"html.parser"),"https://www.munimulchen.cl/empleos/")
        self.assertEqual(items[0][2],"closed")

    def test_advertisement_no_job_url(self):
        html='<a href="/noticias/municipio-anuncia-obras/">Alcalde informa de actividades comunitarias</a>'
        items=engine.links_from(BeautifulSoup(html,"html.parser"),"https://www.munimulchen.cl/empleos/")
        self.assertEqual(items,[])

if __name__=="__main__":
    unittest.main()
