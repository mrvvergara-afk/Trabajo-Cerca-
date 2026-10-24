import datetime as dt
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import radar_v2_pilot as pilot
from scripts.common import Budget
from scripts.document_review import review_document
from scripts.radar_v2_store import MAX_ARCHIVE_BYTES, MAX_OBJECT_BYTES, MAX_PDF_BYTES, PilotStore, restore

URL='https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/'
PDF='https://mtraiguen.cl/wp-content/uploads/2026/10/DAEX-BASES-Y-CALENDARIO.pdf'
NOW=dt.datetime(2026,10,17,23,tzinfo=dt.timezone.utc)


def sized_pdf(size,fill=b'x'):
    # Size-boundary fixture, not a real notice or a test of the PDF parser.
    return b'%PDF-1.4\n'+fill*(size-9)


class LargeDocumentTests(unittest.TestCase):
    def test_pdf_embed_does_not_turn_an_unrelated_page_photo_into_a_job_poster(self):
        raw=('<title>Bases para llamado a concurso de tres cargos</title>'
             '<iframe data-emsrc="'+PDF+'"></iframe>'
             '<img src="/convocatoria-cosoc.png"><img src="/afiche-empleo.png">').encode()
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            _,children=pilot.web_work(store,{'url':URL,'source':{'key':'traiguen','family':'municipal'},'depth':1},
                Budget(10),lambda *a:(raw,URL,'text/html',200),NOW)
            self.assertEqual([p['media_url'] for kind,_,p in children if kind=='media'],
                             [PDF,'https://mtraiguen.cl/afiche-empleo.png'])
            store.close()

    def test_pdf_above_eight_mib_is_queued_in_full_and_survives_snapshot_restore_with_history(self):
        raw=sized_pdf(MAX_OBJECT_BYTES+1)
        payload={'source_url':URL,'media_url':PDF,'source_published_at':'2026-10-01T12:04:54+00:00'}
        calls=[]
        def fetch(url,budget,*,max_bytes):
            calls.append((url,max_bytes))
            return raw,url,'application/pdf',200
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);store=PilotStore(root/'state')
            old=store.put(b'historical evidence','text/plain')
            store.seed('web','historic-task',{'url':URL},NOW)
            with patch.object(pilot.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout='Pages: 33\n')):
                result,children=pilot.media_work(store,payload,Budget(10),fetch)
            self.assertEqual(calls,[(PDF,MAX_PDF_BYTES)])
            self.assertEqual(result['archive'],hashlib.sha256(raw).hexdigest())
            self.assertEqual(result['bytes'],len(raw))
            self.assertEqual([p['page'] for _,_,p in children],list(range(1,34)))
            self.assertTrue(all(p['object_sha256']==result['archive'] for _,_,p in children))
            store.snapshot(root/'backup');before=store.counts();store.close()
            restore(root/'backup/pilot.sqlite3.gz',root/'backup/manifest.json',root/'restored',
                    lambda digest:(root/'state/objects'/digest).read_bytes())
            recovered=PilotStore(root/'restored')
            self.assertEqual(recovered.counts(),before)
            self.assertEqual(recovered.object(result['archive']).read_bytes(),raw)
            self.assertEqual(recovered.object(old).read_bytes(),b'historical evidence')
            self.assertEqual(recovered.results()[0]['key'],'historic-task')
            recovered.close()

    def test_larger_allowance_requires_pdf_mime_and_signature_and_remains_bounded(self):
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            for raw,mime in [(sized_pdf(MAX_OBJECT_BYTES+1),'image/png'),
                             (b'x'*(MAX_OBJECT_BYTES+1),'application/pdf'),
                             (sized_pdf(MAX_PDF_BYTES+1),'application/pdf')]:
                with self.subTest(mime=mime,size=len(raw)):
                    with self.assertRaisesRegex(ValueError,'object exceeds budget'):store.put(raw,mime)
            self.assertEqual(store.counts()['objects'],0)
            raw=sized_pdf(MAX_PDF_BYTES)
            identity=store.put(raw,'application/pdf')
            self.assertEqual(store.put(raw,'application/pdf'),identity)
            self.assertEqual(store.counts()['objects'],1)
            store.close()

    def test_archive_ceiling_preserves_previous_evidence_when_another_large_pdf_will_not_fit(self):
        self.assertEqual(MAX_ARCHIVE_BYTES,32*1024*1024)
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);old=store.put(b'keep historical notice','text/plain')
            first=store.put(sized_pdf(MAX_PDF_BYTES),'application/pdf')
            with self.assertRaisesRegex(ValueError,'retain previous data'):
                store.put(sized_pdf(MAX_PDF_BYTES,b'y'),'application/pdf')
            self.assertEqual(store.counts()['objects'],2)
            self.assertEqual(store.object(old).read_bytes(),b'keep historical notice')
            self.assertEqual(store.object(first).stat().st_size,MAX_PDF_BYTES)
            store.close()

    def test_images_keep_eight_mib_fetch_limit_and_oversize_failure_is_not_archived(self):
        calls=[]
        def fetch(url,budget,*,max_bytes):
            calls.append(max_bytes);raise ValueError('source_byte_budget_exceeded')
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            for medium in [PDF,URL+'oferta.png']:
                with self.assertRaisesRegex(ValueError,'source_byte_budget_exceeded'):
                    pilot.media_work(store,{'source_url':URL,'media_url':medium},Budget(10),fetch)
            self.assertEqual(calls,[MAX_PDF_BYTES,MAX_OBJECT_BYTES])
            self.assertEqual(store.counts()['objects'],0)
            store.close()

    def test_pdf_size_exception_does_not_raise_the_forty_page_processing_limit(self):
        raw=sized_pdf(MAX_OBJECT_BYTES+1)
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            with patch.object(pilot.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout='Pages: 41\n')):
                result,children=pilot.media_work(store,{'source_url':URL,'media_url':PDF},Budget(10),
                    lambda *a,**k:(raw,PDF,'application/pdf',200))
            self.assertEqual(result['reason'],'document_page_budget_exceeded')
            self.assertEqual(children,[])
            self.assertEqual(store.object(result['archive']).read_bytes(),raw)
            store.close()

    def test_calendar_page_archives_both_ocr_readings_without_replacing_the_first(self):
        first={'text':'CRONOGRAMA\n02 de Noviembre de 2026','textTruncated':False,
               'engine':'tesseract-local','mean_confidence':77.8}
        second={**first,'text':'Cierre de periodo de recepción de postulaciones | 02 de Noviembre de 2026',
                'segmentation':4,'mean_confidence':94}
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);digest=store.put(b'%PDF-fixture','application/pdf')
            with patch.object(pilot.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout='\f')),\
                 patch.object(pilot,'tesseract_text',side_effect=[first,second]) as ocr:
                result,_=pilot.page_work(store,{'object_sha256':digest,'page':2,'pages':33,'mime':'application/pdf'},Budget(50))
            saved=json.loads(store.object(result['archive']).read_text())
            self.assertEqual(saved['text'],first['text'])
            self.assertEqual(saved['alternate_readings'],[second])
            self.assertEqual(ocr.call_args_list[1].kwargs,{'segmentation':4})
            store.close()

    def test_optional_calendar_reading_failure_keeps_the_original_page_and_records_the_error(self):
        first={'text':'CRONOGRAMA\n02 de Noviembre de 2026','textTruncated':False,
               'engine':'tesseract-local','mean_confidence':77.8}
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);digest=store.put(b'%PDF-fixture','application/pdf')
            with patch.object(pilot.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout='\f')),\
                 patch.object(pilot,'tesseract_text',side_effect=[first,TimeoutError('OCR timeout')]):
                result,_=pilot.page_work(store,{'object_sha256':digest,'page':2,'pages':33,'mime':'application/pdf'},Budget(50))
            saved=json.loads(store.object(result['archive']).read_text())
            self.assertEqual(saved['text'],first['text'])
            self.assertIn('alternate_reading_error',saved)
            self.assertNotIn('alternate_readings',saved)
            store.close()


