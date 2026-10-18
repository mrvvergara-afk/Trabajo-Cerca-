import copy
import datetime as dt
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from scripts import durable_backup,radar_v2_pilot as pilot
from scripts.common import Budget
from scripts.document_unit_bridge import prepare_reviewed_units
from scripts.radar_v2_store import PilotStore
from scripts.state import State

NOW=dt.datetime(2026,10,17,23,30,tzinfo=dt.timezone.utc)
URL='https://mtraiguen.cl/municipalidad/concurso-ficticio-para-pruebas/'
PDF='https://mtraiguen.cl/bases-ficticias.pdf'
TITLES=['Operador forestal','Conductor municipal','Administrativo']


class DocumentUnitBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.root=Path(self.temporary.name)
        self.pilot=PilotStore(self.root/'pilot');self.history=State(self.root/'history.sqlite3')
        self.history.ingest([{'url':'https://www.chiletrabajos.cl/trabajo/historico-de-control'}],NOW-dt.timedelta(days=60))
        self.old=self.history.inventory()

    def tearDown(self):
        self.pilot.close();self.history.close();self.temporary.cleanup()

    def fixture(self,*,now=NOW,published='2026-10-01T12:04:54Z',closed=False):
        html=('<title>Concurso municipal</title><meta property="article:published_time" content="'+published+'">').encode()
        payload={'url':URL,'source':{'key':'test','family':'municipal'},'page_type':'notice','depth':1}
        result,_=pilot.web_work(self.pilot,payload,Budget(10),lambda *a:(html,URL,'text/html',200),now)
        self.pilot.seed('web','primary',payload,now);job=self.pilot.claim(now);self.pilot.finish(job,result,now=now)
        stream=io.BytesIO();images=[Image.new('RGB',(100,100),'white') for _ in range(3)]
        images[0].save(stream,format='PDF',save_all=True,append_images=images[1:]);digest=self.pilot.put(stream.getvalue(),'application/pdf')
        media={'source_url':URL,'media_url':PDF,'html_object_sha256':result['html_object_sha256'],
               'source_published_at':published,'capture_slot':result['capture_slot']}
        if closed:
            listing='https://mtraiguen.cl/concursos-publicos/'
            listing_hash=self.pilot.put(('<a href="'+URL+'">Postulación Cerrada — Concurso</a>').encode(),'text/html')
            media['listing_evidence']={'source_url':listing,'notice_url':URL,'html_object_sha256':listing_hash}
        self.pilot.seed('media','pdf',media,now);job=self.pilot.claim(now)
        self.pilot.finish(job,{'status':'downloaded','archive':digest,'page_count':3,'bytes':len(stream.getvalue())},now=now)
        texts=['APRUEBA BASES PARA LLAMADO A CONCURSO PÚBLICO DE 3 CARGOS\n'
               'La Municipalidad de Traiguén llama a concurso Público\n'+
               '\n'.join(str(i+1)+'. Perfil de Cargo: '+t for i,t in enumerate(TITLES))+
               '\nLugar de trabajo: Departamento de Salud Municipal de Traiguén',
               'CRONOGRAMA\nFechas ilegibles en esta segmentación',
               'El sobre de cada postulante se entregará en la Oficina de Partes, ubicada en calle Balmaceda 424.\n'
               'Atención: lunes a viernes de 09:00 a 14:00 hrs.\nCierre a las 14:00 hrs., impostergablemente.']
        values=[]
        for number,text in enumerate(texts,1):
            value={'text':text,'textTruncated':False,'engine':'tesseract-local','mean_confidence':95}
            if number==2:value['alternate_readings']=[{**value,'text':'Inicio Recepción de Antecedentes 01 de Octubre de 2026\nCierre de periodo de recepción de postulaciones | 02 de Noviembre de 2026'}]
            sha=pilot.json_blob(self.pilot,value);values.append((value,sha))
            self.pilot.seed('page','page-'+str(number),{**media,'object_sha256':digest,'mime':'application/pdf','page':number,'pages':3},now)
            job=self.pilot.claim(now);self.pilot.finish(job,{'archive':sha},now=now)
        def ref(number,literal,reading='primary'):
            return {'page':number,'text_object_sha256':values[number-1][1],'reading':reading,'literal':literal}
        units=[]
        for title in TITLES:
            units.append({'title':title,'company':'Municipalidad de Traiguén','work_commune':'Traiguén','fields':{
                'title':ref(1,'Perfil de Cargo: '+title),'company':ref(1,'La Municipalidad de Traiguén llama a concurso Público'),
                'workplace':ref(1,'Lugar de trabajo: Departamento de Salud Municipal de Traiguén'),
                'deadline':ref(2,'Cierre de periodo de recepción de postulaciones | 02 de Noviembre de 2026','alternate_readings:0'),
                'deadline_time':ref(3,'a las 14:00 hrs., impostergablemente.'),
                'application':ref(3,texts[2].split('\nCierre')[0]),
                'scope':ref(1,texts[0].splitlines()[0])}})
        return {'schema':'trabajo-cerca.document-unit-review.v1','source_url':URL,'document_url':PDF,
                'document_sha256':digest,'reviewed_at':now.isoformat(),'units':units}

    def prepare(self,manifest,now=NOW):
        return prepare_reviewed_units(self.pilot,self.history,manifest,self.root/'output',now=now)

    def test_three_reviewed_jobs_share_one_url_without_overwriting_legacy_history_and_replay_is_idempotent(self):
        manifest=self.fixture();queue,report=self.prepare(manifest)
        self.assertEqual(queue['ready_count'],3);self.assertEqual(report['published'],0)
        self.assertEqual(len({r['candidate_id'] for r in queue['records']}),3)
        self.assertEqual({r['source_url'] for r in queue['records']},{URL})
        self.assertTrue(all(r['valid_through']=='2026-11-02T17:00:00+00:00' for r in queue['records']))
        self.assertTrue(all(r['application'].endswith('#page=3') for r in queue['records']))
        again,_=self.prepare(manifest);self.assertEqual(queue['records'],again['records'])
        self.assertEqual(self.history.connection.execute('SELECT count(*) FROM document_unit_attempts').fetchone()[0],3)
        self.assertEqual(self.history.inventory(),self.old)

    def test_snapshot_restores_unit_history_and_receipts_without_replacing_legacy_candidates(self):
        queue,_=self.prepare(self.fixture())
        proof={'ingestion':{'published':3,'feedManifestId':'local-manifest','receipts':[
            {'candidateId':r['candidate_id'],'sourceUrl':URL,'publishedId':'local-'+r['candidate_id']} for r in queue['records']]},
            'feed':{'complete':True,'manifestId':'local-manifest'},'visibleIds':['local-'+r['candidate_id'] for r in queue['records']]}
        self.history.record_publication_receipts(proof,NOW)
        metadata=durable_backup.snapshot(self.root/'history.sqlite3',self.root/'backup')
        self.assertEqual(metadata['counts']['document_units'],3)
        self.assertEqual(metadata['counts']['document_unit_attempts'],3)
        durable_backup.restore(self.root/'backup/radar.sqlite3.gz',self.root/'backup/manifest.json',self.root/'restored.sqlite3')
        restored=State(self.root/'restored.sqlite3')
        try:
            self.assertEqual(restored.document_inventory(),self.history.document_inventory())
            self.assertEqual(restored.inventory(),self.old)
            self.assertEqual(restored.connection.execute('SELECT count(*) FROM publication_receipts').fetchone()[0],3)
        finally:restored.close()

    def test_an_invalid_third_unit_prevents_partial_history_writes(self):
        manifest=self.fixture();manifest['units'][2]['fields']['title']['literal']='Cargo inventado'
        with self.assertRaisesRegex(ValueError,'field_literal_mismatch'):self.prepare(manifest)
        self.assertEqual(self.history.document_inventory(),[]);self.assertEqual(self.history.inventory(),self.old)

    def test_page_hash_reading_or_missing_page_cannot_be_replaced_by_declared_fields(self):
        manifest=self.fixture()
        for field,value,reason in [('text_object_sha256','a'*64,'field_page_hash_mismatch'),
                                   ('reading','alternate_readings:90','field_reading_missing')]:
            changed=copy.deepcopy(manifest);changed['units'][0]['fields']['deadline'][field]=value
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,reason):self.prepare(changed)
        with self.pilot.connection:self.pilot.connection.execute("UPDATE jobs SET status='retry' WHERE id=(SELECT id FROM jobs WHERE kind='page' LIMIT 1)")
        with self.assertRaisesRegex(ValueError,'document_pages_incomplete'):self.prepare(manifest)
        self.assertEqual(self.history.document_inventory(),[])

    def test_missing_original_is_blocked_without_erasing_previous_review_or_history(self):
        from scripts.radar_v2_publish import prepare
        manifest=self.fixture();self.prepare(manifest)
        self.pilot.object(manifest['document_sha256']).unlink()
        queue,report=prepare(self.pilot,self.history,self.root/'handoff',now=NOW,territories=['Traiguén'],document_reviews=[manifest])
        self.assertEqual(queue['ready_count'],0)
        self.assertEqual(report['blocked'][0]['reason'],'document_evidence_unavailable')
        self.assertEqual(len(self.history.document_inventory()),3);self.assertEqual(self.history.inventory(),self.old)

    def test_closed_listing_or_old_capture_never_becomes_a_fresh_document_offer(self):
        manifest=self.fixture(closed=True)
        with self.assertRaisesRegex(ValueError,'listing_marks_notice_closed'):self.prepare(manifest)
        self.assertEqual(self.history.document_inventory(),[])

    def test_stale_capture_cannot_be_refreshed_using_a_new_review_timestamp(self):
        manifest=self.fixture();later=NOW+dt.timedelta(days=2);manifest['reviewed_at']=later.isoformat()
        with self.assertRaisesRegex(ValueError,'pilot_evidence_requires_recollection'):self.prepare(manifest,later)

    def test_unknown_source_date_is_not_replaced_by_the_review_date(self):
        manifest=self.fixture(published='')
        with self.assertRaisesRegex(ValueError,'source_date_missing_future_or_old'):self.prepare(manifest)

    def test_a_freshly_read_but_expired_document_is_kept_without_a_publication(self):
        later=dt.datetime(2026,11,2,17,tzinfo=dt.timezone.utc);manifest=self.fixture(now=later)
        queue,report=self.prepare(manifest,later)
        self.assertEqual(queue['ready_count'],0);self.assertEqual(len(report['rejected']),3)
        self.assertEqual(len(self.history.document_inventory()),3);self.assertEqual(self.history.inventory(),self.old)

    def test_legacy_identities_remain_unchanged_and_document_updates_keep_their_unit_ids(self):
        from scripts.public_source_adapters import offer_identity
        self.assertEqual(offer_identity('http://www.chiletrabajos.cl/trabajo/test/?utm_source=x'),
                         'https://www.chiletrabajos.cl/trabajo/test')
        first,_=self.prepare(self.fixture());result=self.history.document_inventory()[0]['verification']
        result['document_unit']['document_sha256']='f'*64
        identifier=self.history.record_document_result(result,NOW)
        self.assertIn(identifier,[r['candidate_id'] for r in first['records']])
        self.assertEqual(len(self.history.document_inventory()),3)

    def test_existing_handoff_requires_explicit_review_and_preserves_the_three_unit_ids(self):
        from scripts.radar_v2_publish import prepare
        manifest=self.fixture()
        control=json.loads((Path(__file__).resolve().parents[1]/'config/radar-v2-publication-control.json').read_text())
        self.assertFalse(control['publish_enabled']);self.assertFalse(control['paid_providers_enabled'])
        queue,report=prepare(self.pilot,self.history,self.root/'handoff',now=NOW,territories=control['territories'],document_reviews=[manifest])
        self.assertEqual(queue['ready_count'],3);self.assertEqual(report['reviewed_document_candidates'],3)
        again,_=prepare(self.pilot,self.history,self.root/'handoff',now=NOW,territories=['Traiguén'],document_reviews=[manifest])
        self.assertEqual(again['records'],queue['records'])
        unreviewed,_=prepare(self.pilot,self.history,self.root/'handoff',now=NOW,territories=['Traiguén'])
        self.assertEqual(unreviewed['ready_count'],0)

    def test_a_new_closed_listing_blocks_even_previously_reviewed_document_units(self):
        from scripts.radar_v2_publish import prepare
        manifest=self.fixture();self.prepare(manifest)
        listing='https://mtraiguen.cl/concursos-publicos/'
        digest=self.pilot.put(('<a href="'+URL+'">Postulación Cerrada</a>').encode(),'text/html')
        row=next(r for r in self.pilot.results() if r['kind']=='media')
        payload={**row['payload'],'listing_evidence':{'source_url':listing,'notice_url':URL,'html_object_sha256':digest}}
        with self.pilot.connection:self.pilot.connection.execute('UPDATE jobs SET payload=? WHERE id=?',(json.dumps(payload),row['id']))
        queue,report=prepare(self.pilot,self.history,self.root/'handoff',now=NOW,territories=['Traiguén'],document_reviews=[manifest])
        self.assertEqual(queue['ready_count'],0)
        self.assertEqual(report['blocked'][0]['reason'],'listing_marks_notice_closed')
        self.assertEqual(len(self.history.document_inventory()),3)


if __name__=='__main__':unittest.main()
