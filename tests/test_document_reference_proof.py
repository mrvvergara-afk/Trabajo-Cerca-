import datetime as dt
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import radar_v2_pilot as pilot, radar_v2_publish as publish
from scripts.common import Budget
from scripts.document_reference_proof import prove
from scripts.document_review import review_document
from scripts.local_source_audit import discover,tesseract_text,public_medium_url
from scripts.radar_v2_store import PilotStore
from scripts.state import State

ROOT=Path(__file__).resolve().parents[1]
URL='https://mtraiguen.cl/municipalidad/bases-de-segundo-llamado-a-concurso-publico-programa-red-local-de-apoyos-y-cuidados-prlac-traiguen/'
PDF='https://mtraiguen.cl/wp-content/uploads/2026/09/decreto-y-bases-2do-llamado.pdf'
NOW=dt.datetime(2026,10,17,22,tzinfo=dt.timezone.utc)


class EmbeddedDocumentTests(unittest.TestCase):
    def test_lumaco_public_download_without_extension_keeps_the_publisher_and_has_no_fake_date(self):
        origin='https://www.munilumaco.cl/index.php/afiches-municipales/811-llamados-a-concurso-publico'
        target='https://www.munilumaco.cl/index.php/component/phocadownload/category/1-concursos?Itemid=101&download=23%3Abases-jefatura-grado-8'
        raw=('<h1>Llamados a concurso público</h1><a href="'+target.replace('&','&amp;')+'">Bases Jefatura grado 8°</a>').encode()
        page=discover(raw.decode(),origin)
        self.assertEqual(len(page['candidates']),1);self.assertEqual(page['candidates'][0]['kind'],'document')
        self.assertIsNone(page['source_published_at'])
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            _,children=pilot.web_work(store,{'url':origin,'source':{'key':'lumaco','family':'municipal'},'depth':1},
                Budget(10),lambda *args:(raw,origin,'text/html',200),NOW)
            self.assertEqual([kind for kind,_,_ in children],['evaluate','media'])
            medium=children[1][2]
            self.assertEqual(medium['source_url'],origin);self.assertIsNone(medium['source_published_at'])
            store.close()
        for invalid in [target+'&token=x',target+'&download=24:other',target.replace('munilumaco.cl','attacker.example'),
                        target+'&redirect=https://attacker.example/a.pdf',target.replace('download=23','download=0')]:
            self.assertFalse(public_medium_url(invalid),invalid)

    @unittest.skipUnless(all(shutil.which(tool) for tool in ('pdftotext','pdftoppm','tesseract')),'local PDF and OCR tools required')
    def test_text_bearing_pdf_also_reads_an_image_poster_without_replacing_the_original_text(self):
        import io
        from PIL import Image,ImageDraw,ImageFont
        image=Image.new('RGB',(1300,300),'white')
        font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',44)
        ImageDraw.Draw(image).multiline_text((25,25),'SE NECESITA OPERADOR\nEnviar CV: empleo@example.cl',font=font,fill='black',spacing=20)
        stream=io.BytesIO();image.save(stream,format='JPEG');jpeg=stream.getvalue()
        text='A newspaper article with searchable text about municipal activities. ' * 4
        commands=('BT /F1 10 Tf 40 740 Td ('+text+') Tj ET\nq 530 0 0 123 40 100 cm /Poster Do Q').encode()
        objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> /XObject << /Poster 6 0 R >> >> /Contents 5 0 R >>',
            b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            ('<< /Length '+str(len(commands))+' >>\nstream\n').encode()+commands+b'\nendstream',
            ('<< /Type /XObject /Subtype /Image /Width 1300 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+str(len(jpeg))+' >>\nstream\n').encode()+jpeg+b'\nendstream']
        raw=b'%PDF-1.4\n';offsets=[]
        for number,obj in enumerate(objects,1):
            offsets.append(len(raw));raw+=(str(number)+' 0 obj\n').encode()+obj+b'\nendobj\n'
        start=len(raw);raw+=b'xref\n0 7\n0000000000 65535 f \n'
        raw+=b''.join((f'{offset:010} 00000 n \n').encode() for offset in offsets)
        raw+=('trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n'+str(start)+'\n%%EOF').encode()
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);digest=store.put(raw,'application/pdf')
            payload={'source_url':URL,'object_sha256':digest,'mime':'application/pdf','page':1,'pages':1,'ocr_all_pdf_pages':True}
            result,_=pilot.page_work(store,payload,Budget(40))
            value=json.loads(store.object(result['archive']).read_text())
            self.assertEqual(value['engine'],'pdftotext-local');self.assertIn('newspaper article',value['text'])
            self.assertNotIn('empleo@example.cl',value['text'])
            self.assertIn('empleo@example.cl',value['alternate_readings'][0]['text'])
            self.assertEqual(value['alternate_readings'][0]['engine'],'tesseract-local')
            status,_=pilot.evaluate_work(store,{**payload,'text':value['text'],'sha256':digest},NOW)
            self.assertEqual(status['reason'],'mixed_pdf_requires_review');store.close()

    def test_actual_traiguen_markup_discovers_the_pdf_once_and_preserves_its_parent_date(self):
        raw=(ROOT/'tests/fixtures/traiguen-embedded-document.html').read_bytes()
        page=discover(raw.decode(),URL)
        self.assertEqual([p['url'] for p in page['candidates']],[PDF])
        self.assertEqual(page['source_published_at'],'2026-09-14T16:00:11+00:00')
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            source={'key':'traiguen','family':'municipal'}
            _,children=pilot.web_work(store,{'url':URL,'source':source,'depth':1,'page_type':'notice'},
                Budget(10),lambda *args:(raw,URL,'text/html',200),NOW)
            media=[p for k,identity,p in children if k=='media']
            self.assertEqual(len(media),1)
            self.assertEqual(media[0]['media_url'],PDF)
            self.assertEqual(media[0]['source_published_at'],page['source_published_at'])
            self.assertEqual(store.object(media[0]['html_object_sha256']).read_bytes(),raw)
            store.close()

    def test_direct_embeds_and_pdfjs_targets_are_local_documents_and_foreign_or_script_urls_are_ignored(self):
        raw=('<embed src="/a.pdf"><object data="/b.pdf#page=2"></object>'
             '<iframe src="/plugin/viewer.html?file=%2Fc.pdf"></iframe>'
             '<iframe src="https://external.example/foreign.pdf"></iframe>'
             '<iframe src="javascript:run.pdf"></iframe>'
             '<script>const value="https://mtraiguen.cl/hidden.pdf";</script>')
        self.assertEqual({p['url'] for p in discover(raw,URL)['candidates']},
                         {'https://mtraiguen.cl/a.pdf','https://mtraiguen.cl/b.pdf','https://mtraiguen.cl/c.pdf'})

    def test_plain_text_from_a_successful_tesseract_process_is_not_accepted_as_empty_tsv(self):
        values=[subprocess.CompletedProcess([],0,stdout='spa\n',stderr=''),
                subprocess.CompletedProcess([],0,stdout='Cargo: Kinesiólogo\n',stderr='')]
        with patch('scripts.local_source_audit.shutil.which',return_value='/fake/tesseract'),\
             patch('scripts.local_source_audit.subprocess.run',side_effect=values):
            with self.assertRaisesRegex(RuntimeError,'local_ocr_tsv_unavailable'):
                tesseract_text(Path('fixture.png'),Budget(10))

    @unittest.skipUnless(shutil.which('tesseract') and Path('/usr/share/tesseract-ocr/5/tessdata/eng.traineddata').exists(),'local English OCR model required')
    def test_real_ocr_works_with_language_files_only_without_a_tsv_config_file(self):
        from PIL import Image,ImageDraw,ImageFont
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);data=root/'tessdata';data.mkdir()
            (data/'eng.traineddata').symlink_to('/usr/share/tesseract-ocr/5/tessdata/eng.traineddata')
            image=Image.new('RGB',(1100,220),'white')
            font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',36)
            ImageDraw.Draw(image).multiline_text((25,30),'CARGO: OPERADOR\nCONTACTO: empleo@example.cl',font=font,fill='black')
            image.save(root/'fixture.png')
            with patch.dict(os.environ,{'TESSDATA_PREFIX':str(data),'OMP_THREAD_LIMIT':'1'}):
                value=tesseract_text(root/'fixture.png',Budget(20))
            self.assertIn('OPERADOR',value['text'])
            self.assertIn('empleo@example.cl',value['text'])
            self.assertEqual(value['language'],'eng')

    def test_reference_proof_checks_robots_and_never_crawls_or_publishes_when_disallowed(self):
        calls=[]
        def fetch(url,*args,**kwargs):
            calls.append(url)
            self.assertEqual(url,'https://mtraiguen.cl/robots.txt')
            return b'User-agent: *\nDisallow: /\n',url,'text/plain',200
        with tempfile.TemporaryDirectory() as folder:
            result=prove(URL,Path(folder)/'proof',fetcher=fetch,now=NOW)
            self.assertEqual(calls,['https://mtraiguen.cl/robots.txt'])
            self.assertEqual(result['published'],0)
            self.assertFalse(result['production_modified'])
            self.assertEqual(result['local_handoff_ready'],0)
            self.assertEqual(result['counts']['statuses'],{'retry':1})


