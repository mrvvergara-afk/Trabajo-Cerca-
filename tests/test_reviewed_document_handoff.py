import base64
import copy
import datetime as dt
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts import laboratory_exchange
from scripts.common import write_json
from scripts.radar_v2_store import PilotStore
from scripts.reviewed_document_handoff import restore_capture

NOW = dt.datetime(2026, 10, 18, tzinfo=dt.timezone.utc)
SOURCE = 'https://mtraiguen.cl/municipalidad/concurso/'
DOCUMENT = 'https://mtraiguen.cl/wp-content/uploads/2026/10/bases.pdf'
PUBLISHED = '2026-10-01T12:04:54+00:00'
PDF = b'%PDF-1.4\nreviewed-test-original'
HTML = ('<meta property="article:published_time" content="' + PUBLISHED + '">'
        '<h1>Bases para concurso</h1><a href="' + DOCUMENT + '">Bases</a>').encode()


class ReviewedCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        store = PilotStore(self.root / 'original')
        digest = store.put(PDF, 'application/pdf')
        store.put(HTML, 'text/html')
        manifest = store.snapshot(self.root / 'backup')
        self.review = {'source_url': SOURCE, 'document_url': DOCUMENT, 'document_sha256': digest,
                       'reviewed_at': '2026-10-17T23:26:28+00:00'}
        self.bundle = {'schema': 'trabajo-cerca.reviewed-capture-transfer.v1', **self.review,
                       'source_published_at': PUBLISHED, 'manifest': manifest,
                       'sqlite_gzip_base64': base64.b64encode((self.root / 'backup/pilot.sqlite3.gz').read_bytes()).decode(),
                       'objects_base64': {key: base64.b64encode(store.object(key).read_bytes()).decode()
                                          for key in manifest['objects'] if key != digest}}
        store.close()
        self.calls = []

    def tearDown(self):
        self.temporary.cleanup()

    def fetch(self, url, budget, **kwargs):
        self.calls.append(url)
        if url.endswith('/robots.txt'):
            return b'User-agent: *\nAllow: /\n', url, 'text/plain', 200
        if url == SOURCE:
            return HTML, url, 'text/html', 200
        return PDF, url, 'application/pdf', 200

    def restore(self, fetcher=None, bundle=None):
        return restore_capture(bundle or self.bundle, self.review, self.root / 'restored', self.root,
                               fetcher=fetcher or self.fetch, now=NOW)

    def test_exact_original_and_all_archived_objects_are_restored_without_new_capture_dates(self):
        receipt = self.restore()
        recovered = PilotStore(self.root / 'restored')
        try:
            self.assertEqual(recovered.object(self.review['document_sha256']).read_bytes(), PDF)
            self.assertEqual(recovered.counts(), self.bundle['manifest']['counts'])
            self.assertEqual(receipt['review_timestamp_preserved'], self.review['reviewed_at'])
            self.assertEqual(self.calls, [SOURCE.split('/municipalidad/')[0] + '/robots.txt', SOURCE, DOCUMENT])
        finally:
            recovered.close()

    def test_changed_pdf_is_rejected_before_restoring_any_state(self):
        def changed(url, budget, **kwargs):
            value = self.fetch(url, budget, **kwargs)
            return (PDF + b'changed', *value[1:]) if url == DOCUMENT else value
        with self.assertRaisesRegex(ValueError, 'changed_requires_review'):
            self.restore(changed)
        self.assertFalse((self.root / 'restored/pilot.sqlite3').exists())

    def test_changed_publication_date_and_explicit_closure_require_review(self):
        for body in [HTML.replace(b'2026-10-01', b'2026-10-02'), HTML + ' Postulación cerrada'.encode()]:
            def changed(url, budget, **kwargs):
                value = self.fetch(url, budget, **kwargs)
                return (body, *value[1:]) if url == SOURCE else value
            with self.assertRaisesRegex(ValueError, 'metadata_changed_requires_review'):
                self.restore(changed)
        self.assertNotIn(DOCUMENT, self.calls)

    def test_robots_rejection_stops_before_source_and_document_requests(self):
        def blocked(url, budget, **kwargs):
            self.calls.append(url)
            return b'User-agent: *\nDisallow: /\n', url, 'text/plain', 200
        with self.assertRaisesRegex(ValueError, 'robots_disallowed'):
            self.restore(blocked)
        self.assertEqual(len(self.calls), 1)

    def test_missing_or_corrupt_ocr_object_never_creates_a_restored_database(self):
        for mutation in ('missing', 'corrupt'):
            bundle = copy.deepcopy(self.bundle)
            key = next(iter(bundle['objects_base64']))
            if mutation == 'missing':
                del bundle['objects_base64'][key]
            else:
                bundle['objects_base64'][key] = base64.b64encode(b'changed').decode()
            with self.assertRaises(ValueError):
                self.restore(bundle=bundle)
            self.assertFalse((self.root / 'restored/pilot.sqlite3').exists())

    def test_signed_body_allows_exact_reviewed_branch_and_rejects_neighboring_branches(self):
        context = {'repository': laboratory_exchange.REPOSITORY, 'repository_id': laboratory_exchange.REPOSITORY_ID,
                   'ref': 'refs/heads/' + laboratory_exchange.DOCUMENT_PRODUCER_BRANCH, 'sha': 'a' * 40, 'run_id': '123'}
        queue = {'schema': 'trabajo-cerca.ingestion.v1', 'published_count': 0, 'generated_at': NOW.isoformat(), 'records': []}
        self.assertEqual(json.loads(laboratory_exchange.unsigned_body(queue, context, now=NOW))['ref'], context['ref'])
        with self.assertRaisesRegex(ValueError, 'authorized'):
            laboratory_exchange.unsigned_body(queue, {**context, 'ref': context['ref'] + '-other'}, now=NOW)


if __name__ == '__main__':
    unittest.main()
