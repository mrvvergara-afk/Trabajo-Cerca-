import unittest
from scripts.observe_site_inventory import inventory
from scripts.observe_document_revalidation import EXPECTED_IDS


class SiteInventoryTests(unittest.TestCase):
    def test_sdk_totals_and_home_cards_are_reported_separately_without_guessing_the_drop_reason(self):
        items=[{'id':i,'kind':'job_offer','source':'Municipalidad de Traiguén'} for i in EXPECTED_IDS]
        proof={'feedReadComplete':True,'visibleItems':items,'feed':{'manifestId':'snapshot'},'feedPagesRead':1}
        home='<div class="neoHeroMeta"><b>15</b><small>oportunidades vigentes</small></div><article class="neoJobCard neoKind-job_offer"><h3>Nutricionista</h3></article><button>Cargar más</button>'
        result=inventory(proof,home)
        self.assertEqual(result['sdk_job_offers'],3)
        self.assertEqual(result['homepage_job_cards'],1)
        self.assertEqual(result['traiguen_ids_in_feed'],sorted(EXPECTED_IDS))
        self.assertTrue(result['homepage_has_load_more'])
        self.assertFalse(result['cause_of_change_confirmed'])

    def test_partial_and_failed_reads_cannot_be_called_a_complete_inventory(self):
        for proof in [{'feedReadComplete':False},{'feedReadComplete':True,'feedReadError':'offline'}]:
            with self.assertRaises(ValueError):inventory(proof,'')

    def test_repeated_ids_are_rejected(self):
        with self.assertRaises(ValueError):inventory({'feedReadComplete':True,'visibleItems':[{'id':'same'},{'id':'same'}]},'')
