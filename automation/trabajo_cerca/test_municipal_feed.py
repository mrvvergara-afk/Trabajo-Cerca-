"""Municipal RSS/WP feed fixtures. No network, credentials or publication."""
import json
import unittest
from unittest.mock import patch

from municipal_feed import (
    SITES, clean_title, discover_municipal, documents_from_page,
    has_job_signal, merge_page_links, municipal_url, parse_rss, parse_wp_posts,
)

VICTORIA="https://victoriachile.cl/category/omil/"
NEGRETE="https://muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/"
TRAIGUEN="https://mtraiguen.cl/category/bolsa-de-empleo-o-concurso/"


class MunicipalFeedTests(unittest.TestCase):
    def test_five_p0_communes_without_quilaco(self):
        self.assertEqual(set(city for city,_ in SITES.values()),
                         {"Negrete","Victoria","Renaico","Purén","Traiguén"})
        self.assertNotIn("municipalidadquilaco.cl",SITES)

    def test_wordpress_json_returns_individual_job_leads_not_informational_posts(self):
        records=[
            {"status":"publish","link":"https://victoriachile.cl/convocatoria-laboral-2026/",
             "date":"2026-11-09T12:01:00","title":{"rendered":"Convocatoria laboral de profesionales"},
             "excerpt":{"rendered":"Se necesita personal para servicio"}},
            {"status":"publish","link":"https://victoriachile.cl/taller-de-pro-empleo/",
             "title":{"rendered":"Taller de Pro Empleo para mujeres cesantes"},
             "excerpt":{"rendered":"Capacitación a trabajadores"}},
            {"status":"publish","link":"https://evil.example/convocatoria-laboral/",
             "title":{"rendered":"Oferta laboral profesional"}},
            {"status":"draft","link":"https://victoriachile.cl/oferta-laboral-borrador/",
             "title":{"rendered":"Oferta laboral borrador"}},
        ]
        result=parse_wp_posts(json.dumps(records).encode(),VICTORIA)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]["kind"],"local_page")
        self.assertTrue(result[0]["review_required"])
        self.assertEqual(result[0]["feed_date_unverified"],"2026-11-09T12:01:00")
        self.assertNotIn("original_publication_date",result[0])

    def test_rss_items_and_xml_without_job_signal(self):
        xml=b"""<rss version='2.0'><channel>
          <item><title>Bases para llamado a Concurso Publico de 3 Cargos</title>
          <link>https://mtraiguen.cl/municipalidad/bases-para-llamado/</link>
          <pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item>
          <item><title>Concurso literario juvenil</title>
          <link>https://mtraiguen.cl/literatura/</link></item>
        </channel></rss>"""
        result=parse_rss(xml,TRAIGUEN)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]["origin"],"rss")
        self.assertIn("Concurso Publico",result[0]["anchor"])
        self.assertTrue(result[0]["review_required"])

    def test_reject_entity_expansion_and_non_list_json(self):
        with self.assertRaises(ValueError):
            parse_rss(b"<!DOCTYPE rss [<!ENTITY x 'bomb'>]><rss>&x;</rss>",VICTORIA)
        with self.assertRaises(ValueError):
            parse_wp_posts(b'{"posts": []}',VICTORIA)

    def test_xml_atom_not_required_to_claim_no_job(self):
        xml=b"<rss><channel><item><title>Capacitacion para emprendedores</title></item></channel></rss>"
        self.assertEqual(parse_rss(xml,VICTORIA),[])

    def test_embedded_pdf_variants_only_same_publisher(self):
        html="""<div><iframe src="/wp-content/uploads/2026/10/DAEX-BASES-Y-CALENDARIO.pdf"></iframe>
          <embed src="/wp-content/uploads/2026/10/DAEX-BASES-Y-CALENDARIO.pdf" />
          <object data="/base-salud.pdf"></object>
          <div data-emsrc="/resolucion.pdf"></div>
          <a href="/bases.pdf">Bases para concurso</a>
          <iframe src="https://evil.example/confidential.pdf"></iframe>
        </div>"""
        result=documents_from_page(TRAIGUEN,html,limit=5)
        self.assertEqual(len(result),4)
        self.assertTrue(all(x["review_required"] for x in result))
        self.assertTrue(all(x["date_source"] is None for x in result))
        self.assertTrue(all(x["url"].startswith("https://mtraiguen.cl/") for x in result))

    def test_non_pdf_data_emsrc_and_tokens_never_enter_doc_queue(self):
        html='<iframe src="https://mtraiguen.cl/viewer?file=confidential.pdf"></iframe>' \
             '<a href="/wp-content/uploads/x.pdf?access_token=secret">Documento</a>'
        self.assertEqual(documents_from_page(TRAIGUEN,html),[])

    def test_municipal_links_reject_unsafe_or_external_host(self):
        for url in ("https://evil.example/oferta-laboral/",
                    "http://victoriachile.cl/oferta-laboral/",
                    "https://victoriachile.cl@evil.example/oferta-laboral/",
                    "https://victoriachile.cl/wp-json/wp/v2/posts",
                    "https://victoriachile.cl/oferta.pdf",
                    "https://victoriachile.cl/page?token=secret"):
            with self.subTest(url=url):
                self.assertIsNone(municipal_url(url,VICTORIA))

    def test_wordpress_and_rss_discovery_merges_without_duplicate(self):
        link="https://victoriachile.cl/convocatoria-laboral-noviembre/"
        wp=json.dumps([{"title":{"rendered":"Oferta laboral en Victoria"},
                        "link":link}]).encode()
        rss=f"""<rss><channel><item><title>Oferta laboral en Victoria</title>
                   <link>{link}</link></item></channel></rss>""".encode()
        def fetch(url):
            if "/wp-json/" in url:return wp,"application/json"
            return rss,"application/rss+xml"
        got=discover_municipal(VICTORIA,limit=10,fetcher=fetch)
        self.assertEqual(got["status"],"ok")
        self.assertEqual(len(got["pages"]),1)
        self.assertEqual(got["links_found"],1)
        self.assertGreaterEqual(got["sources_accessible"],2)

    def test_403_never_becomes_zero_employment(self):
        def blocked(url):
            raise PermissionError("robots_disallowed")
        got=discover_municipal(NEGRETE,fetcher=blocked)
        self.assertEqual(got["status"],"blocked")
        self.assertEqual(got["sources_accessible"],0)
        self.assertGreater(got["sources_blocked"],0)
        self.assertEqual(got["pages"],[])
        self.assertNotIn("vacancies",got)

    def test_accessible_feed_without_jobs_is_not_vacancy_zero(self):
        def empty(url):
            return b"<rss><channel></channel></rss>","application/rss+xml"
        got=discover_municipal(NEGRETE,fetcher=lambda url: (b"[]","application/json")
                               if "/wp-json/" in url else empty(url))
        self.assertEqual(got["status"],"no_job_items")
        self.assertEqual(got["sources_accessible"],2)
        self.assertNotIn("vacancies",got)

    def test_blocked_html_is_not_required_for_feed_probe(self):
        source={"link":"https://municipalidadrenaico.cl/concursos-publicos/cargos-2026/",
                "title":{"rendered":"Bases para llamado a concurso publico"}}
        got=discover_municipal("https://municipalidadrenaico.cl/concursos-publicos/",
                               fetcher=lambda url:(json.dumps([source]).encode(),"application/json")
                               if "/wp-json/" in url else (b"<rss><channel/></rss>","application/rss+xml"))
        self.assertEqual(got["status"],"ok")
        self.assertEqual(got["links_found"],1)

    def test_individual_job_article_footer_pdf_plans_are_filtered(self):
        # Traiguén's real job article inherited generic homepage downloads.
        html="""<article>
          <iframe src="/wp-content/uploads/2026/10/DAEX-BASES-Y-CALENDARIO.pdf"></iframe>
          <a href="/wp-content/uploads/2023/07/Plano-Traiguen.pdf">Plano</a>
          <a href="/wp-content/uploads/2023/07/ROL_REAVALUO_AGRICOLA_2020.pdf">Rol agrícola</a>
          <a href="/wp-content/uploads/2023/07/Informe_EAE_Traiguen.pdf">Informe EAE</a>
          <a href="/wp-content/uploads/2023/12/DAEX-3401-APRUEBA-ESCALAFON-DE-MERITO-2024.pdf">Escalafón</a>
        </article>"""
        result=documents_from_page(
            "https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/",
            html,limit=8)
        self.assertEqual(len(result),1)
        self.assertTrue(result[0]["url"].endswith("DAEX-BASES-Y-CALENDARIO.pdf"))

    def test_category_sidebar_pdf_archives_not_queued_as_job_documents(self):
        html=(b"<main><a href='/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/'>"
              b"Bases para llamado a Concurso Publico de 3 Cargos</a>"
              b"<a href='/wp-content/uploads/2023/07/Plano-Traiguen.pdf'>Plano Urbano</a>"
              b"<iframe src='/wp-content/uploads/2023/07/ROL_REAVALUO_AGRICOLA_2020.pdf'></iframe>"
              b"</main>")
        result=discover_municipal(TRAIGUEN,fetcher=lambda url:(html,"text/html"))
        self.assertEqual(result["links_found"],1)
        self.assertEqual(result["documents_for_review"],[])
        self.assertTrue(all(doc["kind"]=="local_page" for doc in result["pages"]))

    def test_traiguen_public_html_category_yields_pages_not_fake_vacancies(self):
        html=(b"<html><main>"
              b"<a href='/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/'>"
              b"Bases para llamado a Concurso Publico de 3 Cargos</a>"
              b"<a href='/noticia/taller-de-pro-empleo/'>Taller de Pro Empleo</a>"
              b"</main></html>")
        called=[]
        def fetch(url):
            called.append(url)
            return html,"text/html"
        got=discover_municipal(TRAIGUEN,fetcher=fetch)
        self.assertEqual(got["status"],"ok")
        self.assertEqual(got["links_found"],1)
        self.assertEqual(len(got["pages"]),1)
        self.assertEqual(got["pages"][0]["origin"],"municipal_html")
        self.assertTrue(all("/wp-json/" not in x for x in called))
        self.assertEqual(got["pages"][0]["feed_date_unverified"],None)

    def test_html_embedded_pdf_does_not_become_offer(self):
        url="https://municipalidadrenaico.cl/concursos-publicos/"
        got=discover_municipal(url,include_html=True,fetcher=lambda endpoint:(
            b'<iframe src="/wp-content/uploads/bases.pdf"></iframe>',"text/html")
            if "/concursos-publicos/" in endpoint else (
            b"[]","application/json") if "/wp-json/" in endpoint else (
            b"<rss><channel/></rss>","application/rss+xml"))
        self.assertEqual(got["status"],"ok")
        self.assertEqual(len(got["documents_for_review"]),1)
        self.assertEqual(got["pages"],[])

    def test_merge_page_links_bounded_dedup(self):
        a=[{"url":"https://muninegrete.cl/empleo-a"},{"url":"https://muninegrete.cl/empleo-b"}]
        b=[{"url":"https://muninegrete.cl/empleo-a"},{"url":"https://muninegrete.cl/empleo-c"}]
        self.assertEqual(len(merge_page_links(a,b,2)),2)
        self.assertEqual(len(merge_page_links(a,b,10)),3)


if __name__=="__main__":
    unittest.main()
