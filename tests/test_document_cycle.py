import datetime as dt
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts import document_cycle, local_history
from scripts.common import Budget
from scripts.state import State

NOW = dt.datetime(2026,10,13,12,tzinfo=dt.timezone.utc)
URL = 'https://www.munilumaco.cl/avisos/oferta-laboral.pdf'
TEXT = ('Se necesita operador\nCargo: Operador forestal\nEmpresa: Empresa de prueba\n'
        'Lugar de trabajo: Lumaco\nPublicación: 12 de octubre de 2026\n'
        'Enviar CV: empleo@example.cl\nPostulaciones hasta el 20 de octubre de 2026')
SHA = hashlib.sha256(TEXT.encode()).hexdigest()


class DocumentCycleTests(unittest.TestCase):
    def test_document_slots_exclude_literary_contests_and_preserve_specific_transport_errors(self):
        def collector(**kwargs):return {'candidates':[],'notice_evidence':[],'checkpoints':{},'verified_notices':0,'diagnostics':[]}
        calls=[]
        def reader(row,**kwargs):calls.append(row['url']);raise ValueError('unsupported_media_type')
        with tempfile.TemporaryDirectory() as folder:
            store=State(Path(folder)/'state.sqlite3')
            work={'items':[{'url':URL,'source':'OMIL'},
                           {'url':'https://www.munimulchen.cl/3er-concurso-microcuentos-bureanos/','source':'OMIL'}]}
            _,summary=document_cycle.run(store,Path(folder),work,reader=reader,collector=collector,now=NOW,budget=Budget(10))
            self.assertEqual(calls,[URL]);self.assertEqual(summary['reviewed'][0]['reason'],'unsupported_media_type')
            self.assertEqual(len(store.inventory()),2)
            store.close()

    def test_a_complete_pdf_uses_its_literal_date_and_not_the_app_capture_time(self):
        medium = {'text':TEXT,'sha256':SHA,'engine':'pdftotext-local','complete_document':True,'page_count':1}
        result = document_cycle.verify_work_item({'url':URL},reader=lambda *args:medium,now=NOW)
        self.assertEqual(result['status'],'verified')
        self.assertEqual(result['source_published_at'],'2026-10-12T03:00:00+00:00')
        self.assertEqual(result['application'],'mailto:empleo@example.cl')
        result = document_cycle.verify_work_item({'url':URL,'captured_at':NOW.isoformat()},
          reader=lambda *args:{**medium,'text':TEXT.replace('Publicación: 12 de octubre de 2026\n','')},now=NOW)
        self.assertEqual(result['reason'],'source_date_missing_or_future')

    def test_ocr_confidence_partial_documents_old_notices_and_expired_contacts_block_publication(self):
        base = {'text':TEXT,'sha256':SHA,'engine':'tesseract-local','complete_document':True,'mean_confidence':90}
        for update in [{'mean_confidence':60},{'complete_document':False},{'textTruncated':True},
                       {'text':TEXT.replace('12 de octubre','1 de agosto')},
                       {'text':TEXT.replace('20 de octubre','1 de octubre')}]:
            with self.subTest(update=update):
                result = document_cycle.verify_work_item({'url':URL},reader=lambda *args:{**base,**update},now=NOW)
                self.assertNotEqual(result['status'],'verified')

    def test_publisher_date_is_only_used_for_media_linked_by_that_individual_article(self):
        article = 'https://www.munilumaco.cl/oferta-laboral-operador'
        raw = ('<meta property="article:published_time" content="2026-10-12T12:00:00Z">'
               '<a href="'+URL+'">Oferta laboral</a>').encode()
        medium = {'text':TEXT.replace('Publicación: 12 de octubre de 2026\n',''),
                  'sha256':SHA,'engine':'pdftotext-local','complete_document':True}
        result = document_cycle.verify_work_item({'url':URL,'publisher_page':article},
          fetcher=lambda *args:(raw,article,'text/html',200),reader=lambda *args:medium,now=NOW)
        self.assertEqual(result['status'],'verified')
        result = document_cycle.verify_work_item({'url':URL,'publisher_page':article},
          fetcher=lambda *args:(b'<h1>Otro articulo</h1>',article,'text/html',200),reader=lambda *args:medium,now=NOW)
        self.assertEqual(result['reason'],'media_not_linked_by_publisher')

    def test_foreign_media_or_unsupported_publishers_make_no_reader_requests(self):
        def reader(*args):self.fail('The media reader must not run')
        for row in [{'url':URL,'publisher_page':'https://other.example/article'},
                    {'url':'https://other.example/notice.pdf'}]:
            self.assertEqual(document_cycle.verify_work_item(row,reader=reader,now=NOW)['status'],'pending')

    def test_two_histories_union_observations_results_and_receipts_idempotently(self):
        with tempfile.TemporaryDirectory() as folder:
            first,second = State(Path(folder)/'a.sqlite3'),State(Path(folder)/'b.sqlite3')
            first.ingest([{'url':URL,'source':'OMIL'}],NOW-dt.timedelta(days=1))
            first.record_result(first.inventory()[0],{'status':'pending','reason':'first'},NOW-dt.timedelta(days=1))
            second.ingest([{'url':URL,'source':'OMIL','commune_query':'Lumaco'},{'url':URL.replace('laboral','nueva'),'source':'OMIL'}],NOW)
            second.record_result(second.inventory()[0],{'status':'pending','reason':'second'},NOW)
            second.checkpoint('public',{ 'next':2 },NOW);second.close()
            document_cycle.merge_history(first,Path(folder)/'b.sqlite3')
            self.assertEqual(len(first.inventory()),2)
            self.assertEqual(first.connection.execute('SELECT count(*) FROM observations').fetchone()[0],3)
            self.assertEqual(first.connection.execute('SELECT count(*) FROM attempts').fetchone()[0],2)
            self.assertEqual(first.checkpoints()['public']['next'],2)
            document_cycle.merge_history(first,Path(folder)/'b.sqlite3')
            self.assertEqual(first.connection.execute('SELECT count(*) FROM observations').fetchone()[0],3)
            first.close()

    def test_cycle_retries_documents_without_portal_jobs_stealing_the_reader_budget(self):
        def collector(**kwargs):
            return {'candidates':[],'notice_evidence':[],'checkpoints':{},'verified_notices':0,
                    'diagnostics':[],'discovered_channels':[{'channel':'https://www.facebook.com/municipio.prueba/',
                    'publisher':'OMIL','discovered_from':'https://www.munilumaco.cl/'}]}
        calls = []
        def reader(row,**kwargs):
            calls.append(row['url']);return local_history.verify_notice(TEXT,row['url'],None,sha256=SHA,now=NOW)
        with tempfile.TemporaryDirectory() as folder:
            store = State(Path(folder)/'state.sqlite3')
            store.ingest([{'url':'https://www.chiletrabajos.cl/trabajo/operador-1','source':'Chiletrabajos'}],NOW)
            work = {'items':[{'url':URL,'source':'OMIL'}]}
            queue,summary = document_cycle.run(store,Path(folder),work,reader=reader,collector=collector,now=NOW,budget=Budget(10))
            self.assertEqual(calls,[URL]);self.assertEqual(summary['documents_ready'],1)
            self.assertEqual(queue['records'][0]['source_url'],URL)
            self.assertEqual(summary['paid_provider_calls'],0);self.assertEqual(summary['published'],0)
            document_cycle.run(store,Path(folder),work,reader=reader,collector=collector,now=NOW+dt.timedelta(hours=1),budget=Budget(10))
            self.assertEqual(calls,[URL])
            document_cycle.run(store,Path(folder),work,reader=reader,collector=collector,now=NOW+dt.timedelta(hours=19),budget=Budget(10))
            self.assertEqual(calls,[URL,URL]);self.assertEqual(len(store.inventory()),2)
            self.assertEqual(len(store.checkpoints()[document_cycle.CHECKPOINT]['channels']),1)
            store.close()

    def test_exchange_preserves_the_branch_that_the_oidc_proof_will_sign(self):
        context = {'repository':'mrvvergara-afk/Trabajo-Cerca-','repository_id':'1411752840',
                   'ref':'refs/heads/main','sha':'a'*40,'run_id':'123'}
        queue = {'schema':'trabajo-cerca.ingestion.v1','generated_at':NOW.isoformat(),'published_count':0,'records':[]}
        self.assertEqual(json.loads(document_cycle.exchange_body(queue,context,NOW))['ref'],'refs/heads/main')
        with self.assertRaises(ValueError):document_cycle.exchange_body(queue,{**context,'ref':'refs/heads/other'},NOW)


if __name__ == '__main__':unittest.main()
