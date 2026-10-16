import datetime as dt
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts.common import Budget
from scripts.radar_v2_store import PilotStore,restore
from scripts import radar_v2_pilot as pilot
from scripts.radar_v2_intake import import_manifest

NOW=dt.datetime(2026,10,14,10,tzinfo=dt.timezone.utc)
URL='https://municipalidadrenaico.cl/oferta-laboral-prueba'
CONFIG={'sources':[],'territories':['Renaico','Negrete'],'paid_providers_enabled':False,'publish_enabled':False}


class PilotQueueTests(unittest.TestCase):
    def test_old_directory_keeps_discovery_without_dating_or_verifying_its_children(self):
        raw=b'<title>OMIL</title><meta property="article:published_time" content="2025-07-28T20:23:02Z"><a href="/avisos/oferta-laboral-nueva">Oferta laboral</a><a href="/avisos/bases.pdf">Descargar Bases</a>'
        source={'key':'test','family':'municipal'}
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            result,children=pilot.web_work(store,{'url':URL,'source':source,'depth':0,'page_type':'directory'},Budget(5),lambda *a:(raw,URL,'text/html',200),NOW)
            self.assertTrue(result['old_source']);self.assertIsNone(result['source_published_at'])
            self.assertEqual(result['page_last_published_at'],'2025-07-28T20:23:02+00:00')
            self.assertEqual({child[0] for child in children},{'web','media'})
            medium=next(child[2] for child in children if child[0]=='media')
            self.assertIsNone(medium['source_published_at'])
            notice=next(child[2] for child in children if child[0]=='web')
            self.assertEqual(notice['page_type'],'notice');store.close()

    def test_a_recent_directory_date_never_rejuvenates_an_undated_poster(self):
        raw=b'<title>Ofertas laborales</title><meta property="article:published_time" content="2026-10-13T12:00:00Z"><a href="/oferta-laboral.png">Oferta laboral</a>'
        source={'key':'test','family':'municipal'}
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            _,children=pilot.web_work(store,{'url':URL,'source':source,'page_type':'directory'},Budget(5),lambda *a:(raw,URL,'text/html',200),NOW)
            medium=next(child[2] for child in children if child[0]=='media')
            text='Se necesita operador\nCargo: Operador forestal\nEmpresa: Empresa ficticia\nLugar de trabajo: Renaico\nEnviar CV: empleo@example.cl\nPostulaciones hasta el 20 de octubre de 2026'
            result,_=pilot.evaluate_work(store,{**medium,'text':text,'complete':True,'sha256':hashlib.sha256(text.encode()).hexdigest()},NOW)
            self.assertEqual(result['reason'],'source_date_missing_or_future');self.assertFalse(any(child[0]=='evaluate' for child in children));store.close()

    def test_disabled_web_source_is_not_requested_or_seeded(self):
        config={'sources':[{'key':'blocked','kind':'web','url':'https://blocked.example/','probe_enabled':False}],
                'territories':['Angol'],'paid_providers_enabled':False,'publish_enabled':False}
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            result=pilot.run(store,config,{'captures':[]},now=NOW,limit=0,
                             fetcher=lambda *a,**k:self.fail('disabled source must not be requested'))
            self.assertEqual(result['counts']['jobs'],0)
            store.close()

    def test_large_social_capture_is_archived_without_overflowing_the_queue_payload(self):
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            capture={'key':'test','posts':[{'url':'https://www.facebook.com/municipalidadrenaico/posts/12345','text':'x'*100000,'media':[]}]}
            result=pilot.run(store,CONFIG,{'captures':[capture]},now=NOW,limit=0)
            self.assertEqual(result['counts']['jobs'],1);self.assertEqual(result['counts']['runs'],1)
            payload=store.results()[0]['payload'];self.assertNotIn('capture',payload)
            self.assertGreater(store.object(payload['archive']).stat().st_size,80000);store.close()

    def test_old_snapshot_counts_restore_after_new_observation_metrics_are_added(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);store=PilotStore(root/'a');store.seed('web',URL,{},NOW);store.snapshot(root/'snapshot');store.close()
            manifest=root/'snapshot'/'manifest.json';metadata=json.loads(manifest.read_text())
            metadata['counts'].pop('runs');metadata['counts'].pop('observed_days');manifest.write_text(json.dumps(metadata))
            restore(root/'snapshot'/'pilot.sqlite3.gz',manifest,root/'b',lambda sha:b'')
            recovered=PilotStore(root/'b');self.assertEqual(recovered.counts()['jobs'],1);recovered.close()

    def test_a_document_evaluation_uses_the_original_file_and_keeps_its_index_as_provenance(self):
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);digest=store.put(b'original','image/png');text=store.put(json.dumps({'text':'Se necesita operador','textTruncated':False,'engine':'pdftotext-local'}).encode(),'application/json')
            source='https://municipalidadrenaico.cl/concursos-publicos/';file='https://municipalidadrenaico.cl/oferta-laboral.pdf'
            store.seed('page','test',{'source_url':source,'media_url':file,'object_sha256':digest,'page':1,'pages':1},NOW)
            job=store.claim(NOW);store.finish(job,{'archive':text},now=NOW);pilot.assemble_documents(store,NOW)
            evaluation=[row for row in store.results() if row['kind']=='evaluate'][0]
            self.assertEqual(evaluation['payload']['source_url'],file);self.assertEqual(evaluation['payload']['publisher_page'],source);store.close()

    def test_contributed_declared_dates_are_archived_but_require_origin_confirmation(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);store=PilotStore(root/'state');(root/'notice.png').write_bytes(b'test contribution')
            (root/'manifest.json').write_text(json.dumps([{'source_url':URL,'file':'notice.png','declared_publication_date':NOW.isoformat()}]))
            result=import_manifest(store,root/'manifest.json',NOW)
            payload=store.results()[0]['payload'];self.assertEqual(result['published'],0)
            self.assertIsNone(payload['source_published_at']);self.assertTrue(payload['contribution_requires_review'])
            text='Se necesita operador\nCargo: Operador forestal\nEmpresa: Empresa ficticia\nLugar de trabajo: Renaico\nPublicacion: 12 de octubre de 2026\nEnviar CV: empleo@example.cl\nPostulaciones hasta el 20 de octubre de 2026'
            notice,_=pilot.evaluate_work(store,{**payload,'text':text,'complete':True,'sha256':hashlib.sha256(text.encode()).hexdigest()},NOW)
            self.assertEqual(notice['status'],'pending');self.assertEqual(notice['reason'],'contribution_origin_requires_confirmation');store.close()

    def test_duplicate_work_keeps_audit_observations_without_duplicate_jobs(self):
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder)
            first=store.seed('web',URL,{'url':URL},NOW);second=store.seed('web',URL,{'url':URL},NOW)
            self.assertEqual(first,second);self.assertEqual(store.counts()['jobs'],1)
            self.assertEqual(store.counts()['observations'],2);store.close()

    def test_crash_recovery_preserves_attempts_and_rejects_the_previous_lease(self):
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);store.seed('web',URL,{},NOW)
            old=store.claim(NOW,lease_seconds=10);store.close()
            store=PilotStore(folder);new=store.claim(NOW+dt.timedelta(seconds=11))
            self.assertEqual(new['id'],old['id']);self.assertEqual(new['attempts'],2)
            with self.assertRaises(ValueError):store.finish(old,{'status':'captured'},now=NOW+dt.timedelta(seconds=12))
            store.finish(new,{'status':'captured'},now=NOW+dt.timedelta(seconds=12))
            self.assertEqual(store.counts()['attempts'],2);store.close()

    def test_failed_parent_cannot_commit_half_a_child_batch(self):
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);store.seed('web',URL,{},NOW);job=store.claim(NOW)
            with self.assertRaises(ValueError):store.finish(job,{},[('web','child',{}),('invalid','child',{})],NOW)
            self.assertEqual(store.counts()['jobs'],1);self.assertEqual(store.results()[0]['status'],'running');store.close()

    def test_retry_is_bounded_and_never_erases_the_failed_work(self):
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);store.seed('web',URL,{},NOW)
            for attempt in range(3):
                stamp=NOW+dt.timedelta(hours=attempt);job=store.claim(stamp);store.fail(job,'HTTP 403',stamp)
            self.assertEqual(store.counts()['jobs'],1);self.assertEqual(store.results()[0]['status'],'blocked')
            self.assertEqual(store.counts()['attempts'],3);store.close()

    def test_snapshot_restores_jobs_original_objects_and_hashes_without_replacing_history(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);store=PilotStore(root/'a');digest=store.put(b'original test notice','application/json')
            store.seed('web',URL,{},NOW);manifest=store.snapshot(root/'snapshot');store.close()
            reader=lambda sha:(root/'a'/'objects'/sha).read_bytes()
            restore(root/'snapshot'/'pilot.sqlite3.gz',root/'snapshot'/'manifest.json',root/'b',reader)
            recovered=PilotStore(root/'b');self.assertEqual(recovered.counts(),manifest['counts'])
            self.assertEqual(recovered.object(digest).read_bytes(),b'original test notice');recovered.close()
            with self.assertRaises(ValueError):restore(root/'snapshot'/'pilot.sqlite3.gz',root/'snapshot'/'manifest.json',root/'b',reader)
            with self.assertRaises(ValueError):restore(root/'snapshot'/'pilot.sqlite3.gz',root/'snapshot'/'manifest.json',root/'c',lambda sha:b'altered')
            self.assertFalse((root/'c'/'pilot.sqlite3').exists())

    def test_evidence_corruption_is_detected_and_foreign_media_is_never_requested(self):
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);digest=store.put(b'notice','image/png')
            store.object(digest).write_bytes(b'changed')
            with self.assertRaises(ValueError):store.object(digest)
            with self.assertRaises(ValueError):pilot.media_work(store,{'source_url':URL,'media_url':'https://unknown.example/notice.png'},Budget(5),lambda *a,**k:self.fail('no network'))
            store.close()

    def test_a_social_capture_date_or_another_post_proof_never_supplies_an_original_date(self):
        value={'source_url':'https://www.facebook.com/municipalidadrenaico/posts/12345','profile':'https://www.facebook.com/municipalidadrenaico','source_published_at':NOW.isoformat(),
          'date_proof':{'kind':'facebook_story_creation_time','post_url':'https://www.facebook.com/municipalidadrenaico/posts/another','literal_epoch':NOW.timestamp(),'source_sha256':'a'*64}}
        self.assertIsNone(pilot.original_date(value,NOW))
        value['date_proof']['post_url']=value['source_url'];self.assertEqual(pilot.original_date(value,NOW),NOW)

    def test_shared_image_bytes_do_not_borrow_another_publishers_date(self):
        with tempfile.TemporaryDirectory() as folder:
            store=PilotStore(folder);fetcher=lambda *a,**k:(b'test image',URL+'.png','image/png',200)
            a={'source_url':URL,'media_url':URL+'.png','source_published_at':'2026-10-12T03:00:00Z'}
            b={**a,'source_url':URL+'-second','source_published_at':'2026-10-13T03:00:00Z'}
            _,first=pilot.media_work(store,a,Budget(5),fetcher);_,second=pilot.media_work(store,b,Budget(5),fetcher)
            self.assertNotEqual(first[0][1],second[0][1]);self.assertEqual(first[0][2]['source_published_at'],a['source_published_at']);store.close()

    @unittest.skipUnless(shutil.which('pdftotext') and shutil.which('pdftoppm') and shutil.which('tesseract'),'real PDF/OCR readers required')
    def test_five_page_scanned_pdf_resumes_before_verification_and_replay_keeps_identity(self):
        from PIL import Image,ImageDraw,ImageFont
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);store=PilotStore(root/'state')
            font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',30)
            texts=['Se necesita operador\nCargo: Operador forestal','Empresa: Empresa de prueba\nLugar de trabajo: Renaico',
                   'Publicacion: 12 de octubre de 2026','Enviar CV: empleo@example.cl','Postulaciones hasta el 20 de octubre de 2026']
            images=[]
            for text in texts:
                image=Image.new('RGB',(1100,400),'white');ImageDraw.Draw(image).multiline_text((25,30),text,font=font,fill='black');images.append(image)
            images[0].save(root/'notice.pdf',save_all=True,append_images=images[1:],resolution=100)
            raw=(root/'notice.pdf').read_bytes();fetcher=lambda *a,**k:(raw,URL+'.pdf','application/pdf',200)
            store.seed('media',URL,{'source_url':URL,'media_url':URL+'.pdf','source_published_at':'2026-10-12T03:00:00Z'},NOW)
            first=pilot.run(store,CONFIG,{'captures':[]},now=NOW,limit=2,fetcher=fetcher)
            self.assertEqual(first['eligible_local_notices'],0)
            second=pilot.run(store,CONFIG,{'captures':[]},now=NOW,limit=8,fetcher=fetcher)
            self.assertEqual(second['eligible_local_notices'],1);self.assertEqual(second['published'],0)
            from scripts.radar_v2_publish import prepare
            from scripts.state import State
            history=State(root/'history.sqlite3')
            queue,_=prepare(store,history,root,now=NOW)
            self.assertEqual(queue['ready_count'],1);self.assertEqual(queue['records'][0]['source_url'],URL+'.pdf')
            self.assertEqual(queue['records'][0]['source_evidence']['sha256'],hashlib.sha256(raw).hexdigest())
            self.assertTrue(queue['records'][0]['source_evidence']['complete_document']);history.close()
            jobs=store.counts()['jobs'];pilot.run(store,CONFIG,{'captures':[]},now=NOW,limit=8,fetcher=fetcher)
            self.assertEqual(store.counts()['jobs'],jobs);self.assertEqual(len([r for r in store.results() if r['kind']=='page']),5);store.close()


if __name__=='__main__':unittest.main()
