import datetime as dt
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import local_history, public_portals
from scripts.common import Budget
from scripts.local_source_audit import discover

NOW=dt.datetime(2026,10,13,12,tzinfo=dt.timezone.utc)
URL='https://www.munilumaco.cl/oferta-laboral-operador'
TEXT='Se necesita operador\nCargo: Operador forestal\nEmpresa: Empresa de prueba\nLugar de trabajo: Lumaco\nEnviar CV: empleo@example.cl\nPostulaciones hasta el 20 de octubre de 2026'
SHA=hashlib.sha256(TEXT.encode()).hexdigest()


class LocalHistoryTests(unittest.TestCase):
    def test_matching_article_publication_date_is_used_but_modified_and_related_dates_are_not(self):
        raw='<script type="application/ld+json">{"@type":"NewsArticle","url":"'+URL+'","datePublished":"2026-10-12","dateModified":"2026-10-13"}</script>'
        self.assertEqual(discover(raw,URL)['source_published_at'],'2026-10-12T00:00:00+00:00')
        self.assertIsNone(discover(raw.replace(URL,URL+'-otro'),URL)['source_published_at'])

    def test_article_time_and_conflicting_original_dates_require_review(self):
        raw='<article><time datetime="2026-10-12">12 octubre</time></article>'
        self.assertIsNotNone(discover(raw,URL)['source_published_at'])
        self.assertIsNone(discover(raw+'<meta property="article:published_time" content="2026-09-01">',URL)['source_published_at'])

    def test_complete_dated_local_notice_verifies_literal_fields_and_a_real_deadline(self):
        result=local_history.verify_notice(TEXT,URL,'2026-10-12T12:00:00Z',sha256=SHA,now=NOW)
        self.assertEqual(result['status'],'verified')
        self.assertEqual(result['company'],'Empresa de prueba')
        self.assertEqual(result['work_commune'],'Lumaco')
        self.assertEqual(result['application'],'mailto:empleo@example.cl')

    def test_unknown_year_relative_dates_and_capture_time_never_create_original_publication(self):
        for value in [None,'hoy','12 oct']:
            self.assertEqual(local_history.verify_notice(TEXT,URL,value,sha256=SHA,now=NOW)['reason'],'source_date_missing_or_future')
        result=local_history.verify_notice('Publicación: 12 de octubre de 2026\n'+TEXT,URL,None,sha256=SHA,now=NOW)
        self.assertEqual(result['status'],'verified')

    def test_partial_documents_old_notices_and_multiple_roles_are_not_published(self):
        self.assertEqual(local_history.verify_notice(TEXT,URL,'2026-10-12',sha256=SHA,complete=False,now=NOW)['reason'],'document_partial_or_truncated')
        self.assertEqual(local_history.verify_notice(TEXT,URL,'2026-08-01',sha256=SHA,now=NOW)['reason'],'source_older_than_45_days')
        self.assertEqual(local_history.verify_notice(TEXT+'\nCargo: Contador',URL,'2026-10-12',sha256=SHA,now=NOW)['reason'],'multiple_notices_require_separation')
        self.assertEqual(local_history.verify_notice(TEXT.replace('20 de octubre','1 de octubre'),URL,'2026-09-30',sha256=SHA,now=NOW)['reason'],'expired_deadline')

    def test_contact_without_deadline_or_real_employer_remains_reviewable(self):
        self.assertEqual(local_history.verify_notice(TEXT.split('Postulaciones')[0],URL,'2026-10-12',sha256=SHA,now=NOW)['status'],'pending')
        self.assertEqual(local_history.verify_notice(TEXT.replace('Empresa: Empresa de prueba\n',''),URL,'2026-10-12',sha256=SHA,now=NOW)['status'],'pending')

    def test_recent_publisher_metadata_does_not_rejuvenate_an_old_poster(self):
        result=local_history.verify_notice('Publicación: 1 de agosto de 2026\n'+TEXT,URL,'2026-10-12T12:00:00Z',sha256=SHA,now=NOW)
        self.assertEqual(result['reason'],'source_date_conflict')

    def test_literal_closing_time_is_respected_in_chile_instead_of_extending_the_notice_to_midnight(self):
        text=TEXT.replace('20 de octubre de 2026','13 de octubre de 2026 a las 08:00 horas')
        result=local_history.verify_notice(text,URL,'2026-10-12T12:00:00Z',sha256=SHA,now=NOW)
        self.assertEqual(result['reason'],'expired_deadline')

    def test_source_byte_and_redirect_limits_keep_a_specific_diagnostic(self):
        def fetcher(url,budget):raise ValueError('source_byte_budget_exceeded')
        with tempfile.TemporaryDirectory() as folder,patch('scripts.local_history.configured_sources',return_value=[('OMIL Lumaco',URL)]):
            report=local_history.run(output=Path(folder),fetcher=fetcher,budget=Budget(5),max_pages=1,now=NOW)
        self.assertEqual(report['diagnostics'][0]['error'],'source_byte_budget_exceeded')

    def test_a_local_crawl_resumes_articles_without_using_the_publisher_town_as_worksite(self):
        calls=[]
        root='https://www.munilumaco.cl/'
        def fetcher(url,budget):
            calls.append(url)
            raw='<a href="/oferta-laboral-operador">Oferta laboral</a>' if url==root else '<meta property="article:published_time" content="2026-10-12T12:00:00Z"><main><p>'+TEXT.replace('\n','</p><p>')+'</p></main>'
            return raw.encode(),url,'text/html',200
        with tempfile.TemporaryDirectory() as folder,patch('scripts.local_history.configured_sources',return_value=[('OMIL Lumaco',root)]):
            first=local_history.run(output=Path(folder),fetcher=fetcher,budget=Budget(5),max_pages=1,now=NOW)
            second=local_history.run(output=Path(folder),fetcher=fetcher,checkpoints=first['checkpoints'],budget=Budget(5),max_pages=1,now=NOW)
        self.assertEqual(calls,[root,URL])
        self.assertEqual(second['verified_notices'],1)
        self.assertFalse(second['coverage_complete'])

    def test_portal_rotation_and_next_page_survive_between_runs(self):
        calls=[]
        target='https://cl.indeed.com/viewjob?jk=0123456789abcdef'
        def fetcher(url,budget):
            calls.append(url)
            return ('<a href="'+target+'">Operador</a><a rel="next" href="?page=2">Siguiente</a>').encode(),url,'text/html',200
        with tempfile.TemporaryDirectory() as folder:
            first=public_portals.run(output=Path(folder),places=['Angol'],fetcher=fetcher,budget=Budget(5),max_requests=1,now=NOW)
            second=public_portals.run(output=Path(folder),places=['Angol'],fetcher=fetcher,budget=Budget(5),max_requests=1,checkpoints=first['checkpoints'],now=NOW)
        self.assertIn('indeed.com',calls[0]);self.assertIn('computrabajo.com',calls[1])
        self.assertEqual(first['candidates'][0]['url'],target)
        self.assertFalse(second['coverage_complete'])

    def test_image_only_article_is_read_with_local_ocr_and_keeps_its_original_date(self):
        root='https://www.munilumaco.cl/'
        image='https://www.munilumaco.cl/images/2026/aviso.png'
        html='<meta property="article:published_time" content="2026-10-12T12:00:00Z"><h1>Oferta laboral</h1><img src="'+image+'">'
        def reader(url,source,budget):
            self.assertEqual(url,image)
            return {'text':TEXT,'sha256':SHA,'engine':'tesseract-local','complete_document':True,'mean_confidence':91}
        with tempfile.TemporaryDirectory() as folder,patch('scripts.local_history.configured_sources',return_value=[('OMIL Lumaco',URL)]):
            report=local_history.run(output=Path(folder),fetcher=lambda url,budget:(html.encode(),URL,'text/html',200),reader=reader,budget=Budget(5),max_pages=1,now=NOW)
        notices=[notice for notice in report['notice_evidence'] if notice.get('media_url')]
        self.assertEqual(notices[0]['status'],'verified')
        self.assertEqual(notices[0]['source_published_at'],'2026-10-12T12:00:00+00:00')


if __name__=='__main__':unittest.main()
