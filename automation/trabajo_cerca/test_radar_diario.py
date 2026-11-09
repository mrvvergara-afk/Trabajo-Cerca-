import datetime as dt
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import radar_diario


class DailyRadarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = json.loads(Path(__file__).with_name('fuentes_diarias.json').read_text(encoding='utf8'))

    def test_census_of_12_administrative_communes(self):
        self.assertEqual(len(self.config['territories']),12)
        self.assertNotIn('Quilaco',self.config['territories'])
        self.assertNotIn('Mininco',self.config['territories'])
        self.assertEqual(len(self.config['seed_urls']),39)
        self.assertGreaterEqual(len(self.config['social_reference']),26)
        self.assertEqual(len({x['id'] for x in self.config['social_reference']}),len(self.config['social_reference']))
        self.assertIn('https://www.instagram.com/omilnacimiento/',
                      {x['url'] for x in self.config['social_reference']})
        self.assertEqual(len(self.config['discovery']),23)
        self.assertEqual(len({r['id'] for r in self.config['seed_urls']}),39)

    def test_urls_canonical_keep_wordpress_identity_but_drop_tracking(self):
        self.assertEqual(radar_diario.canonical('https://www.traiguencity.cl/a/?utm_source=a'),
                         radar_diario.canonical('https://traiguencity.cl/a/'))
        self.assertNotEqual(radar_diario.canonical('https://municipalidadquilaco.cl/w/?page_id=100'),
                            radar_diario.canonical('https://municipalidadquilaco.cl/w/?page_id=200'))
        self.assertEqual(radar_diario.canonical('http://evil.test/'), '')
        self.assertEqual(radar_diario.canonical('https://trusted.test@evil.test/a'), '')

    def test_dayparts_in_santiago(self):
        zone=radar_diario.LOCAL_TIMEZONE
        self.assertEqual(radar_diario.batch_for_time(dt.datetime(2026,10,25,6,17,tzinfo=zone)),0)
        self.assertEqual(radar_diario.batch_for_time(dt.datetime(2026,10,25,12,17,tzinfo=zone)),1)
        self.assertEqual(radar_diario.batch_for_time(dt.datetime(2026,10,25,19,17,tzinfo=zone)),2)

    def test_never_approve_from_unverified_source(self):
        # Neither publication date nor job location becomes verified through a URL-only source.
        with patch.object(radar_diario,'read_feed',return_value=(set(),True,0,None)), \
             patch.object(radar_diario,'read_one',return_value={
                'url':'https://www.chiletrabajos.cl/trabajo/test-123',
                'source':'Chiletrabajos', 'decision':'candidato_para_revision',
                'publication_date_evidence':'2026-10-25'}):
            with patch.object(radar_diario,'discover',return_value={'status':'index_not_authorized_or_robots_unknown','checked':[]}):
                import tempfile
                with tempfile.TemporaryDirectory() as tmp:
                    radar_diario.main(['--config',str(Path(__file__).with_name('fuentes_diarias.json')),
                                      '--batch','0','--output',tmp])
                    report=json.loads((Path(tmp)/'resumen.json').read_text())
                    pending=json.loads((Path(tmp)/'candidatos_revision.json').read_text())
                    self.assertEqual(report['writes_to_app'],0)
                    self.assertEqual(report['published_by_this_job'],0)
                    self.assertTrue(all(not r['approved'] and not r['published'] for r in pending))
                    self.assertTrue(all(not r['original_employer_date_verified'] for r in pending))

    def test_full_sweep_visits_every_seed_and_web_source(self):
        import tempfile
        with patch.object(radar_diario, 'read_feed', return_value=(set(), True, 0, None)), \
             patch.object(radar_diario, 'read_one', return_value={'url': '', 'decision': 'sin_evidencia_suficiente'}) as reader, \
             patch.object(radar_diario, 'discover', return_value={'status': 'index_read', 'checked': []}) as discovery:
            with tempfile.TemporaryDirectory() as tmp:
                self.assertEqual(radar_diario.main(['--batch', 'all', '--output', tmp]), 0)
                report = json.loads((Path(tmp) / 'resumen.json').read_text())
                self.assertEqual(report['source_records_checked'], 62)
                self.assertEqual(reader.call_count, 39)
                self.assertEqual(discovery.call_count, 23)
                self.assertEqual(report['published_by_this_job'], 0)

    def test_radar_refreshes_durable_ocr_queue_before_merging_new_evidence(self):
        workflow = (Path(__file__).resolve().parents[2] / ".github" / "workflows" /
                    "trabajo-cerca-radar-diario.yml").read_text(encoding="utf-8")
        self.assertIn("Recuperar cola OCR vigente de main", workflow)
        self.assertLess(workflow.index("Recuperar cola OCR vigente de main"),
                        workflow.index("Integrar candidatos documentales a cola"))
        self.assertIn("git show origin/main:automation/motor_d_review/radar_ocr_pending.json", workflow)
        self.assertIn("group: trabajo-cerca-radar-gratis", workflow)

    def test_workflow_persists_queue_on_feed_outage_without_promotion(self):
        workflow = (Path(__file__).resolve().parents[2] / ".github" / "workflows" /
                    "trabajo-cerca-radar-diario.yml").read_text(encoding="utf-8")
        self.assertIn("id: radar_scan", workflow)
        self.assertIn("continue-on-error: true", workflow)
        self.assertIn("steps.radar_scan.outcome == 'success'", workflow)
        self.assertIn("steps.radar_scan.outcome == 'failure'", workflow)
        self.assertLess(workflow.index("Persistir cola y lotes"),
                        workflow.index("Marcar falla de catálogo"))
        self.assertLess(workflow.index("Marcar falla de catálogo"),
                        workflow.index("Descargar reportes y candidatos"))

    def test_partial_public_catalog_cannot_prove_offer_absent(self):
        class Response:
            headers = type('Headers', (), {'get_content_type': lambda self: 'application/json'})()
            def __init__(self, payload):
                self.payload = payload
            def __enter__(self):
                return self
            def __exit__(self, *_):
                pass
            def read(self, *_):
                return json.dumps(self.payload).encode('utf8')
        with patch.object(radar_diario, 'urlopen', return_value=Response({
                'items': [{'id':'public-1','url':'https://example.cl/oferta'}],
                'nextCursor':None,'totalJobOffers':213})):
            keys,complete,count,reason=radar_diario.read_feed()
        self.assertFalse(complete)
        self.assertEqual(keys,set())
        self.assertEqual(count,1)
        self.assertEqual(reason,'feed_incomplete')

    def test_degraded_catalog_and_invalid_cursor_never_mark_feed_complete(self):
        class Response:
            headers = type('Headers', (), {'get_content_type': lambda self: 'application/json'})()
            def __init__(self, payload):
                self.payload=payload
            def __enter__(self):
                return self
            def __exit__(self,*_):
                pass
            def read(self,*_):
                return json.dumps(self.payload).encode('utf8')
        for payload,reason in [
            ({'items':[],'feedRebuilding':True},'feed_rebuilding'),
            ({'items':[],'degraded':True},'feed_rebuilding'),
            ({'items':[],'nextCursor':{'invalid':'token'}},'feed_cursor_invalid')]:
            with self.subTest(payload=payload):
                with patch.object(radar_diario,'urlopen',return_value=Response(payload)):
                    keys,complete,count,issue=radar_diario.read_feed()
                self.assertFalse(complete)
                self.assertEqual(keys,set())
                self.assertEqual(issue,reason)

    def test_full_public_catalog_still_returns_canonical_url_keys(self):
        class Response:
            headers = type('Headers', (), {'get_content_type': lambda self: 'application/json'})()
            def __enter__(self): return self
            def __exit__(self,*_): pass
            def read(self,*_):
                return json.dumps({'items':[{'url':'https://www.chiletrabajos.cl/trabajo/3999111'}],
                                   'totalJobOffers':1}).encode('utf8')
        with patch.object(radar_diario,'urlopen',return_value=Response()):
            keys,complete,count,reason=radar_diario.read_feed()
        self.assertTrue(complete)
        self.assertEqual(count,1)
        self.assertIn('https://chiletrabajos.cl/trabajo/3999111',keys)
        self.assertIsNone(reason)

    def test_feed_failure_never_claims_job_missing(self):
        with patch.object(radar_diario, 'read_feed', return_value=(set(),False,0,'feed_http_503')), \
             patch.object(radar_diario,'read_one',return_value={
                'url':'https://www.chiletrabajos.cl/trabajo/test-123',
                'decision':'candidato_para_revision'}), \
             patch.object(radar_diario,'discover',return_value={'status':'index_read','checked':[]}):
            import tempfile
            with tempfile.TemporaryDirectory() as tmp:
                radar_diario.main(['--batch','0','--output',tmp])
                pending=json.loads((Path(tmp)/'candidatos_revision.json').read_text())
                self.assertTrue(pending)
                self.assertEqual(pending[0]['status'],'revision_y_catalogo_no_disponible')
                self.assertFalse(json.loads((Path(tmp)/'resumen.json').read_text())['feed_complete'])


if __name__=='__main__':
    unittest.main()