class ClosedListingTests(unittest.TestCase):
    def check_closed(self,with_image):
        index='https://municipalidadrenaico.cl/concursos-publicos/'
        notice='https://municipalidadrenaico.cl/oferta-laboral'
        text=('Cargo: Operador forestal\nEmpresa: Empresa de prueba\nLugar de trabajo: Renaico\n'
              'Enviar CV: empleo@example.cl\nPostulaciones hasta el 25 de octubre de 2026')
        directory=('<a href="'+notice+'">Postulación Cerrada: oferta laboral</a>').encode()
        body='<a href="/afiche.png">Oferta laboral</a>' if with_image else '<article>'+text+'</article>'
        html=('<title>Oferta laboral</title><meta property="article:published_time" content="2026-10-12T03:00:00Z">'+body).encode()
        source={'key':'renaico','kind':'web','family':'municipal','territory':'Renaico','url':index,'page_type':'directory'}
        config={'sources':[source],'territories':['Renaico'],'paid_providers_enabled':False,'publish_enabled':False}
        def fetch(url,*args,**kwargs):
            if url==index:return directory,url,'text/html',200
            if url==notice:return html,url,'text/html',200
            self.assertEqual(url,'https://municipalidadrenaico.cl/afiche.png')
            return b'fixture image',url,'image/png',200
        extracted={'text':text,'textTruncated':False,'engine':'tesseract-local','mean_confidence':95}
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(Path(folder)/'pilot');history=State(Path(folder)/'history.sqlite3')
            with patch.object(pilot,'tesseract_text',return_value=extracted):
                result=pilot.run(store,config,{'captures':[]},now=NOW,limit=15,fetcher=fetch)
            self.assertEqual(result['eligible_hard_source_notices'],0)
            row=next(p for p in store.results() if p['kind']=='evaluate')
            self.assertEqual(row['result']['reason'],'listing_marks_notice_closed')
            # Removing the evaluation's pointer cannot override the original capture's closed listing.
            payload={k:v for k,v in row['payload'].items() if k!='listing_evidence'}
            with store.connection:
                store.connection.execute('UPDATE jobs SET payload=?,result=? WHERE id=?',
                    (json.dumps(payload),json.dumps({**row['result'],'status':'verified'}),row['id']))
            queue,handoff=publish.prepare(store,history,folder,now=NOW,territories=['Renaico'])
            self.assertEqual(queue['ready_count'],0)
            self.assertEqual(handoff['blocked'][0]['reason'],'listing_marks_notice_closed')
            self.assertEqual(history.inventory(),[])
            store.close();history.close()

    def test_closed_listing_overrides_an_open_html_body_and_a_forged_verified_flag(self):
        self.check_closed(False)

    def test_closed_listing_survives_media_ocr_and_handoff_revalidation(self):
        self.check_closed(True)


