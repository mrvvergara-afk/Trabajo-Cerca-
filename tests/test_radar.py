"""Offline regressions. Network calls fail the test; all offers are synthetic."""
import datetime as dt
import io
import json
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from scripts import apify_existing_results, apify_probe, apify_run_bounded, backfill
from scripts import chiletrabajos_direct, import_artifacts, pipeline, publication_queue, radar, verify_candidates
from scripts.common import canonical_url, communes, write_json
from scripts.state import State, choose_candidates

NOW = dt.datetime(2026, 10, 11, 22, tzinfo=dt.timezone.utc)
URL = 'https://www.chiletrabajos.cl/trabajo/operador-prueba-1'
ITEM = {'source': 'Chiletrabajos', 'url': URL, 'commune_query': 'Angol'}


def job_page(**changes):
    job = {'@type': 'JobPosting', 'url': URL, 'title': 'Operador de prueba',
           'hiringOrganization': {'name': 'Empresa ficticia para pruebas'},
           'jobLocation': {'address': {'addressLocality': 'Angol', 'addressCountry': 'CL'}},
           'datePosted': '2026-10-10T12:00:00Z', 'validThrough': '2026-10-25T23:59:00Z'}
    job.update(changes)
    return ('<html><title>Operador de prueba | Chiletrabajos</title><main>'
            '<h1>Operador de prueba</h1><p>Oferta laboral. Requisitos y jornada.</p>'
            '<a href="/postular/operador-prueba-1">Postula aquí</a></main>'
            '<script type="application/ld+json">' + json.dumps(job) + '</script></html>')


class Response(io.BytesIO):
    status = 200

    def geturl(self):
        return URL


class OfflineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.network = patch('urllib.request.urlopen', side_effect=AssertionError('Network forbidden in tests'))
        self.network.start()

    def tearDown(self):
        self.network.stop()
        self.temp.cleanup()

    def test_unicode_and_word_boundaries(self):
        self.assertEqual(communes('Vacantes en Puren, Traiguén y Los Sauces'), ['Los Sauces', 'Purén', 'Traiguén'])
        self.assertEqual(communes('Angolina y nacimiento de una empresa'), ['Nacimiento'])
        self.assertEqual(communes('Angolina'), [])

    def test_canonical_url_quotes_unicode_and_preserves_pagination(self):
        value = canonical_url('https://WWW.example.cl/CONCURSO-IMPLEMENTACIÓN.pdf?page=2&utm_source=a#top')
        self.assertEqual(value, 'https://www.example.cl/CONCURSO-IMPLEMENTACI%C3%93N.pdf?page=2')
        with self.assertRaises(ValueError):
            canonical_url('https://user:password@example.cl/job')

    def test_rss_filters_accept_actual_commune_not_literal_backslashes(self):
        rss = ('<rss><channel><item><title>Se necesita operador en Purén</title>'
               '<link>https://example.cl/oferta-1</link><pubDate>Sat, 10 Oct 2026 12:00:00 GMT</pubDate>'
               '</item></channel></rss>')
        fetcher = lambda url, **kwargs: rss
        report = radar.run(fetcher=fetcher, output=self.root, sources=[], places=['Purén'], now=NOW)
        self.assertEqual(report['candidate_count'], 1)
        report = backfill.run(fetcher=fetcher, output=self.root, places=['Purén'], now=NOW)
        self.assertEqual(report['candidate_count'], 1)
        self.assertEqual(report['candidates'][0]['published_at'], '2026-10-10T12:00:00+00:00')
        self.assertFalse(report['diagnostics'][0]['coverage_complete'])

    def test_unknown_rss_date_is_not_discovery_date(self):
        rss = '<rss><channel><item><title>Vacantes Angol</title><link>https://example.cl/job</link></item></channel></rss>'
        report = backfill.run(fetcher=lambda *a, **k: rss, output=self.root, places=['Angol'], now=NOW)
        self.assertIsNone(report['candidates'][0]['published_at'])

    def test_singular_local_offer_and_numbered_municipal_article_are_discovered(self):
        rss='<rss><channel><item><title>Oferta laboral en Angol</title><link>https://municipio.example/noticia/123</link><pubDate>Sat, 10 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'
        for runner in [radar.run,backfill.run]:
            kwargs={'sources':[]} if runner is radar.run else {}
            report=runner(fetcher=lambda *args,**kw:rss,output=self.root,places=['Angol'],now=NOW,**kwargs)
            self.assertEqual(report['candidate_count'],1)
        report=radar.run(fetcher=lambda *args,**kwargs:'<a href="/noticia/123">Oferta laboral OMIL Angol</a>',
          sources=[('OMIL Angol','https://municipio.example/')],places=[],output=self.root,now=NOW)
        self.assertEqual(report['candidates'][0]['url'],'https://municipio.example/noticia/123')

    def test_archive_pagination_resumes_and_binary_is_not_fetched(self):
        pages = {
            'https://example.cl/': '<a href="/page/2">Siguiente</a><a href="/2017/oferta-laboral">Antigua</a><a href="/oferta-laboral.pdf">PDF</a>',
            'https://example.cl/page/2': '<a href="/oferta-laboral-actual">Oferta</a>',
        }
        calls = []
        def fetcher(url, **kwargs):
            calls.append(url)
            return pages[url]
        first = radar.run(fetcher=fetcher, output=self.root, sources=[('Municipio', 'https://example.cl/')],
                          places=[], max_pages=1, now=NOW)
        self.assertFalse(first['diagnostics'][0]['coverage_complete'])
        second = radar.run(fetcher=fetcher, output=self.root, sources=[('Municipio', 'https://example.cl/')],
                           places=[], max_pages=1, checkpoints=first['checkpoints'], now=NOW)
        self.assertIn('https://example.cl/page/2', calls)
        self.assertFalse(any('/2017/' in c or c.endswith('.pdf') for c in calls))
        self.assertTrue(any(c['url'].endswith('oferta-laboral-actual') for c in second['candidates']))

    def test_chiletrabajos_dedup_preserves_all_query_hints(self):
        page = '<a href="/trabajo/operador-prueba-1#x">Operador</a>'
        result = chiletrabajos_direct.run(fetcher=lambda *a, **k: page, output=self.root,
                                          places=['Angol', 'Renaico'], now=NOW)
        self.assertEqual(result['candidate_count'], 1)
        self.assertEqual(result['candidates'][0]['commune_queries'], ['Angol', 'Renaico'])

    def test_selection_terminates_with_unknown_commune_and_zero_limit(self):
        candidates = [dict(ITEM, commune_query='Fuera del catálogo'), dict(ITEM, commune_query='')]
        self.assertEqual(len(choose_candidates(candidates, 30)), 2)
        self.assertEqual(choose_candidates(candidates, 0), [])
        with self.assertRaises(ValueError):
            choose_candidates(candidates, -1)

    def test_complete_structured_offer_can_be_verified(self):
        result = verify_candidates.evaluate(ITEM, job_page(), URL, now=NOW)
        self.assertEqual(result['status'], 'verified')
        self.assertEqual(result['work_commune'], 'Angol')
        self.assertTrue(result['application'].endswith('/postular/operador-prueba-1'))

    def test_actual_worksite_overrides_first_search_commune_hint(self):
        result = verify_candidates.evaluate(dict(ITEM, commune_query='Renaico'), job_page(), URL, now=NOW)
        self.assertEqual(result['status'], 'verified')
        self.assertEqual(result['work_commune'], 'Angol')

    def test_footer_location_and_company_address_do_not_verify_worksite(self):
        page = job_page(jobLocation={'address': {'addressLocality': 'Santiago'}})
        page += '<footer>Trabajos en Angol</footer>'
        result = verify_candidates.evaluate(ITEM, page, URL, now=NOW)
        self.assertEqual(result['status'], 'pending')
        self.assertEqual(result['reason'], 'worksite_missing_or_multiple')

    def test_other_country_and_mixed_worksites_require_review(self):
        location = {'address': {'addressLocality': 'Victoria', 'addressCountry': 'AR'}}
        self.assertEqual(verify_candidates.evaluate(ITEM, job_page(jobLocation=location), URL, now=NOW)['status'], 'pending')
        mixed = [{'address': {'addressLocality': 'Angol'}}, {'address': {'addressLocality': 'Santiago'}}]
        self.assertEqual(verify_candidates.evaluate(ITEM, job_page(jobLocation=mixed), URL, now=NOW)['status'], 'pending')

    def test_closed_and_expired_jobs_are_rejected(self):
        page = job_page() + '<main>Esta oferta ya no está disponible</main>'
        self.assertEqual(verify_candidates.evaluate(ITEM, page, URL, now=NOW)['reason'], 'closed_notice')
        result = verify_candidates.evaluate(ITEM, job_page(validThrough='2026-10-01T12:00:00Z'), URL, now=NOW)
        self.assertEqual(result['reason'], 'expired_deadline')

    def test_missing_deadline_application_and_date_cannot_auto_verify(self):
        for fields, expected in [({'validThrough': None}, 'review_ready'),
                                 ({'datePosted': None}, 'pending'),
                                 ({'datePosted': '2026-10-12T12:00:00Z'}, 'pending'),
                                 ({'hiringOrganization': {}}, 'review_ready')]:
            with self.subTest(fields=fields):
                self.assertEqual(verify_candidates.evaluate(ITEM, job_page(**fields), URL, now=NOW)['status'], expected)
        page = job_page().replace('Postula aquí', 'Inicio')
        self.assertEqual(verify_candidates.evaluate(ITEM, page, URL, now=NOW)['status'], 'review_ready')

    def test_related_jobposting_is_not_accepted_as_current_job(self):
        unrelated = job_page(url='https://www.chiletrabajos.cl/trabajo/otro-1', title='Otro cargo')
        self.assertEqual(verify_candidates.evaluate(ITEM, unrelated, URL, now=NOW)['status'], 'pending')
        identical_title = job_page(url='https://www.chiletrabajos.cl/trabajo/otro-1')
        self.assertEqual(verify_candidates.evaluate(ITEM, identical_title, URL, now=NOW)['status'], 'pending')

    def test_redirect_to_another_job_requires_review(self):
        other_url = 'https://www.chiletrabajos.cl/trabajo/otro-1'
        result = verify_candidates.evaluate(ITEM, job_page(url=other_url), other_url, now=NOW)
        self.assertEqual(result['reason'], 'redirected_to_other_job')

    def test_scripts_cannot_inject_closed_notice_into_visible_text(self):
        page = job_page() + '<script>const labels = "oferta cerrada";</script>'
        self.assertEqual(verify_candidates.evaluate(ITEM, page, URL, now=NOW)['status'], 'verified')

    def test_redirect_guard_rejects_before_fetching_other_host(self):
        request = __import__('urllib.request', fromlist=['Request']).Request(URL)
        with self.assertRaisesRegex(ValueError, 'redirected_outside_job'):
            verify_candidates.JobRedirectGuard().redirect_request(
                request, None, 302, 'Found', {}, 'https://other.example/jobs')

    def test_http_403_and_missing_sources_are_not_verified(self):
        self.assertEqual(verify_candidates.evaluate(ITEM, '', URL, status=403, now=NOW)['status'], 'pending')
        self.assertEqual(verify_candidates.evaluate(ITEM, '', URL, status=404, now=NOW)['status'], 'rejected')
        opener = lambda *a, **k: Response(job_page().encode())
        self.assertEqual(verify_candidates.check(ITEM, opener=opener, now=NOW)['status'], 'verified')
        self.assertEqual(verify_candidates.check({'url': 'https://www.instagram.com/p/test/'}, now=NOW)['reason'],
                         'source_adapter_not_implemented')

    def test_verifier_aggregates_all_collector_files_and_counts_verified(self):
        write_json(self.root / 'report.json', {'candidates': [{'url': 'https://municipio.example/omil'}]})
        write_json(self.root / 'chiletrabajos_direct.json', {'candidates': [ITEM]})
        checker = lambda item, **kwargs: verify_candidates.evaluate(item, job_page(), item['url'], now=NOW) if verify_candidates.supported_url(item['url']) else {'status': 'pending', 'reason': 'source_adapter_not_implemented'}
        report = verify_candidates.run(output=self.root, checker=checker, now=NOW)
        self.assertEqual(report['source_candidates'], 2)
        self.assertEqual(report['verified'], 1)
        self.assertEqual(report['published'], 0)

    def test_state_survives_empty_runs_reopen_and_keeps_observations(self):
        path = self.root / 'state.sqlite3'
        store = State(path)
        self.assertEqual(store.ingest([ITEM], NOW), 1)
        self.assertEqual(store.ingest([dict(ITEM, commune_query='Renaico')], NOW), 0)
        store.ingest([], NOW)
        store.close()
        store = State(path)
        try:
            self.assertEqual(len(store.inventory()), 1)
            self.assertEqual(store.inventory()[0]['commune_queries'], ['Angol', 'Renaico'])
            self.assertEqual(store.connection.execute('SELECT count(*) FROM observations').fetchone()[0], 2)
        finally:
            store.close()

    def test_small_verification_limit_advances_instead_of_repeating_first_candidates(self):
        store = State(self.root / 'state.sqlite3')
        try:
            items = [dict(ITEM, url=URL + str(i), commune_query=p) for i, p in enumerate(['Angol', 'Renaico', 'Angol'])]
            store.ingest(items, NOW)
            seen = []
            for turn in range(3):
                chosen = store.choose(1, NOW + dt.timedelta(minutes=turn))
                seen.append(chosen[0]['id'])
                store.record_result(chosen[0], {'status': 'pending', 'reason': 'test'}, NOW + dt.timedelta(minutes=turn))
            self.assertEqual(len(set(seen)), 3)
            oldest = store.choose(1, NOW + dt.timedelta(hours=1))[0]
            self.assertEqual(oldest['id'], seen[0])
        finally:
            store.close()

    def test_full_pipeline_queue_is_idempotent_and_never_publishes(self):
        path = self.root / 'state.sqlite3'
        collector = lambda: {'candidates': [ITEM], 'diagnostics': [{'status': 'ok'}]}
        checker = lambda item, **kwargs: verify_candidates.evaluate(item, job_page(), URL, now=NOW)
        first = pipeline.run(output=self.root, state_path=path, collectors=[('synthetic', collector)],
                             checker=checker, now=NOW)
        queue = json.loads((self.root / 'publication_queue.json').read_text())
        self.assertEqual(first['verification']['verified'], 1)
        self.assertEqual(queue['ready_count'], 1)
        self.assertTrue(queue['dry_run'])
        second = pipeline.run(output=self.root, state_path=path, collectors=[('empty', lambda: {'candidates': []})],
                              checker=checker, now=NOW)
        second_queue = json.loads((self.root / 'publication_queue.json').read_text())
        self.assertEqual(first['published_count'], 0)
        self.assertEqual(second['inventory_count'], 1)
        self.assertEqual(second_queue['records'][0]['idempotency_key'], queue['records'][0]['idempotency_key'])

    def test_collector_failure_preserves_inventory_and_fails_all_sources_down(self):
        path = self.root / 'state.sqlite3'
        store = State(path)
        store.ingest([ITEM], NOW)
        store.close()
        def failed():
            raise urllib.error.HTTPError('https://example.cl', 403, 'Blocked', {}, None)
        result = pipeline.run(output=self.root, state_path=path, collectors=[('failed', failed)], limit=0, now=NOW)
        self.assertEqual(result['inventory_count'], 1)
        self.assertEqual(result['exit_code'], 1)
        self.assertEqual(result['stages'][0]['reason'], 'HTTP 403')

    def test_expired_queue_is_blocked_and_verification_rechecks_after_24_hours(self):
        store = State(self.root / 'state.sqlite3')
        try:
            store.ingest([ITEM], NOW)
            item = store.choose(1, NOW)[0]
            store.record_result(item, verify_candidates.evaluate(item, job_page(), URL, now=NOW), NOW)
            later = NOW + dt.timedelta(hours=25)
            self.assertEqual(publication_queue.prepare(store, output=self.root, now=later)['ready_count'], 0)
            self.assertEqual(store.choose(1, later)[0]['id'], item['id'])
            self.assertEqual(len(store.inventory()), 1)
        finally:
            store.close()

    def test_atomic_json_failure_keeps_previous_report(self):
        path = self.root / 'report.json'
        write_json(path, {'historical': True})
        with patch('scripts.common.os.replace', side_effect=OSError('simulated storage failure')):
            with self.assertRaises(OSError):
                write_json(path, {'historical': False})
        self.assertTrue(json.loads(path.read_text())['historical'])

    def test_invalid_limits_fail_before_collectors_or_network(self):
        calls = []
        with patch.dict(os.environ, {'VERIFY_LIMIT': '-1'}):
            with self.assertRaises(ValueError):
                pipeline.run(output=self.root, state_path=self.root / 'state.sqlite3',
                             collectors=[('should not run', lambda: calls.append(True))], now=NOW)
        self.assertEqual(calls, [])

    def test_historical_import_is_idempotent_and_does_not_trust_verified_flags(self):
        historical = dict(ITEM, status='published', verified=True)
        write_json(self.root / 'report.json', {'candidates': [historical]})
        path = self.root / 'state.sqlite3'
        first = import_artifacts.import_reports(self.root, path, now=NOW)
        second = import_artifacts.import_reports(self.root, path, now=NOW)
        self.assertEqual(first['new_candidates'], 1)
        self.assertEqual(second['new_candidates'], 0)
        store = State(path)
        try:
            self.assertEqual(store.inventory()[0]['state'], 'pending')
            self.assertEqual(publication_queue.prepare(store, output=self.root, now=NOW)['ready_count'], 0)
        finally:
            store.close()

    def test_expired_budget_does_not_make_any_http_request(self):
        from scripts.common import Budget
        from scripts.verify_candidates import check
        result = check(ITEM, budget=Budget(0), now=NOW)
        self.assertEqual(result['reason'], 'stage_budget_exhausted')
        report = apify_probe.run(output=self.root, token='synthetic-test-token', budget=Budget(0))
        self.assertEqual(report['error'], 'TimeoutError')

    def test_apify_probe_respects_configured_actor_and_redacts_errors(self):
        calls = []
        def opener(request, **kwargs):
            calls.append((request.get_method(), request.full_url))
            return Response(b'{"data":{"name":"custom-actor"}}')
        report = apify_probe.run(output=self.root, token='synthetic-test-token',
                                actor='test~custom-actor', opener=opener)
        self.assertTrue(report['actor_accessible'])
        self.assertIn('/acts/test~custom-actor', calls[1][1])
        self.assertNotIn('synthetic-test-token', json.dumps(report))
        def failed(*a, **k):
            raise RuntimeError('synthetic-test-token')
        report = apify_probe.run(output=self.root, token='synthetic-test-token', opener=failed)
        self.assertEqual(report['error'], 'RuntimeError')

    def test_apify_existing_reads_only_and_preserves_shortcode_posts(self):
        calls = []
        def opener(request, **kwargs):
            calls.append((request.get_method(), request.full_url))
            data = {'data': {'items': [{'status': 'SUCCEEDED', 'defaultDatasetId': 'data1', 'id': 'run1'}]}} if '/runs?' in request.full_url else [{'caption': 'Se necesita operador Angol', 'shortCode': 'abc_123'}]
            return Response(json.dumps(data).encode())
        report = apify_existing_results.run(output=self.root, token='synthetic-test-token', opener=opener)
        self.assertEqual(report['candidate_count'], 1)
        self.assertEqual(report['candidates'][0]['url'], 'https://www.instagram.com/p/abc_123/')
        self.assertEqual(report['new_actor_runs_started'], 0)
        self.assertTrue(all(method == 'GET' for method, url in calls))

    def test_apify_flag_never_starts_paid_actor(self):
        for enabled in ('true', 'false'):
            with patch.dict(os.environ, {'APIFY_RUN_ENABLED': enabled}):
                self.assertEqual(apify_run_bounded.run(output=self.root)['actor_runs_started'], 0)


if __name__ == '__main__':
    unittest.main()
