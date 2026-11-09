"""Regresiones Motor D: evitar falsos positivos, respetar cierres y conservar territorios."""
import unittest
from bs4 import BeautifulSoup
import motor_d_territorial_daily as engine

class TerritorialSafetyTests(unittest.TestCase):
    def test_twelve_communes_exclude_quilaco_and_every_commune_has_a_seed(self):
        self.assertEqual(len(engine.COMMUNES),12)
        self.assertEqual(len(set(engine.COMMUNES)),12)
        self.assertNotIn("Quilaco",engine.COMMUNES)
        self.assertEqual(set(town for town,_,_ in engine.SEEDS),set(engine.COMMUNES))

    def test_parallel_source_sweep_keeps_all_12_communes_and_honest_indeed_failures(self):
        import json
        import tempfile
        from pathlib import Path
        from unittest.mock import patch

        def artificial_scan(seed):
            town, source, url = seed
            blocked = source.startswith("Indeed")
            return {"commune": town, "source": source, "url": url,
                    "status": "http_restricted" if blocked else "scanned_no_candidates",
                    "checked_at": engine.NOW.isoformat(), "http": 403 if blocked else 200,
                    "links_found": 0, "details_opened": 0, "candidates": [],
                    "errors": []}

        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(engine, "ROOT", Path(tmp)), \
             patch.object(engine, "inspect", side_effect=artificial_scan) as inspected:
            engine.main()
            report = json.loads((Path(tmp) / "territorial_daily.json").read_text())
            self.assertEqual(inspected.call_count, len(engine.SEEDS) + len(engine.INDEED_SEEDS))
            self.assertEqual(report["sources_total"], len(engine.SEEDS) + 12)
            self.assertEqual(set(report["communes_visited"]), set(engine.COMMUNES))
            self.assertEqual(report["missing_communes"], [])
            self.assertEqual(report["indeed_critical"]["sources_blocked"], 12)
            self.assertFalse(report["indeed_critical"]["complete"])
            self.assertEqual(report["confirmed_new_publications"], 0)
            self.assertEqual(report["published_in_trabajo_cerca"], 0)
            self.assertEqual(report["express_ready_candidates"], 0)

    def test_mininco_keeps_collipulli_administrative_mapping(self):
        self.assertEqual(engine.explicit_work_commune("Lugar de trabajo: Mininco."), "Collipulli")

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

    def test_real_source_pr_audit_is_read_only_and_cannot_publish(self):
        from pathlib import Path
        path = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "motor-d-territorial-daily.yml"
        workflow = path.read_text(encoding="utf-8")
        self.assertIn("fix/motor-d-ocr-bridge-20261108", workflow)
        self.assertIn("territorial_audit_pr:", workflow)
        audit = workflow.split("  territorial_audit_pr:", 1)[1].split("\n  territorial_scan:", 1)[0]
        production = workflow.split("\n  territorial_scan:", 1)[1]
        self.assertIn("contents: read", audit)
        self.assertIn("python automation/motor_d_territorial_daily.py", audit)
        self.assertIn("upload-artifact@v4", audit)
        self.assertNotIn("python automation/motor_d_express.py", audit)
        self.assertNotIn("git push", audit)
        self.assertIn("if: github.event_name != 'pull_request'", production)
        self.assertIn("python automation/motor_d_express.py", production)

    def test_unsafe_source_urls_and_redirects_never_receive_http_reads(self):
        from unittest.mock import patch
        for unsafe in ("http://munimulchen.cl/empleos",
                       "https://127.0.0.1/private",
                       "https://169.254.169.254/latest/meta-data",
                       "https://localhost/offer",
                       "https://internal.local/post"):
            with self.subTest(url=unsafe), patch.object(engine.requests, "get") as get:
                status, soup, reason = engine.request_page(unsafe)
                self.assertEqual((status, soup, reason),
                                 (0, None, "source_url_not_authorized"))
                get.assert_not_called()

    def test_redirect_outside_publisher_is_blocked_before_following(self):
        from unittest.mock import patch
        class Response:
            status_code = 302
            headers = {"Location": "https://evil.example/offer"}
            def close(self): pass
        with patch.object(engine.requests, "get", return_value=Response()) as get:
            status, soup, reason = engine.request_page("https://www.munimulchen.cl/empleos")
            self.assertEqual(status, 302)
            self.assertIsNone(soup)
            self.assertEqual(reason, "redirect_not_authorized")
            self.assertEqual(get.call_count, 1)
            self.assertFalse(get.call_args.kwargs["allow_redirects"])

    def test_chiletrabajos_generic_national_results_are_not_city_offers(self):
        from unittest.mock import patch
        generic = BeautifulSoup(
            "<html><h1>Trabajos recientes en Chile</h1>"
            "<a href='/trabajo/operador-123'>Operador de planta</a></html>", "html.parser")
        with patch.object(engine, "request_page", return_value=(200, generic, None)) as page:
            result = engine.inspect(("Angol", "Chiletrabajos · Angol",
                "https://www.chiletrabajos.cl/ciudad/angol.html"))
            self.assertEqual(result["status"], "search_filter_not_confirmed")
            self.assertEqual(result["candidates"], [])
            self.assertEqual(page.call_count, 1)

    def test_real_city_index_to_individual_verified_offer_stays_publishable(self):
        from datetime import timedelta
        from unittest.mock import patch
        from motor_d_express import classify as classify_ready
        day = engine.NOW.date()
        deadline = day + timedelta(days=30)
        index = BeautifulSoup(
            "<h1>Trabajos en Angol, Región Araucanía</h1>"
            "<a href='/trabajo/tecnico-telecom-3990000'>"
            "Técnico Telecomunicaciones - Angol</a>", "html.parser")
        detail = BeautifulSoup(
            f"<h1>Técnico Telecomunicaciones - Angol</h1>"
            f"<div>ID 3990000 Buscado DOMINION SPA Fecha {day.isoformat()} "
            f"Expira {deadline.isoformat()} Ubicación Angol CL Categoría "
            f"Informática / Telecomunicaciones Postular</div>", "html.parser")
        url = "https://www.chiletrabajos.cl/ciudad/angol.html"
        with patch.object(engine, "request_page",
                          side_effect=[(200, index, None), (200, detail, None)]):
            report = engine.inspect(("Angol", "Chiletrabajos · Angol", url))
        self.assertEqual(report["status"], "scanned_with_candidates")
        self.assertEqual(len(report["candidates"]), 1)
        item = report["candidates"][0]
        self.assertEqual(item["work_commune"], "Angol")
        self.assertEqual(item["employer"], "DOMINION SPA")
        self.assertEqual(item["date_source"], day.isoformat())
        self.assertEqual(item["deadline"], deadline.isoformat())
        self.assertTrue(item["application_evidence"])
        state, reason, offer = classify_ready(item, day)
        self.assertEqual(state, "EXPRESS")
        self.assertEqual(offer["comunas"], ["Angol"])
        self.assertEqual(offer["fecha_cierre"], deadline.isoformat())

    def test_critical_chiletrabajos_city_index_is_explicit(self):
        matches = [(town,url) for town, source, url in engine.SEEDS
                   if source == "Chiletrabajos · Angol"]
        self.assertEqual(matches,
                         [("Angol", "https://www.chiletrabajos.cl/ciudad/angol.html")])

    def test_safe_same_publisher_redirect_remains_readable(self):
        from unittest.mock import patch
        class Response:
            def __init__(self, code, headers, body=b""):
                self.status_code, self.headers, self.body = code, headers, body
            def iter_content(self, _):
                yield self.body
            def close(self): pass
        redirect = Response(301, {"Location": "https://munimulchen.cl/ofertas"})
        html = Response(200, {"Content-Type": "text/html"},
                        b"<main><a href='/oferta-laboral-1'>Oferta laboral</a></main>")
        with patch.object(engine.requests, "get", side_effect=[redirect, html]) as get:
            status, soup, reason = engine.request_page("https://www.munimulchen.cl/empleos")
            self.assertEqual(status, 200)
            self.assertIsNone(reason)
            self.assertEqual(soup.find("a").get_text(), "Oferta laboral")
            self.assertEqual(get.call_count, 2)
            self.assertEqual(get.call_args_list[1].args[0],
                             "https://munimulchen.cl/ofertas")

    def test_daily_writers_share_concurrency_group_and_preserve_artifacts(self):
        from pathlib import Path
        workflow_dir = Path(__file__).resolve().parents[1] / ".github" / "workflows"
        for name in ("motor-d-territorial-daily.yml", "trabajo-cerca-radar-diario.yml"):
            workflow = (workflow_dir / name).read_text(encoding="utf-8")
            self.assertIn("group: trabajo-cerca-motor-d-ready-writers", workflow)
            self.assertIn("cancel-in-progress: false", workflow)
            self.assertIn("upload-artifact@v4", workflow)

    def test_external_host_is_not_followed(self):
        html='<a href="https://example.org/trabajo-operadores">Trabajo Operadores</a>'
        items=engine.links_from(BeautifulSoup(html,"html.parser"),"https://www.munimulchen.cl/empleos/")
        self.assertEqual(items,[])

    def test_explicit_expired_deadline_is_detected(self):
        from datetime import date
        today = date(2026, 11, 8)
        self.assertTrue(engine.explicit_deadline_expired("Postula hasta el 2026-10-31", today))
        self.assertTrue(engine.explicit_deadline_expired("Cierre de postulaciones: 31/10/2026", today))
        self.assertTrue(engine.explicit_deadline_expired("Postula hasta el 31 de octubre del 2026", today))
        self.assertFalse(engine.explicit_deadline_expired("Postula hasta el 2026-12-31", today))

    def test_individual_job_keeps_verified_explicit_deadline(self):
        from datetime import date, timedelta
        from unittest.mock import patch
        published = engine.NOW.date().isoformat()
        closing = (engine.NOW.date() + timedelta(days=14)).isoformat()
        index = BeautifulSoup(
            '<main><a href="/oferta-laboral-operadores">Oferta laboral operadores</a></main>',
            "html.parser")
        detail = BeautifulSoup(
            f'<meta property="article:published_time" content="{published}">'
            f'<article><h1>Oferta laboral operadores</h1>'
            f'<p>Empresa: Maderera del Sur. Lugar de trabajo: Mulchén. '
            f'Cierre de postulaciones: {closing}. Postular en el sitio oficial.</p>'
            f'</article>', "html.parser")
        base = "https://www.munimulchen.cl/empleos/"
        def page(url):
            return (200, index if url == base else detail, None)
        with patch.object(engine, "request_page", side_effect=page):
            report = engine.inspect(("Mulchén", "OMIL test", base))
        self.assertEqual(len(report["candidates"]), 1)
        job = report["candidates"][0]
        self.assertEqual(job["deadline"], closing)
        self.assertEqual(job["date_source"], published)
        self.assertEqual(job["employer"], "Maderera del Sur")
        self.assertEqual(job["work_commune"], "Mulchén")
        self.assertTrue(job["application_evidence"])
        self.assertEqual(engine.explicit_deadline_date(
            f"Cierre de postulaciones: {closing}"), date.fromisoformat(closing))

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
        self.assertTrue(engine.explicit_application("Postular en el sitio oficial"))
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
