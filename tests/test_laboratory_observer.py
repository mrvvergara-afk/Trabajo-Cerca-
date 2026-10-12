import json
import unittest

from scripts.observe_laboratory import ProofElement, validate


class ObserverTests(unittest.TestCase):
    def test_matching_receipts_and_visible_ids_confirm_publication(self):
        report = validate({'ingestion':{'stored':2,'published':2,'feedManifestId':'manifest-one',
          'receipts':[{'publishedId':'one'},{'publishedId':'two'}]},
          'feed':{'complete':True,'manifestId':'manifest-one'},'visibleIds':['one','two']})
        self.assertTrue(report['publication_confirmed'])
        self.assertEqual(report['provider_calls'],0)

    def test_stored_items_without_complete_snapshot_remain_pending(self):
        report = validate({'ingestion':{'stored':2,'published':0,'receipts':[]},'feed':{'complete':False},'visibleIds':[]})
        self.assertFalse(report['publication_confirmed'])
        self.assertEqual(report['status'],'waiting_for_publication')

    def test_missing_ids_mismatched_snapshot_and_read_failure_never_confirm_publication(self):
        valid = {'ingestion':{'published':1,'feedManifestId':'one','receipts':[{'publishedId':'job-one'}]},
                 'feed':{'complete':True,'manifestId':'one'},'visibleIds':['job-one']}
        for item in [{**valid,'visibleIds':[]},{**valid,'feed':{'complete':False,'manifestId':'one'}},
                     {**valid,'feed':{'complete':True,'manifestId':'other'}},{**valid,'feedReadError':'unavailable'},{}]:
            with self.assertRaises(ValueError):
                validate(item)

    def test_html_parser_reads_only_the_explicit_operator_result(self):
        parser = ProofElement()
        parser.feed('<pre>unrelated</pre><pre id="radar-live-check">{&quot;ok&quot;:true}</pre>')
        self.assertEqual(json.loads(''.join(parser.parts)),{'ok':True})


if __name__ == '__main__':
    unittest.main()
