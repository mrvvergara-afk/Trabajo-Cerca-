import datetime as dt
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts import radar_v2_pilot, radar_v2_publish
from scripts.common import Budget
from scripts.radar_v2_store import PilotStore
from scripts.state import State

NOW = dt.datetime(2026, 10, 14, 14, tzinfo=dt.timezone.utc)
URL = 'https://www.bne.gob.cl/oferta/2026-109726'
CONFIG = {'sources':[], 'territories':['Renaico', 'Negrete'],
          'paid_providers_enabled':False, 'publish_enabled':False}


def official_page(posted='15/09/2026'):
    return ('<title>Bolsa Nacional de Empleo</title>'
            '<h1><span id="nombreOferta"><span>Cajeros/as peaje Negrete (20 vacantes)</span><small>Cajeros (as)</small></h1>'
            '<article><h3>DATOS DE CONTACTO</h3><strong><span>Empresa:</span></strong><br><span>Empresa de prueba SPA</span>'
            '<h3>DESCRIPCIÓN</h3><p>Oferta laboral para atención a clientes</p><div>Bío Bío, Negrete</div>'
            '<i class="fa fa-calendar"></i><span>' + posted + '</span> - '
            '<i class="fa fa-calendar"></i><span>17/11/2026</span>'
            '<p>Origen de la Oferta: WEB</p><a class="btn btn-primary" href="/registro?redireccion=ofertas">Postular</a></article>')


def capture(pilot, *, url=URL, now=NOW, posted='15/09/2026'):
    source = {'key':'control', 'kind':'web', 'family':'official', 'scope':'publication_control'}
    pilot.seed('web', url + ':control', {'url':url, 'source':source, 'page_type':'notice'}, now)
    return radar_v2_pilot.run(pilot, CONFIG, {'captures':[]}, now=now, limit=1, budget=Budget(15),
        fetcher=lambda *args:(official_page(posted).encode(), url, 'text/html', 200))


class PilotPublicationTests(unittest.TestCase):
    def test_original_control_reaches_the_existing_validator_and_replay_keeps_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            pilot, history = PilotStore(root / 'pilot'), State(root / 'history.sqlite3')
            metrics = capture(pilot)
            self.assertEqual(metrics['eligible_local_notices'], 0)
            self.assertEqual(metrics['eligible_official_controls'], 1)
            queue, report = radar_v2_publish.prepare(pilot, history, root, now=NOW)
            self.assertEqual(queue['ready_count'], 1)
            offer = queue['records'][0]
            code = """
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
const offer = JSON.parse(readFileSync(0, 'utf8'));
ctx.validateOffer(offer, Date.parse('2026-10-14T14:00:00Z'));
"""
            checked = subprocess.run(['node', '--input-type=module', '-e', code],
                input=json.dumps(offer), capture_output=True, text=True, timeout=8)
            self.assertEqual(checked.returncode, 0, checked.stderr)
            again, _ = radar_v2_publish.prepare(pilot, history, root, now=NOW)
            self.assertEqual(again['records'][0]['candidate_id'], offer['candidate_id'])
            self.assertEqual(history.connection.execute('SELECT count(*) FROM attempts').fetchone()[0], 1)
            self.assertEqual(report['published'], 0)
            pilot.close(); history.close()

    def test_a_persisted_verified_flag_cannot_override_an_original_without_a_date(self):
        with tempfile.TemporaryDirectory() as folder:
            pilot, history = PilotStore(Path(folder) / 'pilot'), State(Path(folder) / 'history.sqlite3')
            capture(pilot, posted='')
            row = pilot.results()[0]
            forged = {**row['result'], 'status':'verified', 'source_published_at':NOW.isoformat()}
            with pilot.connection:
                pilot.connection.execute('UPDATE jobs SET result=? WHERE id=?', (json.dumps(forged), row['id']))
            queue, _ = radar_v2_publish.prepare(pilot, history, folder, now=NOW)
            self.assertEqual(queue['ready_count'], 0)
            self.assertEqual(history.inventory(), [])
            self.assertEqual(pilot.counts()['jobs'], 1)
            pilot.close(); history.close()

    def test_old_capture_never_gets_a_fresh_verification_date_or_erases_history(self):
        with tempfile.TemporaryDirectory() as folder:
            pilot, history = PilotStore(Path(folder) / 'pilot'), State(Path(folder) / 'history.sqlite3')
            capture(pilot, now=NOW - dt.timedelta(days=2))
            history.ingest([{'url':'https://municipalidadrenaico.cl/aviso-historico'}], NOW - dt.timedelta(days=60))
            before = history.inventory()
            queue, report = radar_v2_publish.prepare(pilot, history, folder, now=NOW)
            self.assertEqual(queue['ready_count'], 0)
            self.assertEqual(report['blocked'][0]['reason'], 'pilot_evidence_requires_recollection')
            self.assertEqual(history.inventory(), before)
            pilot.close(); history.close()

    def test_an_unsupported_control_never_makes_a_network_request(self):
        with tempfile.TemporaryDirectory() as folder:
            pilot = PilotStore(folder)
            with self.assertRaisesRegex(ValueError, 'unsupported_official_control'):
                radar_v2_pilot.web_work(pilot,
                    {'url':'https://unknown.example/job', 'page_type':'notice',
                     'source':{'key':'control', 'family':'official', 'scope':'publication_control'}},
                    Budget(5), lambda *args:self.fail('no request'), NOW)
            pilot.close()

    def test_three_offer_bound_preserves_all_verified_work_in_both_histories(self):
        with tempfile.TemporaryDirectory() as folder:
            pilot, history = PilotStore(Path(folder) / 'pilot'), State(Path(folder) / 'history.sqlite3')
            for number in range(4):
                capture(pilot, url=URL[:-6] + str(109726 + number))
            queue, report = radar_v2_publish.prepare(pilot, history, folder, now=NOW)
            self.assertEqual(queue['ready_count'], 3)
            self.assertEqual(len(history.inventory()), 4)
            self.assertEqual(pilot.counts()['jobs'], 4)
            self.assertEqual(report['pilot_verified_candidates'], 4)
            pilot.close(); history.close()

    def test_only_the_new_batch_with_matching_sources_and_visible_ids_is_confirmed(self):
        identity = 'a' * 24
        proof = {'ingestion':{'runId':'100', 'stored':1, 'published':1, 'feedManifestId':'manifest',
                             'receipts':[{'candidateId':identity, 'sourceUrl':URL, 'publishedId':'live-id'}]},
                 'feed':{'complete':True, 'manifestId':'manifest'}, 'visibleIds':['live-id']}
        records = [{'candidate_id':identity, 'source_url':URL}]
        self.assertIsNone(radar_v2_publish.matching_publication(proof, {'run_id':'101'}, records))
        self.assertEqual(radar_v2_publish.matching_publication(proof, {'run_id':'100'}, records)['published_ids'], ['live-id'])
        proof['ingestion']['receipts'][0]['sourceUrl'] = URL[:-6] + '109727'
        with self.assertRaisesRegex(ValueError, 'publication_receipts_differ_from_handoff'):
            radar_v2_publish.matching_publication(proof, {'run_id':'100'}, records)
        proof['ingestion']['receipts'][0]['sourceUrl'] = URL
        proof['visibleIds'] = []
        with self.assertRaises(ValueError):
            radar_v2_publish.matching_publication(proof, {'run_id':'100'}, records)


if __name__ == '__main__':
    unittest.main()