class DocumentReviewTests(unittest.TestCase):
    def review(self,pages,published_at='2026-09-14T16:00:11+00:00'):
        return review_document(pages,source_url=URL,document_url=PDF,document_sha256='a'*64,
                               published_at=published_at,now=NOW)

    def test_actual_ocr_excerpts_separate_two_closed_roles_with_page_bound_evidence(self):
        pages=json.loads((ROOT/'tests/fixtures/traiguen-review-ocr-excerpts.json').read_text())
        result=self.review(pages)
        self.assertEqual([r['title'] for r in result['records']],['Kinesiólogo','Terapeuta Ocupacional'])
        self.assertFalse(result['publication_approved'])
        for row in result['records']:
            self.assertEqual(row['employer'],'Municipalidad de Traiguén')
            self.assertEqual(row['source_date_status'],'within_45_days')
            self.assertEqual(row['original_deadline_status'],'expired')
            self.assertEqual(row['role_evidence']['page'],3)
            self.assertEqual(row['original_application_window']['evidence']['page'],10)
            self.assertEqual(row['original_application_window']['end'],'2026-09-23T02:59:59.999000+00:00')
            self.assertIn('Basilio Urrutia',row['application']['instructions'])
            self.assertEqual(row['application']['evidence']['page'],11)
            self.assertIsNone(row['work_commune'])
            self.assertFalse(row['verified']);self.assertFalse(row['active']);self.assertFalse(row['published'])
        self.assertEqual([r['review_id'] for r in result['records']],
                         [r['review_id'] for r in self.review(pages)['records']])

    def test_conflicting_deadlines_and_missing_publication_date_remain_unconfirmed(self):
        pages=json.loads((ROOT/'tests/fixtures/traiguen-review-ocr-excerpts.json').read_text())
        pages.append({'page':12,'text_object_sha256':'b'*64,
                      'text':'Recepción de Antecedentes 1 al 3 de Octubre 2026'})
        for record in self.review(pages,published_at=None)['records']:
            self.assertEqual(record['source_date_status'],'unknown')
            self.assertIsNone(record['original_application_window'])
            self.assertEqual(record['original_deadline_status'],'not_confirmed')
            self.assertFalse(record['active'])

    def test_long_documents_keep_separate_review_records_without_raising_the_publication_text_limit(self):
        pages=json.loads((ROOT/'tests/fixtures/traiguen-review-ocr-excerpts.json').read_text())
        texts=[pages[0]['text']+'\n'+('Anexo de evaluación. '*550),
               pages[1]['text']+'\n'+pages[2]['text']+'\n'+('Anexo de evaluación. '*550)]
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);digest=store.put(b'%PDF-fixture','application/pdf')
            for number,text in enumerate(texts,1):
                payload={'source_url':URL,'media_url':PDF,'object_sha256':digest,'mime':'application/pdf',
                         'page':number,'pages':2,'source_published_at':'2026-09-14T16:00:11+00:00'}
                archive=pilot.json_blob(store,{'text':text,'textTruncated':False,'engine':'tesseract-local','mean_confidence':95})
                store.seed('page','page-'+str(number),payload,NOW)
                job=store.claim(NOW);store.finish(job,{'archive':archive},now=NOW)
            pilot.assemble_documents(store,NOW)
            row=next(r for r in store.results() if r['kind']=='evaluate')
            self.assertLessEqual(len(row['payload']['text']),18000)
            self.assertFalse(row['payload']['complete'])
            review=json.loads(store.object(row['payload']['document_review_sha256']).read_text())
            self.assertEqual(len(review['records']),2)
            result,_=pilot.evaluate_work(store,row['payload'],NOW)
            self.assertEqual(result['status'],'pending')
            self.assertEqual(result['review_notice_count'],2)
            store.close()


if __name__=='__main__':unittest.main()
