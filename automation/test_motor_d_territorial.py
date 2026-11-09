"""Regresiones Motor D: evitar falsos positivos, respetar cierres y conservar territorios."""
import unittest
from bs4 import BeautifulSoup
import motor_d_territorial_daily as engine

class TerritorialSafetyTests(unittest.TestCase):
    def test_thirteen_communes_include_quilaco_and_every_commune_has_a_seed(self):
        self.assertEqual(len(engine.COMMUNES),13)
        self.assertEqual(len(set(engine.COMMUNES)),13)
        self.assertIn("Quilaco",engine.COMMUNES)
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

    def test_commune_requires_explicit_job_location(self):
        self.assertIsNone(engine.explicit_work_commune("Municipalidad de Mulchén publica una convocatoria"))
        self.assertEqual(engine.explicit_work_commune("Lugar de trabajo: Mininco, región de La Araucanía."), "Collipulli")
        self.assertEqual(engine.explicit_work_commune("Comuna de trabajo: Coihue."), "Negrete")
        self.assertEqual(engine.explicit_work_commune("Ubicación laboral: Angol."), "Angol")

    def test_employer_requires_evidence(self):
        self.assertIsNone(engine.explicit_employer("La OMIL informa vacantes sin nombre del empleador"))
        self.assertEqual(engine.explicit_employer("Empresa: Maderera del Sur. Cargo: operador"), "Maderera del Sur")

    def test_application_evidence_required(self):
        self.assertTrue(engine.explicit_application("Postulaciones abiertas hasta el lunes"))
        self.assertTrue(engine.explicit_application("Enviar CV al contacto oficial"))
        self.assertFalse(engine.explicit_application("Programa municipal de empleabilidad"))

    def test_chiletrabajos_individual_metadata(self):
        html="""<html><h1>Técnico Telecomunicaciones - Angol</h1>
          <div>ID 3926909 Buscado DOMINION SPA Fecha 2026-11-05
          Expira 2027-01-19 Ubicación Angol Categoría Informática Postular</div></html>"""
        result=engine.chiletrabajos_metadata(BeautifulSoup(html,"html.parser"),
            "Técnico Telecomunicaciones - Angol",
            "https://www.chiletrabajos.cl/trabajo/tecnico-telecomunicaciones-angol-3926909")
        self.assertEqual(result["employer"],"DOMINION SPA")
        self.assertEqual(result["work_commune"],"Angol")
        self.assertTrue(result["application_evidence"])
        self.assertFalse(result["source_closed"])

    def test_chiletrabajos_worksite_overrides_recruitment_city(self):
        html="""<h1>Se buscan enfierradores Nacimiento</h1>
          <div>Buscado Constructora ALJO Fecha 2026-11-04 Expira 2027-01-18
          Ubicación Angol Categoría Otros</div>
          <article>Obra en ejecución en el Hospital de Nacimiento. Postular.</article>"""
        result=engine.chiletrabajos_metadata(BeautifulSoup(html,"html.parser"),
            "Se buscan enfierradores Nacimiento",
            "https://www.chiletrabajos.cl/trabajo/se-buscan-enfierradores-nacimiento-3926105")
        self.assertEqual(result["work_commune"],"Nacimiento")
        self.assertEqual(result["employer"],"Constructora ALJO")

    def test_chiletrabajos_index_never_is_a_verified_job(self):
        result=engine.chiletrabajos_metadata(BeautifulSoup("<h1>Trabajos</h1>","html.parser"),
            "Trabajos","https://www.chiletrabajos.cl/encuentra-un-empleo/?2=angol")
        self.assertIsNone(result)

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

    def test_indeed_critical_all_12_communes(self):
        self.assertEqual(len(engine.INDEED_SEEDS),12)
        self.assertEqual({x[0] for x in engine.INDEED_SEEDS},set(engine.COMMUNES))
        self.assertTrue(all("cl.indeed.com/jobs" in x[2] for x in engine.INDEED_SEEDS))
        self.assertTrue(any("fashionspark.hiringroom.com/jobs" in x[2] for x in engine.SEEDS))

    def test_fashionspark_ats_metadata_does_not_invent_source_date(self):
        html="""<h1>Asistente de Aseo PT 20 HR (Angol)</h1>
        <section>Angol, Araucanía, Chile. Hace 2 horas.
        Descripción del puesto. Requisitos. Postularse</section>"""
        meta=engine.hiringroom_metadata(BeautifulSoup(html,"html.parser"),
          "Asistente de Aseo PT 20 HR (Angol)",
          "https://fashionspark.hiringroom.com/jobs/get_vacancy/6aec988122ecc8f6459cb62a")
        self.assertEqual(meta["employer"],"Fashion's Park")
        self.assertEqual(meta["work_commune"],"Angol")
        self.assertTrue(meta["application_evidence"])
        self.assertNotIn("date_source",meta)

    def test_unimarc_alert_is_not_a_job(self):
        items=engine.links_from(BeautifulSoup(
          '<a href="/alertas-de-empleo">Gestionar tus alertas</a>',"html.parser"),
          "https://unimarc.trabajando.cl/")
        self.assertEqual(items,[])

    def test_advertisement_no_job_url(self):
        html='<a href="/noticias/municipio-anuncia-obras/">Alcalde informa de actividades comunitarias</a>'
        items=engine.links_from(BeautifulSoup(html,"html.parser"),"https://www.munimulchen.cl/empleos/")
        self.assertEqual(items,[])

if __name__=="__main__":
    unittest.main()
