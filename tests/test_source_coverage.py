"""Offline evidence, retention and fair-source regressions; no real offers written."""
import datetime as dt
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import backfill, publication_queue, radar, verify_candidates
from scripts.state import State
from tests.test_radar import ITEM, NOW, URL, job_page


class SourceCoverageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def test_verification_accepts_exactly_45_days_and_blocks_older_original_dates(self):
        edge = NOW - dt.timedelta(days=45)
        for when, expected in [(edge, 'verified'), (edge-dt.timedelta(seconds=1), 'pending')]:
            result = verify_candidates.evaluate(ITEM, job_page(datePosted=when.isoformat()), URL, now=NOW)
            self.assertEqual(result['status'], expected)
            if expected == 'pending':
                self.assertEqual(result['reason'], 'source_older_than_45_days')

    def test_queue_rechecks_age_without_erasing_verified_history_or_observations(self):
        store = State(self.root/'history.sqlite3')
        try:
            store.ingest([ITEM], NOW)
            candidate = store.choose(1, NOW)[0]
            verified = verify_candidates.evaluate(ITEM, job_page(datePosted=(NOW-dt.timedelta(days=45)).isoformat()), URL, now=NOW)
            store.record_result(candidate, verified, NOW)
            self.assertEqual(publication_queue.prepare(store, output=self.root, now=NOW)['ready_count'], 1)
            queue = publication_queue.prepare(store, output=self.root, now=NOW+dt.timedelta(seconds=1))
            self.assertEqual(queue['ready_count'], 0)
            self.assertEqual(queue['blocked'][0]['reason'], 'source_older_than_45_days')
            self.assertEqual(store.inventory()[0]['state'], 'verified')
            self.assertEqual(store.connection.execute('SELECT count(*) FROM observations').fetchone()[0], 1)
            self.assertEqual(store.connection.execute('SELECT count(*) FROM attempts').fetchone()[0], 1)
        finally:
            store.close()

    def test_queue_blocks_an_old_60_day_verification_even_with_a_fresh_recheck(self):
        store = State(self.root/'history.sqlite3')
        try:
            store.ingest([ITEM], NOW)
            candidate = store.choose(1, NOW)[0]
            result = verify_candidates.evaluate(ITEM, job_page(), URL, now=NOW)
            result['source_published_at'] = (NOW-dt.timedelta(days=50)).isoformat()
            store.record_result(candidate, result, NOW)
            self.assertEqual(publication_queue.prepare(store, output=self.root, now=NOW)['ready_count'], 0)
            self.assertEqual(len(store.inventory()), 1)
        finally:
            store.close()

    def test_backfill_lookback_cannot_exceed_45_before_any_request(self):
        calls = []
        for days in [0, 46, True]:
            with self.assertRaises(ValueError):
                backfill.run(fetcher=lambda *a, **k:calls.append(a), days=days, output=self.root)
        with patch.dict('os.environ', {'BACKFILL_DAYS':'60'}):
            with self.assertRaises(ValueError):
                backfill.run(fetcher=lambda *a, **k:calls.append(a), output=self.root)
        self.assertEqual(calls, [])

    def test_rss_filters_dates_and_queries_real_portal_domains_without_claiming_full_history(self):
        dates = ['Sat, 10 Oct 2026 12:00:00 GMT', 'Fri, 21 Aug 2026 12:00:00 GMT', 'Mon, 12 Oct 2026 12:00:00 GMT', '']
        xml = '<rss><channel>'+''.join(f'<item><title>Vacante Angol</title><link>https://example.cl/job-{i}</link><pubDate>{date}</pubDate></item>' for i,date in enumerate(dates))+'</channel></rss>'
        requests = []
        def fetcher(url, **kwargs):
            requests.append(url)
            return xml
        for runner, extra in [(radar.run, {'sources':[]}), (backfill.run, {})]:
            report = runner(fetcher=fetcher, places=['Angol'], output=self.root, now=NOW, **extra)
            self.assertEqual({item['url'] for item in report['candidates']}, {'https://example.cl/job-0','https://example.cl/job-3'})
            self.assertEqual(report['lookback_days'], 45)
        from urllib.parse import unquote
        queries = ' '.join(unquote(url) for url in requests)
        self.assertIn('when:45d', queries)
        self.assertIn('site:cl.computrabajo.com', queries)
        self.assertIn('site:opcionempleo.cl', queries)

    def test_public_registry_includes_requested_towns_and_employers_but_excludes_unconfirmed_profiles(self):
        sources = radar.configured_sources()
        names = [name for name,_ in sources]
        self.assertEqual(len(sources), 18)
        for place in ['Angol','Lumaco','Los Sauces','Traiguén','Renaico','Nacimiento','Negrete','Mulchén','Collipulli']:
            self.assertTrue(any(place in name for name in names), place)
        self.assertTrue(any('CMPC' in name for name in names))
        self.assertFalse(any('Radio Mininco' in name or 'Radio del Sur' in name for name in names))
        self.assertFalse(any('facebook.com' in url or 'instagram.com' in url for _,url in sources))

    def test_a_large_archive_gets_one_page_per_round_before_other_sources(self):
        calls = []
        def fetcher(url, **kwargs):
            calls.append(url)
            return '<a href="/page/2">Siguiente</a>' if url.endswith('/') else '<a href="/oferta-laboral">Oferta laboral</a>'
        report = radar.run(fetcher=fetcher, sources=[('A','https://a.example/'), ('B','https://b.example/')],
                           places=[], max_pages=2, output=self.root, now=NOW)
        self.assertEqual(calls[:2], ['https://a.example/','https://b.example/'])
        self.assertEqual(len(calls), 4)
        self.assertFalse(report['diagnostics'][0]['historical_coverage_verified'])

    def test_time_budget_resumes_with_the_next_source_and_preserves_archive_checkpoints(self):
        calls = []
        class OneRead:
            def __init__(self): self.initial = len(calls)
            def remaining(self): return 1 if len(calls) == self.initial else 0
        def fetcher(url, **kwargs):
            calls.append(url)
            return '<a href="/page/2">Siguiente</a>'
        options = dict(fetcher=fetcher, sources=[('A','https://a.example/'),('B','https://b.example/')], places=[],output=self.root,now=NOW)
        first = radar.run(budget=OneRead(), **options)
        second = radar.run(budget=OneRead(), checkpoints=first['checkpoints'], **options)
        self.assertEqual(calls, ['https://a.example/','https://b.example/'])
        self.assertEqual(second['checkpoints']['A']['queue'], [('https://a.example/page/2',1)])
        self.assertEqual(second['checkpoints'][radar.ROTATION_CHECKPOINT]['next_source'], 'A')

    def test_a_failed_source_keeps_its_retry_and_does_not_prevent_other_sources(self):
        calls = []
        def fetcher(url, **kwargs):
            calls.append(url)
            if 'a.example' in url: raise TimeoutError()
            return '<a href="/oferta-laboral">Oferta laboral</a>'
        report = radar.run(fetcher=fetcher, sources=[('A','https://a.example/'),('B','https://b.example/')],
                           places=[], output=self.root, now=NOW)
        self.assertEqual(calls[:2], ['https://a.example/','https://b.example/'])
        self.assertEqual(calls.count('https://a.example/'), 1)
        self.assertEqual(report['checkpoints']['A']['queue'], [('https://a.example/',0)])
        self.assertEqual(report['diagnostics'][0]['status'], 'error')
        self.assertEqual(report['candidate_count'], 1)


if __name__ == '__main__':
    unittest.main()
