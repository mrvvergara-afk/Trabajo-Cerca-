import datetime as dt
import json
import unittest
from pathlib import Path

class CandidatosReviewTests(unittest.TestCase):
    def test_9_roles_are_evidence_only_not_published(self):
        path=Path(__file__).resolve().parents[1]/'docs'/'candidatos-traiguen-para-revision-2026-10-25.json'
        data=json.loads(path.read_text())
        self.assertTrue(data['read_only'])
        self.assertEqual(data['app_writes'],0)
        self.assertEqual(data['paid_provider_calls'],0)
        items=data['items']
        self.assertEqual(len(items),9)
        self.assertEqual(len({x['id'] for x in items}),9)
        self.assertEqual(len({x['source_url'] for x in items}),4)
        for item in items:
            self.assertEqual(item['review_status'],'pendiente_verificacion_humana')
            self.assertFalse(item['published_in_trabajo_cerca'])
            self.assertIsNone(item['original_employer_publication_date'])
            self.assertEqual(item['work_location'],'Traiguén')
            self.assertTrue(item['source_url'].startswith('https://traiguencity.cl/'))
            self.assertLessEqual(dt.date.fromisoformat(item['article_published_date']),dt.date(2026,10,25))
            self.assertIn('duplicados_feed',item['required_checks'])

if __name__=='__main__':
    unittest.main()
