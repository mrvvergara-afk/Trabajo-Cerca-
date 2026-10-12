import base64
import datetime as dt
import gzip
import hashlib
import json
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from scripts import durable_backup, laboratory_exchange, prepare_laboratory_history
from scripts.state import State

NOW = dt.datetime(2026, 10, 12, 13, 0, tzinfo=dt.timezone.utc)
ITEM = {'url':'https://www.chiletrabajos.cl/trabajo/operador-prueba-1','source':'Chiletrabajos','commune_query':'Angol'}
CONTEXT = {'repository':laboratory_exchange.REPOSITORY, 'repository_id':laboratory_exchange.REPOSITORY_ID,
           'ref':'refs/heads/' + laboratory_exchange.PRODUCER_BRANCH, 'sha':'a' * 40, 'run_id':'123'}


class DurableExchangeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.state = self.root / 'state.sqlite3'
        store = State(self.state)
        store.ingest([ITEM], NOW)
        store.ingest([dict(ITEM, commune_query='Renaico')], NOW)
        store.checkpoint('source', {'next':'second-page'}, NOW)
        store.record_run({'published_count':0}, NOW)
        store.close()

    def tearDown(self):
        self.temporary.cleanup()

    def test_sqlite_snapshot_restore_preserves_all_observations_and_checkpoints(self):
        manifest = durable_backup.snapshot(self.state, self.root / 'backup')
        target = self.root / 'restored.sqlite3'
        durable_backup.restore(self.root / 'backup/radar.sqlite3.gz', self.root / 'backup/manifest.json', target)
        self.assertEqual(durable_backup.inspect(target), manifest['counts'])
        self.assertEqual(manifest['counts']['observations'], 2)
        store = State(target)
        try:
            self.assertEqual(store.checkpoints()['source']['next'], 'second-page')
            self.assertEqual(store.inventory()[0]['commune_queries'], ['Angol','Renaico'])
        finally:
            store.close()

    def test_corrupt_backup_never_creates_or_replaces_history(self):
        durable_backup.snapshot(self.state, self.root / 'backup')
        archive = self.root / 'backup/radar.sqlite3.gz'
        archive.write_bytes(archive.read_bytes() + b'corrupt')
        target = self.root / 'restore.sqlite3'
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            durable_backup.restore(archive, self.root / 'backup/manifest.json', target)
        self.assertFalse(target.exists())
        with self.assertRaisesRegex(ValueError, 'never replaces'):
            durable_backup.restore(archive, self.root / 'backup/manifest.json', self.state)
        self.assertEqual(durable_backup.inspect(self.state)['observations'], 2)

    def test_matching_byte_hash_without_expected_history_counts_is_rejected(self):
        durable_backup.snapshot(self.state, self.root / 'backup')
        manifest = self.root / 'backup/manifest.json'
        value = json.loads(manifest.read_text())
        value['counts']['observations'] = 999
        manifest.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, 'counts mismatch'):
            durable_backup.restore(self.root / 'backup/radar.sqlite3.gz', manifest, self.root / 'restore.sqlite3')

    def test_bounded_gzip_read_rejects_expansion_before_restore(self):
        archive = gzip.compress(b'x' * 200)
        backup = self.root / 'compressed.gz'
        backup.write_bytes(archive)
        manifest = self.root / 'compressed.json'
        manifest.write_text(json.dumps({'schema':'trabajo-cerca.backup.v1','archive_bytes':len(archive),
          'archive_sha256':hashlib.sha256(archive).hexdigest(),'bytes':200,'sqlite_sha256':hashlib.sha256(b'x' * 200).hexdigest()}))
        with patch.object(durable_backup, 'MAX_BACKUP_BYTES', 100):
            with self.assertRaises(ValueError):
                durable_backup.restore(backup, manifest, self.root / 'restore.sqlite3')

    def test_first_initialization_requires_available_legacy_history(self):
        with self.assertRaisesRegex(ValueError, 'No legacy archives'):
            prepare_laboratory_history.import_archives(self.root / 'none', self.root / 'new.sqlite3')
        self.assertFalse((self.root / 'new.sqlite3').exists())

    def test_legacy_archives_import_idempotently_without_trusting_verified_flags(self):
        archives = self.root / 'archives'
        archives.mkdir()
        for number in [1,2]:
            with zipfile.ZipFile(archives / f'{number}.zip', 'w') as handle:
                handle.writestr('chiletrabajos_direct.json', json.dumps({'candidates':[{**ITEM,'verified':True,'published':True}]}))
        target = self.root / 'imported.sqlite3'
        prepare_laboratory_history.import_archives(archives, target)
        store = State(target)
        try:
            self.assertEqual(len(store.inventory()), 1)
            self.assertEqual(store.inventory()[0]['state'], 'pending')
            self.assertEqual(store.connection.execute('SELECT count(*) FROM observations').fetchone()[0], 2)
            self.assertEqual(len(store.checkpoints()['legacy_artifacts_imported']['artifact_ids']), 2)
        finally:
            store.close()

    def test_unsafe_legacy_zip_path_is_rejected_without_extraction(self):
        archives = self.root / 'archives'
        archives.mkdir()
        with zipfile.ZipFile(archives / 'one.zip', 'w') as handle:
            handle.writestr('../outside.json', '{}')
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            prepare_laboratory_history.import_archives(archives, self.root / 'new.sqlite3')
        self.assertFalse((archives / 'outside.json').exists())

    def test_small_pilot_reports_pending_evidence_without_claiming_publication(self):
        collector = lambda: {'candidates':[ITEM], 'diagnostics':[]}
        checker = lambda item, **kwargs: {'status':'review_ready','reason':'deadline_missing'}
        queue, report = laboratory_exchange.pilot(self.state, self.root / 'output', now=NOW, collector=collector, checker=checker)
        self.assertEqual(report['checked'], 1)
        self.assertEqual(report['verification_reasons']['deadline_missing'], 1)
        self.assertEqual(queue['ready_count'], 0)
        self.assertFalse(report['publication_confirmed'])
        self.assertEqual(report['paid_provider_calls'], 0)

    def test_exchange_only_accepts_authorized_branch_and_recent_local_queue(self):
        queue = {'schema':'trabajo-cerca.ingestion.v1','generated_at':NOW.isoformat(),'published_count':0,'records':[]}
        raw = laboratory_exchange.unsigned_body(queue, CONTEXT, now=NOW)
        self.assertEqual(json.loads(raw)['environment'], 'laboratory')
        for context in [{**CONTEXT,'ref':'refs/heads/main'}, {**CONTEXT,'repository_id':'999'}, {**CONTEXT,'sha':'bad'}]:
            with self.assertRaises(ValueError):
                laboratory_exchange.unsigned_body(queue, context, now=NOW)
        with self.assertRaises(ValueError):
            laboratory_exchange.unsigned_body({**queue,'generated_at':(NOW - dt.timedelta(hours=2)).isoformat()}, CONTEXT, now=NOW)

    def test_proof_components_bind_the_exact_utf8_batch_bytes(self):
        raw = b'{"schema":"synthetic"}'
        envelope = laboratory_exchange.signed_envelope(raw, 'a.b.c')
        self.assertEqual(base64.b64decode(envelope['body_base64']), raw)
        self.assertEqual(envelope['proof'], {'header':'a','claims':'b','signature':'c'})
        with self.assertRaises(ValueError):
            laboratory_exchange.signed_envelope(raw, 'not-a-jwt')

    def test_confirmed_receipts_are_durable_and_do_not_disable_source_reverification(self):
        store = State(self.state)
        item = store.inventory()[0]
        result = {'status':'verified','url':ITEM['url'],'reason':'live_jobposting_with_deadline_and_application'}
        store.record_result(item,result,NOW - dt.timedelta(hours=25))
        proof = {'ingestion':{'published':1,'feedManifestId':'manifest-one','receipts':[
            {'candidateId':item['id'],'publishedId':'real-id','sourceUrl':ITEM['url']}]},
            'feed':{'complete':True,'manifestId':'manifest-one'},'visibleIds':['real-id']}
        store.record_publication_receipts(proof,NOW)
        store.record_publication_receipts(proof,NOW)
        self.assertEqual(store.connection.execute('SELECT count(*) FROM publication_receipts').fetchone()[0],1)
        self.assertEqual(store.choose(1,NOW)[0]['id'],item['id'])
        store.close()
        manifest = durable_backup.snapshot(self.state,self.root/'confirmed')
        self.assertEqual(manifest['counts']['publication_receipts'],1)

    def test_receipt_for_an_unseen_id_or_different_source_cannot_mark_publication(self):
        store = State(self.state)
        item = store.inventory()[0]
        store.record_result(item,{'status':'verified','url':ITEM['url']},NOW)
        proof = {'ingestion':{'published':1,'feedManifestId':'manifest-one','receipts':[
            {'candidateId':item['id'],'publishedId':'real-id','sourceUrl':'https://www.chiletrabajos.cl/trabajo/other'}]},
            'feed':{'complete':True,'manifestId':'manifest-one'},'visibleIds':['real-id']}
        with self.assertRaises(ValueError):
            store.record_publication_receipts(proof,NOW)
        proof['ingestion']['receipts'][0]['sourceUrl'] = ITEM['url']
        proof['visibleIds'] = []
        with self.assertRaises(ValueError):
            store.record_publication_receipts(proof,NOW)
        self.assertEqual(store.connection.execute('SELECT count(*) FROM publication_receipts').fetchone()[0],0)
        store.close()

    def test_git_data_snapshot_is_fast_forward_only_and_preserves_source_branch(self):
        repo, remote = self.root / 'repo', self.root / 'remote.git'
        subprocess.run(['git','init','-q','--bare',str(remote)],check=True)
        subprocess.run(['git','init','-q',str(repo)],check=True)
        subprocess.run(['git','remote','add','origin',str(remote)],cwd=repo,check=True)
        def local_git(*args, data=None, env=None):
            return subprocess.check_output(['git',*args],cwd=repo,input=data,env=env,stderr=subprocess.DEVNULL)
        with patch.object(laboratory_exchange,'git',local_git):
            first = laboratory_exchange.publish_git_snapshot({'state/example.json':b'{}','history/1/example.json':b'{}'}, '1')
            second = laboratory_exchange.publish_git_snapshot({'state/example.json':b'{"v":2}','history/2/example.json':b'{}'}, '2', expected_parent=first)
            self.assertEqual(local_git('rev-parse',second + '^').decode().strip(), first)
            self.assertEqual(local_git('show',second + ':history/1/example.json'), b'{}')
            self.assertFalse(subprocess.run(['git','show-ref','--verify','refs/heads/main'],cwd=remote,capture_output=True).returncode == 0)
            with self.assertRaises(subprocess.CalledProcessError):
                laboratory_exchange.publish_git_snapshot({'state/example.json':b'{}'}, '3', expected_parent=first)


if __name__ == '__main__':
    unittest.main()
