import datetime as dt
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import radar_v2_pilot as pilot, radar_v2_publish as publish
from scripts.common import Budget
from scripts.radar_v2_store import PilotStore
from scripts.state import State

NOW = dt.datetime(2026, 10, 15, 15, tzinfo=dt.timezone.utc)
URL = 'https://municipalidadrenaico.cl/oferta-laboral-documentada'
SOURCE = {'key':'renaico-web', 'kind':'web', 'family':'municipal', 'territory':'Renaico',
          'url':URL, 'page_type':'notice'}
CONFIG = {'sources':[SOURCE], 'territories':['Renaico'],
          'paid_providers_enabled':False, 'publish_enabled':False}
TEXT = ('Se necesita operador\nCargo: Operador forestal\nEmpresa: Empresa de prueba\n'
        'Lugar de trabajo: Renaico\nEnviar CV: empleo@example.cl\n'
        'Postulaciones hasta el 25 de octubre de 2026')


def html(text=TEXT, date='2026-10-12T03:00:00Z'):
    return ('<title>Oferta laboral</title><meta property="article:published_time" content="' + date + '">'
            '<article>' + ''.join('<p>' + line + '</p>' for line in text.splitlines()) + '</article>').encode()


class StructuralPipelineTests(unittest.TestCase):
    def test_html_original_reaches_handoff_and_payload_cannot_replace_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            store, history = PilotStore(Path(folder)/'pilot'), State(Path(folder)/'history.sqlite3')
            raw = html()
            report = pilot.run(store, CONFIG, {'captures':[]}, now=NOW, limit=3,
                fetcher=lambda *a:(raw, URL, 'text/html', 200))
            self.assertEqual(report['eligible_hard_source_notices'], 1)
            row = next(row for row in store.results() if row['kind']=='evaluate')
            self.assertEqual(store.object(row['payload']['html_object_sha256']).read_bytes(), raw)
            forged = {**row['payload'], 'text':TEXT.replace('Empresa de prueba', 'Empresa inventada'),
                      'source_published_at':NOW.isoformat()}
            with store.connection:
                store.connection.execute('UPDATE jobs SET payload=? WHERE id=?', (json.dumps(forged), row['id']))
            queue, _ = publish.prepare(store, history, folder, now=NOW)
            self.assertEqual(queue['ready_count'], 1)
            self.assertEqual(queue['records'][0]['company'], 'Empresa de prueba')
            self.assertEqual(queue['records'][0]['source_published_at'], '2026-10-12T03:00:00+00:00')
            checked = subprocess.run(['node','--input-type=module','-e', """
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHash, createPublicKey, verify } from 'node:crypto';
import vm from 'node:vm';
const ctx = vm.createContext({ URL, Date, Intl, Buffer, createHash, createPublicKey, verify });
for (const file of ['public-source-adapters.ts', 'radar-ingestion.ts']) {
  const source = stripTypeScriptTypes(readFileSync('integrations/appdeploy/' + file, 'utf8'), { mode:'strip' })
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, ctx);
}
ctx.validateOffer(JSON.parse(readFileSync(0,'utf8')),Date.parse('2026-10-15T15:00:00Z'));
"""], input=json.dumps(queue['records'][0]), capture_output=True, text=True, timeout=8)
            self.assertEqual(checked.returncode, 0, checked.stderr)
            store.close(); history.close()

    def test_image_only_notice_with_lazy_loaded_poster_is_sent_to_ocr_without_inventing_text(self):
        raw = ('<title>Comunidad</title><meta property="article:published_time" content="2026-10-12T03:00:00Z">'
               '<article><img src="/placeholder.png" data-src="/afiche.png" alt="Oferta laboral OMIL"></article>').encode()
        with tempfile.TemporaryDirectory() as folder:
            store = PilotStore(folder)
            _, children = pilot.web_work(store, {'url':URL,'source':SOURCE,'page_type':'notice'},
                Budget(10), lambda *a:(raw, URL, 'text/html', 200), NOW)
            self.assertEqual([row[0] for row in children], ['media'])
            self.assertEqual(children[0][2]['media_url'], 'https://municipalidadrenaico.cl/afiche.png')
            self.assertEqual(children[0][2]['text'], '')
            store.close()

    def test_directory_does_not_send_service_icons_and_generic_photos_to_ocr(self):
        raw = ('<title>OMIL</title><p>Oficina OMIL</p><img src="/t-activa.svg">'
               '<img src="/foto-plaza.jpg"><img src="/afiche-empleo.png" alt="Oferta laboral">').encode()
        with tempfile.TemporaryDirectory() as folder:
            store = PilotStore(folder)
            _, children = pilot.web_work(store, {'url':URL,'source':SOURCE,'page_type':'directory'},
                Budget(10), lambda *a:(raw, URL, 'text/html', 200), NOW)
            self.assertEqual([row[2]['media_url'] for row in children],
                ['https://municipalidadrenaico.cl/afiche-empleo.png'])
            store.close()

    def test_drain_reads_downloaded_evidence_before_backlog_without_opening_any_url(self):
        with tempfile.TemporaryDirectory() as folder:
            store = PilotStore(folder)
            store.seed('web', 'queued-page', {'url':URL,'source':SOURCE}, NOW)
            store.seed('media', 'queued-download', {'source_url':URL,'media_url':URL+'.png'}, NOW)
            digest = store.put(b'archived test image', 'image/png')
            store.seed('page','downloaded-page',{'source_url':URL,'object_sha256':digest,
                'mime':'image/png','page':1,'pages':1,'source_published_at':'2026-10-12T03:00:00Z'},NOW)
            with patch.object(pilot, 'tesseract_text', return_value={'text':TEXT,'textTruncated':False,
                    'engine':'tesseract-local','mean_confidence':95}):
                report = pilot.run(store, {**CONFIG,'sources':[]}, {'captures':[]}, now=NOW,
                    limit=10, work_kinds=('page','evaluate'), fetcher=lambda *a:self.fail('drain opened a URL'))
            self.assertEqual(report['processed'],2)
            self.assertEqual(report['eligible_hard_source_notices'],1)
            remaining = [row for row in store.results() if row['status']=='queued']
            self.assertEqual({row['kind'] for row in remaining},{'web','media'})
            store.close()

    def test_directory_and_foreign_original_cannot_be_promoted_by_a_verified_flag(self):
        with tempfile.TemporaryDirectory() as folder:
            store, history = PilotStore(Path(folder)/'pilot'), State(Path(folder)/'history.sqlite3')
            pilot.run(store, CONFIG, {'captures':[]}, now=NOW, limit=3,
                fetcher=lambda *a:(html(), URL, 'text/html', 200))
            rows = store.results()
            evaluation = next(row for row in rows if row['kind']=='evaluate')
            web = next(row for row in rows if row['kind']=='web')
            fake = {**web['result'], 'page_type':'directory'}
            with store.connection:
                store.connection.execute('UPDATE jobs SET result=? WHERE id=?', (json.dumps(fake), web['id']))
            queue, report = publish.prepare(store, history, folder, now=NOW)
            self.assertEqual(queue['ready_count'], 0)
            self.assertEqual(report['blocked'][0]['reason'], 'original_html_capture_missing')
            self.assertEqual(history.inventory(), [])
            store.close(); history.close()

    def test_same_document_can_be_recollected_after_24h_without_rejuvenating_its_date(self):
        with tempfile.TemporaryDirectory() as folder:
            store, history = PilotStore(Path(folder)/'pilot'), State(Path(folder)/'history.sqlite3')
            # Each pass discovers the same image bytes and extracts one page. Only OCR is stubbed.
            raw = html('<a href="/oferta.png">Oferta laboral</a>')
            def fetch(url, *args, **kwargs):
                return (b'same original image', url, 'image/png', 200) if url.endswith('.png') else (raw, url, 'text/html', 200)
            extracted = {'text':TEXT, 'textTruncated':False, 'engine':'tesseract-local', 'mean_confidence':95}
            with patch.object(pilot, 'tesseract_text', return_value=extracted):
                pilot.run(store, CONFIG, {'captures':[]}, now=NOW, limit=10, fetcher=fetch)
                first, _ = publish.prepare(store, history, folder, now=NOW)
                self.assertEqual(first['ready_count'], 1)
                initial_id = first['records'][0]['candidate_id']
                before = store.counts()['jobs']
                later = NOW + dt.timedelta(days=2)
                stale, _ = publish.prepare(store, history, folder, now=later)
                self.assertEqual(stale['ready_count'], 0)
                pilot.run(store, CONFIG, {'captures':[]}, now=later, limit=10, fetcher=fetch)
                fresh, _ = publish.prepare(store, history, folder, now=later)
            self.assertEqual(fresh['ready_count'], 1)
            self.assertEqual(fresh['records'][0]['candidate_id'], initial_id)
            self.assertEqual(fresh['records'][0]['source_published_at'], '2026-10-12T03:00:00+00:00')
            self.assertGreater(store.counts()['jobs'], before)
            self.assertEqual(len(history.inventory()), 1)
            self.assertEqual(len([row for row in store.results() if row['kind']=='page']), 2)
            store.close(); history.close()

    def test_missing_deadline_becomes_actionable_review_and_never_an_automatic_publication(self):
        with tempfile.TemporaryDirectory() as folder:
            store, history = PilotStore(Path(folder)/'pilot'), State(Path(folder)/'history.sqlite3')
            report = pilot.run(store, CONFIG, {'captures':[]}, now=NOW, limit=3,
                fetcher=lambda *a:(html(TEXT.split('Postulaciones hasta')[0]), URL, 'text/html', 200))
            self.assertEqual(report['eligible_local_notices'], 0)
            self.assertEqual(report['review_queue'][0]['review_blockers'], ['plazo_explicito_sin_confirmar'])
            self.assertTrue(report['review_queue'][0]['contact_present'])
            queue, _ = publish.prepare(store, history, folder, now=NOW)
            self.assertEqual(queue['ready_count'], 0)
            store.close(); history.close()

    def test_unattempted_sources_and_social_access_failure_are_visible(self):
        with tempfile.TemporaryDirectory() as folder:
            store = PilotStore(folder)
            social = {'key':'facebook-test', 'kind':'social', 'territory':'Renaico',
                      'url':'https://www.facebook.com/municipalidadrenaico'}
            config = {**CONFIG, 'sources':[SOURCE,social]}
            report = pilot.run(store, config, {'captures':[{'key':social['key'],
                'access':'no_readable_posts', 'posts':[]}]}, now=NOW, limit=0)
            self.assertEqual(report['source_diagnostics'][0]['last_capture_status'], 'queued')
            report = pilot.run(store, {**config, 'sources':[social]}, {'captures':[]}, now=NOW,
                limit=3, fetcher=lambda *a:(html(), URL, 'text/html', 200))
            diagnostic = report['source_diagnostics'][0]
            self.assertEqual(diagnostic['public_access'], 'no_readable_posts')
            self.assertEqual(diagnostic['dated_social_posts'], 0)
            self.assertFalse(report['difficult_source_goal_demonstrated'])
            self.assertFalse(report['collection_operating_automatically'])
            store.close()


if __name__ == '__main__':
    unittest.main()
