import datetime as dt
import tempfile
import unittest
from pathlib import Path
from scripts.state import State
from scripts.document_cycle import delivery_batch
from scripts.curated_public_cycle import merge_batch

class ClosureDeliveryTests(unittest.TestCase):
    def test_signed_delivery_moves_past_old_batches_without_claiming_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            store=State(Path(directory)/'state.sqlite3')
            rows=[{'candidate_id':str(i),'source_url':'https://example.invalid/'+str(i)} for i in range(7)]
            now=dt.datetime(2026,10,25,tzinfo=dt.timezone.utc)
            first=delivery_batch(store,{'records':rows,'published_count':0},now)
            second=delivery_batch(store,{'records':rows,'published_count':0},now+dt.timedelta(hours=1))
            third=delivery_batch(store,{'records':rows,'published_count':0},now+dt.timedelta(hours=2))
            self.assertEqual(len(first['records']),3)
            self.assertEqual(len(set(row['candidate_id'] for row in first['records']+second['records']+third['records'])),7)
            self.assertEqual(third['published_count'],0)
            store.close()

    def test_three_distinct_jobs_in_one_official_document_are_not_collapsed_by_url(self):
        url='https://www.munilumaco.cl/empleo.pdf'
        rows=[{'source_url':url,'document_unit':{'key':str(i)*64}} for i in range(1,4)]
        self.assertEqual(merge_batch({'records':rows},[])['ready_count'],3)

if __name__=='__main__':unittest.main()
