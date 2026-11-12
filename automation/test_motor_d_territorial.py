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
            town, source, url = seed[:3]
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
            self.assertTrue(report["source_inventory"]["all_automatic_sources_attempted"])
            self.assertEqual(report["source_inventory"]["not_attempted"],0)
            for town in engine.COMMUNES:
                by_source=report["source_inventory"]["per_commune"][town]
                shown=report["commune_status"][town]
                self.assertEqual(shown["sources_registered"],by_source["registered"])
                self.assertEqual(shown["sources_attempted"],
                                 by_source["registered"]-by_source["unvisited"]-by_source["social_unread"])
                self.assertEqual(shown["sources_accessible"],by_source["accessible"])
                self.assertGreater(shown["sources_registered"],0)
            self.assertEqual(set(report["communes_visited"]), set(engine.COMMUNES))
            self.assertEqual(report["missing_communes"], [])
            self.assertEqual(report["indeed_critical"]["sources_blocked"], 12)
            self.assertFalse(report["indeed_critical"]["complete"])
            self.assertEqual(report["confirmed_new_publications"], 0)
            self.assertEqual(report["published_in_trabajo_cerca"], 0)
            self.assertEqual(report["express_ready_candidates"], 0)

    def test_municipal_wordpress_feed_recovers_job_when_html_index_blocked(self):
        from unittest.mock import patch
        idx="https://muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/"
        link="https://muninegrete.cl/convocatoria-laboral-operario-noviembre/"
        wp={"status":"ok","pages":[{"url":link,"anchor":"Oferta laboral operario",
                                   "kind":"local_page"}],
            "links_found":1,"checked":[{"status":"usable","url":"https://muninegrete.cl/feed/"}],
            "sources_blocked":0}
        page=BeautifulSoup(
            "<html><h1>Oferta laboral Operario Negrete</h1><article>"
            "<p>Empresa: Maderas Terreno SpA. Lugar de trabajo: Negrete. "
            "Se necesita operario y enviar CV para postulación. "
            "Trabajo en planta industrial en Negrete durante noviembre.</p>"
            "</article></html>","html.parser")
        def get(url):
            if url==idx:return 403,None,None
            if url==link:return 200,page,None
            raise AssertionError("URL inesperada "+url)
        with patch.object(engine,"discover_municipal",return_value=wp), \
             patch.object(engine,"request_page",side_effect=get):
            result=engine.inspect(("Negrete","Municipio Negrete OMIL",idx))
        self.assertEqual(result["status"],"scanned_with_candidates")
        self.assertEqual(result["http"],403)
        self.assertEqual(result["index_status"],"blocked_but_authorized_feed_accessible")
        self.assertEqual(result["municipal_feed_status"],"ok")
        self.assertEqual(len(result["candidates"]),1)
        self.assertEqual(result["candidates"][0]["work_commune"],"Negrete")
        self.assertEqual(result["candidates"][0]["date_source"],None)
        self.assertFalse(result["candidates"][0]["express_ready"])

    def test_municipal_embedded_pdf_requires_review_and_cannot_publish(self):
        from unittest.mock import patch
        idx="https://municipalidadrenaico.cl/concursos-publicos/"
        article="https://municipalidadrenaico.cl/concurso-publico-salud/"
        index=BeautifulSoup(
            "<html><a href='/concurso-publico-salud/'>"
            "Llamado a concurso público para cargo salud</a></html>",
            "html.parser")
        detail=BeautifulSoup(
            "<html><h1>Concurso público para proveer cargo salud</h1>"
            "<article><p>Municipalidad invita a postular al concurso.</p>"
            "<iframe src='/wp-content/uploads/2026/10/BASES-Y-CALENDARIO.pdf'></iframe>"
            "</article></html>","html.parser")
        feed={"status":"ok","pages":[{"url":article,"anchor":"Llamado a concurso público",
                                      "kind":"local_page"}],
              "checked":[{"status":"usable","url":"https://municipalidadrenaico.cl/feed/"}],
              "links_found":1,"sources_blocked":0}
        def get(url):
            return (200,index,None) if url==idx else (200,detail,None)
        with patch.object(engine,"discover_municipal",return_value=feed), \
             patch.object(engine,"request_page",side_effect=get) as reader:
            result=engine.inspect(("Renaico","Municipio Renaico",idx))
        self.assertEqual(len(result["candidates"]),1)
        self.assertEqual(result["links_found"],1)
        self.assertEqual(len(result["documents_for_review"]),1)
        self.assertTrue(result["documents_for_review"][0]["review_required"])
        self.assertTrue(result["documents_for_review"][0]["url"].endswith("BASES-Y-CALENDARIO.pdf"))
        self.assertFalse(result["candidates"][0]["express_ready"])
        self.assertEqual(reader.call_count,2)

    def test_municipal_feed_blocked_is_not_zero_vacancies(self):
        from unittest.mock import patch
        idx="https://muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/"
        feed={"status":"blocked","pages":[],"checked":[{"status":"blocked"}],
              "links_found":0,"sources_blocked":2}
        with patch.object(engine,"discover_municipal",return_value=feed), \
             patch.object(engine,"request_page",return_value=(403,None,None)):
            result=engine.inspect(("Negrete","Municipio Negrete OMIL",idx))
        self.assertEqual(result["status"],"http_restricted")
        self.assertEqual(result["municipal_feed_status"],"blocked")
        self.assertEqual(result["documents_for_review"],[])
        self.assertEqual(result["candidates"],[])
        self.assertNotIn("jobs_verified",result)

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

    def test_territorial_receipt_redacts_candidate_contacts(self):
        from unittest.mock import patch
        from ocr_review_security import redact
        source="https://www.munimulchen.cl/empleos"
        index=BeautifulSoup(
            "<a href='/oferta-laboral-operario'>Oferta laboral operario</a>",
            "html.parser")
        detail=BeautifulSoup(
            "<article><h1>Oferta laboral operario</h1>"
            "<p>Empresa: Maderas Ejemplo. Lugar de trabajo: Mulchén. "
            "Postular en el portal. Contacto: persona@example.cl "
            "Teléfono: +56 9 1234 5678. Se necesita operario responsable "
            "con experiencia en máquinas y mantenimiento industrial.</p>"
            "</article>","html.parser")
        with patch.object(engine,"request_page",side_effect=[(200,index,None),(200,detail,None)]):
            result=engine.inspect(("Mulchén","Municipio Mulchén",source))
        self.assertEqual(len(result["candidates"]),1)
        excerpt=result["candidates"][0]["excerpt"]
        self.assertNotIn("persona@example.cl",excerpt)
        self.assertNotIn("1234 5678",excerpt)
        self.assertIn("[correo]",excerpt)
        self.assertIn("[teléfono]",excerpt)

    def test_reponedor_cross_posted_from_concepcion_uses_muelchen_worksite(self):
        from datetime import date
        from unittest.mock import patch
        from motor_d_express import classify as classify_ready
        url=("https://www.chiletrabajos.cl/trabajo/"
             "reponedor-part-time-mulchen-3927989")
        html=BeautifulSoup(
            "<html><h1>REPONEDOR PART TIME MULCHEN</h1>"
            "<div>Buscado Cultiva Fecha 2026-11-06 16:59:10 "
            "Expira 2027-01-20 Ubicación Concepción Categoría Ventas "
            "Postular</div>"
            "<article>Buscamos Mercaderistas part time, para realizar "
            "reposición de 30 minutos una vez por semana, tenemos "
            "disponible supermercado en MULCHEN, se paga $5.000. "
            "Enviar curriculum e indicar que localidad postula."
            "</article></html>", "html.parser")
        with patch.object(engine,"request_page",return_value=(200,html,None)):
            row=engine.inspect(("Mulchén","Chiletrabajos · Reponedor Mulchén",url))["candidates"][0]
        self.assertEqual(row["work_commune"],"Mulchén")
        self.assertEqual(row["employer"],"Cultiva")
        self.assertEqual(row["date_source"],"2026-11-06")
        self.assertEqual(row["deadline"],"2027-01-20")
        self.assertTrue(row["application_evidence"])
        self.assertEqual(classify_ready(row,date(2026,11,9))[0],"RECUPERACION")

    def test_malleco_municipal_construction_job_uses_explicit_worksite(self):
        from datetime import date
        from unittest.mock import patch
        from motor_d_express import classify as classify_ready
        url=("https://www.chiletrabajos.cl/trabajo/"
             "prevencionista-de-riesgos-malleco-3924497")
        html=BeautifulSoup(
            "<html><h1>PREVENCIONISTA DE RIESGOS – MALLECO</h1>"
            "<div>Buscado Constructora Fecha 2026-11-02 13:29:45 "
            "Expira 2027-01-16 Ubicación Angol Categoría Técnicos Postular</div>"
            "<article>Empresa constructora requiere prevencionista de riesgos "
            "para sus obras ubicadas en Purén, Los Sauces y Traiguén. "
            "POSTULACIÓN: Enviar CV indicando disponibilidad. "
            "Se requieren inspecciones y capacitaciones.</article>"
            "</html>", "html.parser")
        with patch.object(engine,"request_page",return_value=(200,html,None)):
            row=engine.inspect(("Purén","Chiletrabajos · Prevencionista obras Malleco",url))["candidates"][0]
        self.assertEqual(row["work_commune"],"Purén")
        self.assertEqual(row["employer"],"Constructora")
        self.assertEqual(classify_ready(row,date(2026,11,9))[0],"RECUPERACION")

    def test_cross_posting_direct_seeds_cover_three_communes(self):
        expected={
            "Traiguén": "part-time-para-traiguen-en-la-araucania-3924463",
            "Mulchén": "reponedor-part-time-mulchen-3927989",
            "Purén": "prevencionista-de-riesgos-malleco-3924497"
        }
        for town, slug in expected.items():
            rows=[url for commune, source, url in engine.SEEDS
                  if commune==town and url.endswith(slug)]
            self.assertEqual(len(rows),1)

    def test_individual_portal_seeds_recover_real_employer_date_and_worksite(self):
        from datetime import date
        from unittest.mock import patch
        from motor_d_express import classify as classify_ready
        url = ("https://www.chiletrabajos.cl/trabajo/"
               "mecanico-a-automotriz-nacimiento-3923364")
        html = BeautifulSoup(
            "<html><h1>Mecánico/a Automotriz – Nacimiento</h1>"
            "<div>Buscado Serfonac Fecha 2026-11-05 21:09:46 "
            "Expira 2027-01-19 Ubicación Los Ángeles Categoría Otros "
            "Postular</div>"
            "<article><p>Empresa del rubro forestal busca incorporar un "
            "Mecánico/a Automotriz para realizar labores de mantención y "
            "reparación de vehículos de la flota, con base en Nacimiento, "
            "Región del Biobío. Para postular, ingrese a la plataforma. "
            "Requisitos: experiencia en mecánica y mantención.</p></article>"
            "</html>", "html.parser")
        with patch.object(engine, "request_page", return_value=(200, html, None)) as page:
            report = engine.inspect(("Nacimiento",
                                    "Chiletrabajos · Serfonac mecánico automotriz", url))
        self.assertEqual(page.call_count, 1)
        self.assertEqual(report["status"], "scanned_with_candidates")
        self.assertEqual(len(report["candidates"]), 1)
        item = report["candidates"][0]
        self.assertEqual(item["employer"], "Serfonac")
        self.assertEqual(item["work_commune"], "Nacimiento")
        self.assertEqual(item["date_source"], "2026-11-05")
        self.assertEqual(item["deadline"], "2027-01-19")
        self.assertTrue(item["application_evidence"])
        self.assertFalse(item["source_commune_not_confirmed"])
        state, reason, offer = classify_ready(item, date(2026,11,9))
        self.assertEqual(state, "RECUPERACION")
        self.assertEqual(offer["comunas"], ["Nacimiento"])
        self.assertEqual(offer["fecha_cierre"], "2027-01-19")
        self.assertEqual(offer["fecha_publicacion"], "2026-11-05")

    def test_chiletrabajos_recruiter_city_without_title_or_worksite_remains_pending(self):
        from datetime import date
        from unittest.mock import patch
        from motor_d_express import classify as classify_ready
        url="https://www.chiletrabajos.cl/trabajo/docente-psicologo-3915967"
        page=BeautifulSoup(
            "<html><h1>DOCENTE PSICOLOGO</h1>"
            "<div>Buscado CORPORACION HD SPA Fecha 2026-10-18 "
            "Expira 2027-01-01 Ubicación Angol Categoría Educación "
            "Postular</div>"
            "<article>Se requiere docente psicólogo para impartir curso "
            "de competencias socioemocionales. Interesados postular "
            "en sitio del portal.</article></html>", "html.parser")
        with patch.object(engine,"request_page",return_value=(200,page,None)):
            job=engine.inspect(("Angol","Chiletrabajos · Docente test",url))["candidates"][0]
        self.assertIsNone(job["work_commune"])
        self.assertTrue(job["source_commune_not_confirmed"])
        self.assertEqual(classify_ready(job,date(2026,11,9))[0],"SEGUNDA_PASADA")

    def test_portal_recruitment_city_or_residence_does_not_prove_job_worksite(self):
        from unittest.mock import patch
        url="https://www.chiletrabajos.cl/trabajo/mecanico-nacimiento-3925555"
        html=BeautifulSoup(
            "<html><h1>Mecánico</h1><div>Buscado Serfonac Fecha 2026-11-05 "
            "Expira 2027-01-19 Ubicación Los Ángeles Categoría Otros Postular</div>"
            "<article><p>Buscamos mecánico. Ideal residencia en Nacimiento. "
            "Requisitos de mantención industrial.</p></article></html>",
            "html.parser")
        with patch.object(engine,"request_page",return_value=(200,html,None)):
            row=engine.inspect(("Nacimiento","Chiletrabajos · muestra",url))["candidates"][0]
        self.assertIsNone(row["work_commune"])
        self.assertTrue(row["source_commune_not_confirmed"])

    def test_direct_portal_recovery_seeds_have_known_individual_urls(self):
        names = [row for row in engine.SEEDS if row[1].startswith("Chiletrabajos · Serfonac")]
        self.assertEqual(len(names),3)
        self.assertTrue(all(town=="Nacimiento" and "/trabajo/" in url
                            for town,_,url in names))

    def test_municipal_article_content_survives_long_navigation_and_uses_full_title(self):
        from datetime import timedelta
        from unittest.mock import patch
        from motor_d_express import classify as classify_ready
        day = engine.NOW.date()
        closing = (day + timedelta(days=28)).isoformat()
        source = "https://www.munimulchen.cl/pagina-central-ofertas-laborales/"
        index = BeautifulSoup(
            "<a href='/oferta-laboral-operarios-arandanos/'>Oferta laboral Operarios Agrarios</a>",
            "html.parser")
        detail_html = (
            "<html><head><title>Oferta Laboral: Operarios Agrarios – Cosecha de Arándanos "
            "| Municipalidad Mulchén</title>"
            f"<meta property='article:published_time' content='{day.isoformat()}'></head>"
            "<body><nav>" + ("Noticias Municipalidad " * 600) + "</nav>"
            "<article><h1>Oferta Laboral</h1><p>Empresa: Agrícola Ejemplo. "
            "Lugar de trabajo: Mulchén. Se necesita operarios agrícolas. "
            f"Postular en página oficial. Cierre de postulaciones: {closing}."
            " Requisitos del cargo: experiencia en cosecha y disponibilidad "
            "para trabajo de temporada en la comuna.</p></article></body></html>"
        )
        detail = BeautifulSoup(detail_html, "html.parser")
        with patch.object(engine, "request_page",
                          side_effect=[(200,index,None),(200,detail,None)]):
            result = engine.inspect(("Mulchén","Municipio Mulchén empleos",source))
        self.assertEqual(len(result["candidates"]),1)
        item = result["candidates"][0]
        self.assertIn("Operarios Agrarios",item["title"])
        self.assertEqual(item["employer"],"Agrícola Ejemplo")
        self.assertEqual(item["work_commune"],"Mulchén")
        self.assertEqual(item["deadline"],closing)
        state,reason,offer=classify_ready(item,day)
        self.assertEqual(state,"EXPRESS")
        self.assertIsNotNone(offer)

    def test_arauco_official_ats_company_is_not_inferred_from_page_boilerplate(self):
        from unittest.mock import patch
        day=engine.NOW.date()
        base="https://jobs.arauco.com/Chile/search/"
        index=BeautifulSoup(
            "<a href='/Chile/job/collipulli/operador-mantenedor'>"
            "Operador mantenedor forestal</a>","html.parser")
        detail=BeautifulSoup(
            f"<meta property='article:published_time' content='{day.isoformat()}'>"
            "<article><h1>Operador mantenedor forestal</h1>"
            "<p>Para nuestras operaciones, Lugar de trabajo: Mininco. "
            "Postular en portal oficial de empleo. Buscamos operador mantenedor "
            "con experiencia en procesos productivos y mantenimiento.</p></article>",
            "html.parser")
        with patch.object(engine,"request_page",
                          side_effect=[(200,index,None),(200,detail,None)]):
            result=engine.inspect(("Collipulli","Arauco empleo",base))
        self.assertEqual(len(result["candidates"]),1)
        item=result["candidates"][0]
        self.assertEqual(item["employer"],"ARAUCO")
        self.assertEqual(item["work_commune"],"Collipulli")
        self.assertTrue(item["application_evidence"])

    def test_real_pr_preview_tracks_recovery_without_writing_application(self):
        from pathlib import Path
        path=Path(__file__).resolve().parents[1]/".github"/"workflows"/"motor-d-territorial-daily.yml"
        workflow=path.read_text(encoding="utf-8")
        audit=workflow.split("  territorial_audit_pr:",1)[1].split("\n  territorial_scan:",1)[0]
        self.assertIn("validate_inventory_freshness(report,today)",audit)
        self.assertIn("classified=build(report,today)",audit)
        self.assertIn("recovery_ready",audit)
        self.assertIn("feed_complete",audit)
        self.assertIn("catalog_identity_and_exact_semantic_checked",audit)
        self.assertIn("publications_created",audit)
        self.assertIn("territorial_pr_preview.json",audit)
        self.assertIn("TemporaryDirectory(prefix=",audit)
        self.assertIn("PR_REAL_SOURCE_BATCH_DRY_RUN",audit)
        self.assertIn("actual_ids!=expected_ids",audit)
        self.assertIn('"app_writes":0',audit)
        self.assertNotIn("produce(report",audit)
        self.assertNotIn("commit:true",audit)
        self.assertNotIn("git push",audit)

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

    def test_chiletrabajos_city_index_can_confirm_location_from_page_title(self):
        from unittest.mock import patch
        index = BeautifulSoup(
            "<html><head><title>Trabajos en Angol | Chiletrabajos</title></head>"
            "<body><main>No hay avisos aquí</main></body></html>", "html.parser")
        with patch.object(engine, "request_page", return_value=(200, index, None)):
            result = engine.inspect(("Angol", "Chiletrabajos · Angol",
                "https://www.chiletrabajos.cl/ciudad/angol.html"))
        self.assertEqual(result["status"], "scanned_no_candidates")
        self.assertNotIn("chiletrabajos_territory_heading_missing", result["errors"])

    def test_all_chiletrabajos_communes_use_city_not_national_keyword_queries(self):
        rows=[(town,source,url) for town,source,url in engine.SEEDS
              if source == "Chiletrabajos · " + town]
        self.assertEqual(len(rows),12)
        self.assertEqual({town for town,_,_ in rows},set(engine.COMMUNES))
        for town,_,url in rows:
            self.assertIn("/ciudad/",url)
            self.assertNotIn("?2=",url)
            self.assertNotIn("/encuentra-un-empleo",url)
        self.assertIn(("Nacimiento","Chiletrabajos · Nacimiento",
                       "https://www.chiletrabajos.cl/ciudad/nacimiento.html"),rows)
        self.assertIn(("Mulchén","Chiletrabajos · Mulchén",
                       "https://www.chiletrabajos.cl/ciudad/mulchen.html"),rows)

    def test_national_keyword_page_does_not_count_as_geographic_coverage(self):
        from unittest.mock import patch
        url="https://www.chiletrabajos.cl/ciudad/collipulli.html"
        page=BeautifulSoup(
            "<html><h1>Trabajos de Collipulli</h1>"
            "<a href='/trabajo/mecanico-999'>Mecánico de maquinaria</a></html>",
            "html.parser")
        with patch.object(engine,"request_page",side_effect=[
                (200,page,None),(403,None,None)]) as reader:
            result=engine.inspect(("Collipulli","Chiletrabajos · Collipulli",url))
        self.assertEqual(result["status"],"search_filter_not_confirmed")
        self.assertEqual(result["candidates"],[])
        self.assertEqual(result["fallback_http"],403)
        self.assertFalse(result["fallback_query_is_territorially_scoped"])
        self.assertEqual(reader.call_count,2)

    def test_chiletrabajos_only_dereferences_individual_job_urls(self):
        url = "https://www.chiletrabajos.cl/ciudad/angol.html"
        html = BeautifulSoup(
            "<h1>Trabajos en Angol</h1>"
            "<a href='/encuentra-un-empleo?2=angol'>Trabajos en Angol</a>"
            "<a href='/ciudad/victoria.html'>Empleos Victoria</a>"
            "<a href='/trabajo/tecnico-telecom-3990000'>Técnico Telecomunicaciones Angol</a>",
            "html.parser")
        links = engine.links_from(html, url)
        self.assertEqual(len(links), 1)
        self.assertTrue(links[0][0].endswith("/trabajo/tecnico-telecom-3990000"))

    def test_chiletrabajos_generic_national_results_are_not_city_offers(self):
        from unittest.mock import patch
        generic = BeautifulSoup(
            "<html><h1>Trabajos recientes en Chile</h1>"
            "<a href='/trabajo/operador-123'>Operador de planta</a></html>", "html.parser")
        with patch.object(engine, "request_page", side_effect=[
                (200,generic,None),(404,None,None)]) as page:
            result = engine.inspect(("Angol", "Chiletrabajos · Angol",
                "https://www.chiletrabajos.cl/ciudad/angol.html"))
            self.assertEqual(result["status"], "search_filter_not_confirmed")
            self.assertEqual(result["candidates"], [])
            self.assertFalse(result["index_scope_confirmed"])
            self.assertEqual(page.call_count, 2)

    def test_fallback_never_treats_national_search_as_a_verified_city_index(self):
        from unittest.mock import patch
        from datetime import timedelta
        from motor_d_express import classify as classify_ready
        day=engine.NOW.date().isoformat()
        expiry=(engine.NOW.date()+timedelta(days=30)).isoformat()
        index=BeautifulSoup("<h1>Trabajos en -</h1>","html.parser")
        fallback=BeautifulSoup(
            "<h1>Resultados de búsqueda Chile</h1>"
            "<a href='/trabajo/operario-victoria-3999901'>Operario Victoria</a>"
            "<a href='/trabajo/operario-santiago-3999902'>Operario Santiago</a>",
            "html.parser")
        local=BeautifulSoup(
            f"<h1>Operario Victoria</h1>"
            f"<div>Buscado Empresa Real Fecha {day} Expira {expiry} "
            "Ubicación Victoria Categoría Operarios Postular</div>"
            "<article><p>Buscamos operarios. Lugar de trabajo: Victoria. "
            "Postular mediante la ficha oficial del portal.</p></article>",
            "html.parser")
        national=BeautifulSoup(
            f"<h1>Operario Santiago</h1>"
            f"<div>Buscado Empresa Nacional Fecha {day} Expira {expiry} "
            "Ubicación Santiago Categoría Operarios Postular</div>"
            "<article><p>Lugar de trabajo: Santiago. Postular.</p></article>",
            "html.parser")
        calls=[]
        def fetch(url):
            calls.append(url)
            if url.endswith("ciudad/victoria.html"):return 200,index,None
            if "?2=Victoria" in url:return 200,fallback,None
            if url.endswith("3999901"):return 200,local,None
            if url.endswith("3999902"):return 200,national,None
            raise AssertionError("unexpected URL "+url)
        with patch.object(engine,"request_page",side_effect=fetch):
            result=engine.inspect(("Victoria","Chiletrabajos · Victoria",
                "https://www.chiletrabajos.cl/ciudad/victoria.html"))
        self.assertEqual(result["status"],"scanned_with_candidates")
        self.assertEqual(result["fallback_details_seen"],2)
        self.assertEqual(result["fallback_rejected_nonlocal_or_unknown"],1)
        self.assertEqual(len(result["candidates"]),1)
        self.assertEqual(result["candidates"][0]["work_commune"],"Victoria")
        self.assertEqual(result["candidates"][0]["explicit_worksite_commune"],"Victoria")
        self.assertFalse(result["candidates"][0]["source_commune_not_confirmed"])
        self.assertFalse(result["index_scope_confirmed"])
        self.assertEqual(classify_ready(result["candidates"][0],engine.NOW.date())[0],"EXPRESS")
        self.assertTrue(any("?2=Victoria" in url for url in calls))

    def test_national_fallback_rejects_person_name_victoria_while_job_is_in_santiago(self):
        from unittest.mock import patch
        index=BeautifulSoup("<title>Trabajos en -</title>","html.parser")
        fallback=BeautifulSoup(
            "<h1>Trabajos recientes</h1>"
            "<a href='/trabajo/operador-victoria-herrera-3999801'>"
            "Operador para Victoria Herrera</a>", "html.parser")
        job=BeautifulSoup(
            "<h1>Operador para Victoria Herrera</h1>"
            "<div>Buscado Victoria Herrera Fecha 2026-11-09 "
            "Expira 2027-01-20 Ubicación Santiago Categoría Operarios Postular</div>"
            "<article><p>Lugar de trabajo: Santiago. Requiere operador.</p></article>",
            "html.parser")
        with patch.object(engine,"request_page",side_effect=[
                (200,index,None),(200,fallback,None),(200,job,None)]):
            result=engine.inspect(("Victoria","Chiletrabajos · Victoria",
                "https://www.chiletrabajos.cl/ciudad/victoria.html"))
        self.assertEqual(result["status"],"fallback_no_verified_target_offers")
        self.assertEqual(result["candidates"],[])
        self.assertEqual(result["fallback_rejected_nonlocal_or_unknown"],1)
        self.assertEqual(result["details_opened"],0)

    def test_national_fallback_title_and_recruiter_city_without_worksite_remains_review_only(self):
        from unittest.mock import patch
        from motor_d_express import classify as classify_ready
        index=BeautifulSoup("<h1>Trabajos en -</h1>","html.parser")
        fallback=BeautifulSoup(
            "<a href='/trabajo/mecanico-victoria-3999701'>Mecánico Victoria</a>",
            "html.parser")
        job=BeautifulSoup(
            "<h1>Mecánico Victoria</h1>"
            "<div>Buscado Empresa Real Fecha 2026-11-09 Expira 2027-01-19 "
            "Ubicación Victoria Categoría Técnicos Postular</div>"
            "<article><p>Se requiere mecánico con experiencia para flota. "
            "Interesados postular en portal. Ideal disponibilidad para viajar.</p></article>",
            "html.parser")
        with patch.object(engine,"request_page",side_effect=[
                (200,index,None),(200,fallback,None),(200,job,None)]):
            result=engine.inspect(("Victoria","Chiletrabajos · Victoria",
                "https://www.chiletrabajos.cl/ciudad/victoria.html"))
        self.assertEqual(len(result["candidates"]),1)
        offer=result["candidates"][0]
        self.assertEqual(offer["work_commune"],"Victoria")
        self.assertIsNone(offer["explicit_worksite_commune"])
        self.assertTrue(offer["source_commune_not_confirmed"])
        self.assertFalse(offer["express_ready"])
        self.assertEqual(result["fallback_pending_worksite_confirmation"],1)
        self.assertEqual(classify_ready(offer,engine.NOW.date())[0],"SEGUNDA_PASADA")

    def test_fallback_url_is_only_for_authorized_twelve_communes(self):
        self.assertEqual(engine.chiletrabajos_fallback_url("Los Sauces"),
                         "https://www.chiletrabajos.cl/encuentra-un-empleo/?2=Los%20Sauces")
        self.assertEqual(engine.chiletrabajos_fallback_url("Purén"),
                         "https://www.chiletrabajos.cl/encuentra-un-empleo/?2=Pur%C3%A9n")
        with self.assertRaises(ValueError):
            engine.chiletrabajos_fallback_url("Quilaco")

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

    def test_radar_and_motor_d_have_distinct_non_cancelling_queues(self):
        from pathlib import Path
        workflow_dir = Path(__file__).resolve().parents[1] / ".github" / "workflows"
        expected = {
            "motor-d-territorial-daily.yml": "group: trabajo-cerca-motor-d-territorial",
            "trabajo-cerca-radar-diario.yml": "group: trabajo-cerca-radar-gratis"
        }
        for name, group in expected.items():
            workflow = (workflow_dir / name).read_text(encoding="utf-8")
            self.assertIn(group, workflow)
            self.assertIn("cancel-in-progress: false", workflow)
            self.assertIn("upload-artifact@v4", workflow)
            self.assertNotIn("group: trabajo-cerca-motor-d-ready-writers", workflow)

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


    def test_real_mulchen_omil_open_undated_uses_first_party_index(self):
        from unittest.mock import patch
        from motor_d_express import classify
        index_url = "https://www.munimulchen.cl/pagina-central-ofertas-laborales/"
        offer_url = "https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/"
        article = (
            "<html><title>Oferta Laboral: Operarios Agrícolas – Cosecha de Arándanos"
            " | Municipalidad Mulchén</title>"
            "<article><h1>OFERTA LABORAL</h1>"
            "<p>OPERARIOS AGRÍCOLAS – COSECHA DE ARÁNDANOS</p>"
            "<p>Empresa del rubro agrícola de la comuna de Mulchén iniciará el reclutamiento "
            "de personal para realizar labores de cosecha de arándanos en un predio "
            "ubicado en el sector Campamento.</p><p>100 cupos. Requisitos: ser mayor "
            "de 18 años. Interesados deben presentar la documentación en la Oficina OMIL, "
            "ubicada en calle Aníbal Pinto N°495. Atención lunes a viernes.</p></article></html>"
        )
        feed = {"status":"ok","pages":[],"checked":[],"links_found":0,
                "sources_blocked":0}
        for index_state, expected in (("Abierta","RECUPERACION"),("Cerrada","DESCARTADO")):
            with self.subTest(index_state=index_state):
                index = BeautifulSoup(
                    "<div>Postulación "+index_state+" <a href='"+offer_url+
                    "'>OPERARIOS AGRÍCOLAS – COSECHA DE ARÁNDANOS (100 CUPOS)</a></div>",
                    "html.parser")
                with patch.object(engine,"discover_municipal",return_value=feed), patch.object(engine,"request_page",side_effect=[
                         (200,index,None),(200,BeautifulSoup(article,"html.parser"),None)]):
                    result = engine.inspect(("Mulchén","Municipio Mulchén empleos",index_url))
                self.assertEqual(len(result["candidates"]),1)
                row=result["candidates"][0]
                state,reason,offer=classify(row,engine.NOW.date())
                self.assertEqual(state,expected)
                if index_state=="Abierta":
                    self.assertEqual(row["work_commune"],"Mulchén")
                    self.assertTrue(row["application_evidence"])
                    self.assertTrue(row["official_index_open_verified"])
                    self.assertEqual(row["index_status"],"open")
                    self.assertIsNone(row["date_source"])
                    self.assertEqual(offer["fecha_publicacion"],None)
                    self.assertEqual(offer["internal_visibility_days"],14)
                    self.assertEqual(offer["fecha_publicacion_metodo"],
                                     "original_no_informada_municipal_abierta")
                else:
                    self.assertIsNone(offer)

    def test_municipal_open_cannot_approve_ambiguous_or_unrelated_worksite(self):
        body = ("Empresa del rubro agrícola de la comuna de Mulchén iniciará el "
                "reclutamiento para realizar labores de cosecha de arándanos en "
                "un predio ubicado en el sector Campamento. "
                "Interesados deben presentar la documentación en la Oficina OMIL, "
                "Aníbal Pinto 495.")
        index_url="https://www.munimulchen.cl/pagina-central-ofertas-laborales/"
        job_url="https://www.munimulchen.cl/oferta-laboral-agricola/"
        self.assertIsNotNone(engine.municipal_open_official_evidence(
            "Mulchén","Municipio Mulchén empleos",index_url,job_url,"open",body))
        self.assertIsNone(engine.municipal_open_official_evidence(
            "Mulchén","Municipio Mulchén empleos",index_url,job_url,"closed",body))
        self.assertIsNone(engine.municipal_open_official_evidence(
            "Mulchén","Municipio Mulchén empleos",index_url,
            "https://other.example.cl/oferta-laboral-agricola/","open",body))
        self.assertIsNone(engine.municipal_open_official_evidence(
            "Mulchén","Municipio Mulchén empleos",index_url,job_url,
            "open","Municipalidad de Mulchén invita a registrar CV en OMIL."))


    def test_long_index_does_not_starve_jobs_after_500_anchors(self):
        unrelated="".join("<a href='/enlace-%d'>Biblioteca y cultura</a>" % n
                          for n in range(550))
        html=unrelated+"<a href='/vacante-director-cc-lae-angol/'>Director/a CC LAE Angol</a>"
        urls=engine.links_from(BeautifulSoup(html,"html.parser"),
                               "https://municipio.example.cl/ofertas/",limit=None)
        self.assertTrue(any("director-cc-lae" in row[0] for row in urls))

    def test_employer_blogs_not_individual_job_offers(self):
        html=("<a href='/noticias/1773249009003-las-claves-para-optimizar-tu-curriculum-y-destacar'>"
              "Consejos para el empleo y trabajo</a>"
              "<a href='/ofertas/operador-mantenedor-industrial'>Operador mantenedor</a>")
        urls=engine.links_from(BeautifulSoup(html,"html.parser"),
                               "https://serfocol.trabajando.cl/",limit=None)
        self.assertEqual(len(urls),1)
        self.assertIn("operador-mantenedor",urls[0][0])

    def test_industry_positions_are_candidate_links_not_auto_approvals(self):
        html="<a href='/Chile/job/test/'>Instrumentista de Área</a>"
        urls=engine.links_from(BeautifulSoup(html,"html.parser"),
                               "https://jobs.arauco.com/Chile/search/",limit=None)
        self.assertEqual(len(urls),1)
        self.assertEqual(urls[0][2],"not_indicated")


if __name__=="__main__":
    unittest.main()
