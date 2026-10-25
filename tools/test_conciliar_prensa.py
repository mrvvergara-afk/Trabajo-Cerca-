import unittest
from conciliar_prensa_local import merge_reports
class ConciliarTest(unittest.TestCase):
    def test_deduplicates_same_article_seen_on_two_indices(self):
        source={'results':[{'checked':[{'url':'https://traiguencity.cl/un-aviso/','decision':'candidato_para_revision','publication_date_evidence':'2026-10-23'}]}]}
        another={'results':[{'url':'https://www.traiguencity.cl/un-aviso/?utm_source=test','decision':'candidato_para_revision','publication_date_evidence':'2026-10-23'}]}
        result=merge_reports(source,another)
        self.assertEqual(result['source_rows_seen'],2)
        self.assertEqual(result['unique_source_documents'],1)
        self.assertEqual(result['unique_candidates_for_review'],1)
        self.assertEqual(result['app_writes'],0)
        self.assertFalse(result['items'][0]['published'])
if __name__=='__main__':
    unittest.main()
