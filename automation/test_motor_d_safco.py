"""SAFCO employer inline vacancy cards: review leads but no invented dates."""
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup
import motor_d_territorial_daily as engine
from motor_d_express import classify
from motor_d_safco import allowed_source,extract_open_safco_cards
from motor_d_source_registry import assess,plan


BASE="https://safcoltda.cl/"
TITLES=("Operario","Operador Maquinaria Forestal","Brigadista de Incendios","Técnico Silvícola")


def site():
    cards="".join(
        "<div class='card'><span>Disponible</span><h4>"+title+
        "</h4><small>Collipulli</small><p>Trabajo en operaciones forestales "
        "con experiencia y capacitación requeridas.</p><button>Ver detalles</button></div>"
        for title in TITLES)
    return BeautifulSoup(
        "<html><body><nav>Trabaje con Nosotros</nav><h2>Brigadas de Incendios</h2>"
        "<p>Servicio forestal, no un cargo.</p><div>Únete al equipo</div>"
        "<section><h2>Trabaje con Nosotros</h2><p>Buscamos personas comprometidas</p>"
        +cards+"</section><footer>Vacante disponible Postular a este cargo</footer>"
        "</body></html>","html.parser")


class SafcoPublicCardsTests(unittest.TestCase):
    def test_four_official_collipulli_cards_are_captured(self):
        rows=extract_open_safco_cards(site(),BASE)
        self.assertEqual(len(rows),4)
        self.assertEqual({x["title"] for x in rows},set(TITLES))
        self.assertEqual({x["work_commune"] for x in rows},{"Collipulli"})
        self.assertTrue(all(x["status_open_marker"]=="Disponible" for x in rows))
        self.assertTrue(all(x["date_source"] is None for x in rows))
        self.assertTrue(all(x["application_evidence"] is False for x in rows))
        self.assertEqual(len({x["id"] for x in rows}),4)

    def test_generic_service_heading_never_becomes_a_job(self):
        rows=extract_open_safco_cards(site(),BASE)
        self.assertEqual(len(rows),4)
        self.assertTrue(all(x["title"]!="Servicios Forestales" for x in rows))

    def test_real_safco_three_repeated_hiring_headings_never_pick_footer(self):
        """Regression for GitHub Actions DOM: 239 tokens, 3 headings, 4 open roles.

        The last heading is in the footer, AFTER the last role card.
        """
        cards="".join(
            "<article><span>Disponible</span><h4>"+title+
            "</h4><span>Collipulli</span><p>Faena forestal comprobable</p>"
            "<button>Ver detalles</button></article>"
            for title in TITLES
        )
        markup=(
            "<nav><a>Trabaje con Nosotros</a></nav>"+
            "<section><h2>Trabaje con Nosotros</h2>"+
            ''.join("<div>Servicios y experiencia</div>" for _ in range(175))+
            "<p>Buscamos personas comprometidas</p>"+
            cards+"</section>"+
            "<div>Vacante disponible</div><button>Postular a este cargo</button>"+
            "<footer><a>Trabaje con Nosotros</a>"+''.join(
                "<span>Contacto de empresa</span>" for _ in range(75))+"</footer>"
        )
        soup=BeautifulSoup(markup,"html.parser")
        self.assertEqual(sum(x.strip()=="Disponible" for x in soup.stripped_strings),4)
        self.assertEqual(sum(x.strip()=="Trabaje con Nosotros" for x in soup.stripped_strings),3)
        got=extract_open_safco_cards(soup,BASE)
        self.assertEqual(len(got),4)
        self.assertEqual({x["title"] for x in got},set(TITLES))

    def test_generic_availability_not_formatted_as_job_is_ignored(self):
        soup=BeautifulSoup(
            "<h2>Trabaje con Nosotros</h2><p>Disponible</p>"
            "<p>Estamos disponibles para consultas</p><p>Collipulli</p>"
            "<button>Contacto</button>","html.parser")
        self.assertEqual(extract_open_safco_cards(soup,BASE),[])

    def test_closed_card_or_offsite_card_not_detected(self):
        soup=BeautifulSoup(
            "<h2>Trabaje con Nosotros</h2><p>Cerrado</p>"
            "<h4>Supervisor/a</h4><p>Collipulli</p>","html.parser")
        self.assertEqual(extract_open_safco_cards(soup,BASE),[])
        outside=BeautifulSoup(
            "<section><h2>Trabaje con Nosotros</h2><div>Disponible</div>"
            "<h4>Operador</h4><p>Temuco</p><p>Trabajo profesional</p>"
            "<button>Ver detalles</button></section>","html.parser")
        self.assertEqual(extract_open_safco_cards(outside,BASE),[])

    def test_host_validation(self):
        self.assertTrue(allowed_source(BASE))
        for bad in ("http://safcoltda.cl/","https://evil.example/",
                    "https://safcoltda.cl/private","https://safcoltda.cl/?role=1"):
            with self.subTest(url=bad):
                self.assertFalse(allowed_source(bad))

    def test_engine_uses_only_official_card_reader_and_stays_unpublished(self):
        with patch.object(engine,"request_page",return_value=(200,site(),None)):
            out=engine.inspect(("Collipulli","SAFCO · Trabaje con nosotros Collipulli",BASE))
        self.assertEqual(out["embedded_open_cards"],4)
        self.assertEqual(out["source_reader"],"safco_embedded_cards_review_only")
        self.assertEqual(out["links_found"],4)
        for row in out["candidates"]:
            self.assertNotIn(classify(row,engine.NOW.date())[0],("EXPRESS","RECUPERACION"))

    def test_source_coverage_still_needs_individual_proof(self):
        cfg={"territories":list(engine.COMMUNES),"seed_urls":[],"discovery":[],"social_reference":[]}
        planned=plan([("Collipulli","SAFCO · Trabaje con nosotros Collipulli",BASE)],
                     [],config=cfg,audit={"seed_pages":[]},social_refs=[],portals={})
        with patch.object(engine,"request_page",return_value=(200,site(),None)):
            observed=engine.inspect(("Collipulli","SAFCO · Trabaje con nosotros Collipulli",BASE))
        coverage=assess(planned,[observed],{})
        self.assertEqual(coverage["automatic_attempted"],1)
        self.assertEqual(coverage["unresolved_total"],1)
        self.assertEqual(coverage["pending"][0]["status"],"requires_specialized_reader")


if __name__=="__main__":
    unittest.main()
