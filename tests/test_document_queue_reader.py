import datetime as dt
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.common import Budget
from scripts.document_queue_reader import (
    DATA_BRANCH, SCHEMA, EDITIONS, identity, read_queue, recover_parent,
    recent_editions, reception_status, prior_reference_same_documents,
    publish_evidence, restore_checkpoint,
    archive_publication_date,
)
from scripts.public_document_http import PublicCapture, public_error

NOW = dt.datetime(2026,10,18,22,tzinfo=dt.timezone.utc)
ROOT = 'https://municipalidadrenaico.cl/concursos-publicos/'
FIRST = 'https://www.municipalidadrenaico.cl/wp-content/uploads/2026/07/TECNICO-EXTENSIONISTA.pdf'
SECOND = 'https://www.municipalidadrenaico.cl/wp-content/uploads/2026/07/JEFE-TECNICO.pdf'
CATALOGUE = ('<h3>Cargo técnico PRODESAL</h3><p>Los antecedentes se recibirán hasta las 14:00 hrs del día 23 de julio de 2026.</p>'
             '<a href="'+FIRST+'">Descargar bases</a><h3>Jefe técnico</h3><p>Los antecedentes se recibirán hasta el 30 de octubre de 2026.</p>'
             '<a href="'+SECOND+'">Descargar bases</a>').encode()


class Capture:
    def __init__(self, pages):
        self.pages, self.calls, self.requests = pages, [], []

    def __call__(self, url, *args, **kwargs):
        self.calls.append(url)
        if url not in self.pages:
            raise ValueError('fixture_no_page')
        self.requests.append({'url':url,'status':200})
        return self.pages[url], url, 'text/html', 200