class MunicipalProfileTests(unittest.TestCase):
    def pages(self):
        return json.loads((Path(__file__).parent/'fixtures/traiguen-salud-ocr-excerpts.json').read_text())

    def review(self,pages):
        return review_document(pages,source_url=URL,document_url=PDF,document_sha256='a'*64,
            published_at='2026-10-01T12:04:54+00:00',now=NOW)

    def test_real_ocr_separates_three_profiles_and_recovers_the_calendar_from_its_alternate_reading(self):
        result=self.review(self.pages())
        self.assertEqual([r['title'] for r in result['records']],
            ['QUÍMICO FARMACÉUTICO (A)','Ingeniero(a) en Prevención de Riesgos','Nutricionista'])
        for row in result['records']:
            self.assertEqual(row['employer'],'Municipalidad de Traiguén')
            self.assertEqual(row['original_deadline_status'],'not_expired')
            self.assertEqual(row['source_date_status'],'within_45_days')
            window=row['original_application_window']
            self.assertEqual(window['end'],'2026-11-03T02:59:59.999000+00:00')
            self.assertEqual(window['deadline_precision'],'date_only')
            self.assertEqual(window['evidence']['end']['page'],2)
            self.assertEqual(window['evidence']['end']['reading'],'alternate_readings:0')
            self.assertIsNone(row['contract_literal']);self.assertIsNone(row['salary_literal'])
            self.assertIsNone(row['work_commune']);self.assertIsNone(row['application'])
            self.assertTrue(row['application_options'])
            self.assertFalse(row['verified']);self.assertFalse(row['active']);self.assertFalse(row['published'])

    def test_conflicting_calendar_readings_and_detached_dates_are_not_resolved_by_guessing(self):
        pages=self.pages()
        pages[0]['text']='Cierre de periodo de recepción de postulaciones | 03 de Noviembre de 2026'
        for record in self.review(pages)['records']:
            self.assertIsNone(record['original_application_window'])
            self.assertEqual(record['original_deadline_status'],'not_confirmed')
        pages=self.pages();pages[0].pop('alternate_readings')
        pages[0]['text']='Inicio Recepción de Antecedentes\n01 de Octubre de 2026\nCierre de periodo de recepción de postulaciones\n02 de Noviembre de 2026'
        for record in self.review(pages)['records']:
            self.assertIsNone(record['original_application_window'])


if __name__=='__main__':unittest.main()
