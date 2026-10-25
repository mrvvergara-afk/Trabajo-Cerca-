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

    def test_census_of_14_with_quilaco_and_mininco(self):
        self.assertEqual(len(self.config['territories']),14)
        self.assertIn('Quilaco',self.config['territories'])
        self.assertIn('Mininco',self.config['territories'])
        self.assertEqual(len(self.config['seed_urls']),40)
        self.assertEqual(len(self.config['social_reference']),25)
        self.assertEqual(len(self.config['discovery']),24)
        self.assertEqual(len({r['id'] for r in self.config['seed_urls']}),40)

    def test_urls_canonical_keep_wordpress_identity_but_drop_tracking(self):
        self.assertEqual(radar_diario.canonical('https://www.traiguencity.cl/a/?utm_source=a'),
                         radar_diario.canonical('https://traiguencity.cl/a/'))
        self.assertNotEqual(radar_diario.canonical('https://municipalidadquilaco.cl/w/?page_id=100'),
                            radar_diario.canonical('https://municipalidadquilaco.cl/w/?page_id=200'))
        self.assertEqual(radar_diario.canonical('http://evil.test/'), '')
        self.assertEqual(radar_diario.canonical('https://trusted.test@evil.test/a'), 'https://evil.test/a')

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