class QueueReaderTests(unittest.TestCase):
    def test_original_date_can_be_recovered_from_the_exact_archive_article_without_using_its_neighbors(self):
        archive = 'https://www.muninegrete.cl/page/2/'
        notice = 'https://www.muninegrete.cl/concurso-director/'
        raw = ('<article><a href="/other/">Otra noticia</a><span class="elementor-post-date">Octubre 17, 2026</span></article>'
               '<article><a href="'+notice+'">Concurso director</a><span class="elementor-post-date">Julio 7, 2026</span></article>')
        date = archive_publication_date(raw,archive,notice)
        self.assertEqual(date['literal'],'Julio 7, 2026')
        self.assertEqual(date['date'].month,7)
        capture = Capture({archive:raw.encode(),notice:b'<title>Concurso director</title><p>Bases para el cargo.</p>'})
        row = recover_parent({'url':notice,'publisher_page':archive},capture,Budget(5),{},NOW)
        self.assertEqual(row['status'],'older_than_45_days')
        self.assertEqual(row['source_date_evidence']['literal'],'Julio 7, 2026')
        self.assertEqual(row['publisher_page'],notice)
        ambiguous = raw.replace('Julio 7, 2026','Julio 7, 2026</span><span class="elementor-post-date">Octubre 17, 2026')
        self.assertIsNone(archive_publication_date(ambiguous,archive,notice))

    def test_individual_html_is_read_instead_of_the_archive_that_discovered_it(self):
        archive = 'https://www.muninegrete.cl/page/2/'
        notice = 'https://www.muninegrete.cl/bases-llamado-a-concurso-para-proveer-cargo-de-director-a-del-cesfam-yanequen/'
        old = b'<meta property="article:published_time" content="2026-07-07T12:00:00Z"><h1>Concurso director CESFAM</h1>'
        capture = Capture({notice:old})
        row = recover_parent({'url':notice,'publisher_page':archive},capture,Budget(5),{},NOW)
        self.assertEqual(row['status'],'older_than_45_days')
        self.assertEqual(row['publisher_page'],notice)
        self.assertEqual(row['discovered_from'],archive)
        self.assertEqual(capture.calls,[notice])

    def test_explicit_closed_sections_and_non_employment_contests_do_not_enter_ocr(self):
        closed = reception_status('Concurso cargo de apoyo familiar (CERRADO). Bases disponibles en el sitio.',NOW)
        self.assertEqual(closed['status'],'closed')
        notice = 'https://www.munimulchen.cl/2-version-concursos-arreglos-navidenos/'
        capture = Capture({notice:'<title>2° versión concursos arreglos navideños</title><footer><img src="/facebook.png"></footer>'.encode()})
        row = recover_parent({'url':notice,'publisher_page':notice},capture,Budget(5),{},NOW)
        self.assertEqual(row['status'],'not_employment')
        self.assertFalse(row['verified'])

    def test_catalogue_media_without_a_separate_article_reaches_the_targeted_attachment_reader(self):
        capture = Capture({ROOT:CATALOGUE,EDITIONS:b''})
        calls = []
        def reader(url,root,**kwargs):
            calls.append((url,kwargs.get('attachment_url')))
            return {'counts':{'statuses':{'done':1}},'documents':[],'document_reviews':[],
                    'evaluations':[],'persistence_check':{'snapshot_restored':True}}
        with tempfile.TemporaryDirectory() as folder:
            read_queue({'items':[{'url':SECOND,'publisher_page':SECOND}]},folder,
                       {'schema':SCHEMA,'items':{}},capture=capture,now=NOW,proof=reader)
        self.assertEqual(calls,[(ROOT,SECOND)])

    def test_recover_original_catalogue_and_close_only_the_attachment_with_its_own_deadline(self):
        capture = Capture({ROOT:CATALOGUE})
        cache = {}
        expired = recover_parent({'url':FIRST,'publisher_page':FIRST},capture,Budget(5),cache,NOW)
        current = recover_parent({'url':SECOND,'publisher_page':SECOND},capture,Budget(5),cache,NOW)
        self.assertEqual(expired['status'],'expired')
        self.assertEqual(expired['publisher_page'],ROOT)
        self.assertIsNone(expired['source_published_at'])
        self.assertEqual(expired['historical_recentness'],'not_confirmed')
        self.assertEqual(current['status'],'requires_document_reading')
        self.assertFalse(current['verified'])
        self.assertEqual(capture.calls,[ROOT])
        self.assertIn('23 de julio',expired['literal'])

    def test_expired_live_queue_rows_do_not_download_or_ocr_the_old_pdf(self):
        def forbidden(*args, **kwargs):
            self.fail('Closed catalogue attachment must not enter OCR')
        capture = Capture({ROOT:CATALOGUE})
        with tempfile.TemporaryDirectory() as folder:
            result = read_queue({'items':[{'url':FIRST,'publisher_page':FIRST}]},folder,
                                {'schema':SCHEMA,'items':{}},capture=capture,now=NOW,proof=forbidden)
        self.assertEqual(result['sdk_queue_items'],1)
        self.assertEqual(result['classified'][0]['status'],'expired')
        self.assertEqual(result['read_references'],0)
        self.assertEqual(result['published'],0)
        self.assertFalse(result['publication_bridge_invoked'])
        self.assertNotIn(FIRST,capture.calls)

    def test_foreign_publisher_and_unlinked_attachments_do_not_acquire_provenance(self):
        capture = Capture({ROOT:CATALOGUE})
        other = FIRST.replace('TECNICO-EXTENSIONISTA','UNLINKED')
        row = recover_parent({'url':other,'publisher_page':ROOT},capture,Budget(5),{},NOW)
        self.assertEqual(row['status'],'provenance_missing')
        with self.assertRaisesRegex(ValueError,'publisher_page_mismatch'):
            recover_parent({'url':FIRST,'publisher_page':'https://www.muninegrete.cl/other'},capture,Budget(5),{},NOW)

    def test_catalogue_creation_and_url_month_cannot_become_a_job_deadline_or_publication_date(self):
        value = reception_status('Bases disponibles el 10 de julio de 2026. Documento cargado el 12 de octubre de 2026.',NOW)
        self.assertEqual(value['status'],'requires_document_reading')
        self.assertIsNone(value['source_published_at'])

    def test_recent_editions_require_literal_dates_and_same_publisher_links(self):
        raw = ('<a href="/edicion-jueves-15-de-octubre-de-2026/">Edición jueves 15 de octubre de 2026</a>'
               '<a href="/edicion-vieja/">Edición 01 de julio de 2026</a>'
               '<a href="/edicion-sin-fecha/">Edición nueva</a>'
               '<a href="https://attacker.example/edicion-jueves-15-de-octubre-de-2026/">Edición 15 de octubre de 2026</a>')
        editions = recent_editions(raw,NOW)
        self.assertEqual(len(editions),1)
        self.assertIn('15-de-octubre',editions[0]['url'])
        self.assertNotIn('source_published_at',editions[0])

    def test_navigation_or_nonce_changes_cannot_repeat_a_previously_reviewed_pdf(self):
        page = 'https://www.malleco7.cl/edicion-martes-13-de-octubre-de-2026/'
        pdf = 'https://www.malleco7.cl/wp-content/uploads/2026/10/1485.pdf'
        known = {identity(page):{'sha256':'a'*64,'documents':{identity(pdf)}}}
        self.assertTrue(prior_reference_same_documents(page,('<script>nonce="new"</script><a href="'+pdf+'">DESCARGAR PDF</a>').encode(),known))
        self.assertFalse(prior_reference_same_documents(page,('<a href="'+pdf.replace('1485','changed')+'">DESCARGAR PDF</a>').encode(),known))

    def test_completed_readings_reuse_durable_checkpoint_and_partial_reads_retry(self):
        page = 'https://www.muninegrete.cl/oferta-laboral-fixture/'
        html = b'<title>Oferta laboral</title><meta property="article:published_time" content="2026-10-15T12:00:00Z"><p>Se necesita operador</p>'
        capture = Capture({page:html,EDITIONS:b'<h1>Ediciones</h1>'})
        calls = []
        partial = [False]
        def reader(url, root, **kwargs):
            calls.append(url)
            return {'counts':{'statuses':{'retry' if partial[0] else 'done':1}},'documents':[],
                    'document_reviews':[],'evaluations':[],'persistence_check':{'snapshot_restored':True}}
        with tempfile.TemporaryDirectory() as folder:
            state = {'schema':SCHEMA,'items':{}}
            work = {'items':[{'url':page,'publisher_page':page}]}
            first = read_queue(work,Path(folder)/'first',state,capture=capture,now=NOW,proof=reader)
            second = read_queue(work,Path(folder)/'second',state,capture=capture,now=NOW,proof=reader)
            self.assertEqual(len(calls),1)
            self.assertEqual(second['classified'][0]['status'],'previously_read_unchanged')
            self.assertEqual(first['published'],0)
            state['items'][identity(page)]['reading_complete'] = False
            partial[0] = True
            read_queue(work,Path(folder)/'third',state,capture=capture,now=NOW,proof=reader)
            read_queue(work,Path(folder)/'fourth',state,capture=capture,now=NOW,proof=reader)
            self.assertEqual(len(calls),3)

    def test_data_branch_snapshots_keep_old_evidence_and_restore_real_checkpoint(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            remote, repo, output = base/'remote.git', base/'repo', base/'output'
            subprocess.run(['git','init','--bare',str(remote)],check=True,capture_output=True)
            repo.mkdir()
            subprocess.run(['git','init'],cwd=repo,check=True,capture_output=True)
            subprocess.run(['git','remote','add','origin',str(remote)],cwd=repo,check=True)
            output.mkdir()
            (output/'reader-summary.json').write_text('{"published":0}\n')
            objects = output/'objects'
            objects.mkdir()
            data = b'original municipal evidence'
            digest = hashlib.sha256(data).hexdigest()
            (objects/digest).write_bytes(data)
            state = {'schema':SCHEMA,'items':{'first':{'reading_complete':True}}}
            first = publish_evidence(output,state,None,'123-1',repository=repo)
            (output/'reader-summary.json').write_text('{"published":0,"next":true}\n')
            state['items']['next'] = {'reading_complete':False}
            second = publish_evidence(output,state,first,'124-1',repository=repo)
            parent, restored = restore_checkpoint(repo)
            self.assertEqual(parent,second)
            self.assertEqual(restored,state)
            old = subprocess.check_output(['git','show',second+':history/123-1/reader-summary.json'],cwd=repo)
            self.assertEqual(old,b'{"published":0}\n')
            self.assertEqual(subprocess.check_output(['git','show',second+':objects/'+digest],cwd=repo),data)
            self.assertEqual(subprocess.check_output(['git','rev-parse',second+'^'],cwd=repo).decode().strip(),first)
            self.assertEqual(subprocess.check_output(['git','branch','-r'],cwd=repo).decode().strip(),'origin/'+DATA_BRANCH)


class PublicDownloadTests(unittest.TestCase):
    def test_public_www_robots_redirect_keeps_its_rules_and_never_accepts_an_html_loading_page_as_policy(self):
        address='https://www.municipalidadrenaico.cl/wp-content/uploads/file.pdf'
        calls=[]
        def transport(url,budget,maximum):
            calls.append(url)
            if url=='https://www.municipalidadrenaico.cl/robots.txt':
                return b'','text/html',301,'https://municipalidadrenaico.cl/robots.txt'
            if url.endswith('/robots.txt'):
                return b'User-agent: *\nDisallow: /private/\n','text/plain',200,None
            return b'%PDF-fixture','application/pdf',200,None
        with tempfile.TemporaryDirectory() as folder:
            capture=PublicCapture(folder,transport)
            raw,_,mime,_=capture(address,Budget(5))
            self.assertEqual(raw,b'%PDF-fixture');self.assertEqual(mime,'application/pdf')
            self.assertEqual([row['status'] for row in capture.requests],[301,200,200])
            self.assertFalse(capture.allowed('https://www.municipalidadrenaico.cl/private/secret',Budget(5)))
        with tempfile.TemporaryDirectory() as folder:
            capture=PublicCapture(folder,lambda *args:(b'<html><div id="app">Loading</div></html>','text/html',200,None))
            with self.assertRaisesRegex(ValueError,'robots_policy_unavailable'):
                capture(address,Budget(5))

    def test_public_error_codes_are_informative_without_leaking_unknown_exception_text(self):
        self.assertEqual(public_error(ValueError('public_source_robots_disallowed')),'public_source_robots_disallowed')
        self.assertEqual(public_error(ValueError('public_source_http_403')),'public_source_http_403')
        self.assertEqual(public_error(ValueError('untrusted detail with private material')),'ValueError')

    def test_disallowed_redirect_target_is_checked_before_downloading_it(self):
        root = 'https://www.nacimiento.cl/noticias'
        calls = []
        def transport(url,budget,maximum):
            calls.append(url)
            if url.endswith('/robots.txt'):
                return b'User-agent: *\nDisallow: /private\n','text/plain',200,None
            self.assertEqual(url,root)
            return b'', 'text/html',302,'/private/notice'
        with tempfile.TemporaryDirectory() as folder:
            capture = PublicCapture(folder,transport)
            with self.assertRaisesRegex(ValueError,'robots_disallowed'):
                capture(root,Budget(5))
        self.assertEqual(calls,[root.rsplit('/',1)[0]+'/robots.txt',root])

    def test_missing_robots_allows_public_read_and_foreign_redirect_is_never_followed(self):
        root = 'https://www.nacimiento.cl/noticias'
        calls = []
        def transport(url,budget,maximum):
            calls.append(url)
            if url.endswith('/robots.txt'):
                return b'', 'text/plain',404,None
            return b'', 'text/html',302,'https://attacker.example/notice'
        with tempfile.TemporaryDirectory() as folder:
            capture = PublicCapture(folder,transport)
            with self.assertRaisesRegex(ValueError,'publisher_not_allowed'):
                capture(root,Budget(5))
        self.assertEqual(len(calls),2)


if __name__ == '__main__':
    unittest.main()
