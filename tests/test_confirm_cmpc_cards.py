import copy
import unittest
from scripts.confirm_cmpc_cards import confirm
from scripts.cmpc_reviewed_handoff import ROLES
from scripts.observe_document_revalidation import EXPECTED_IDS


class VisibleCmpcTests(unittest.TestCase):
    def setUp(self):
        titles=[role[0] for role in ROLES.values()]
        self.delivery={'published':2,'confirmation':{'published_ids':['new-one','new-two']}}
        items=[{'id':key,'title':'Traiguén'} for key in EXPECTED_IDS]+[{'id':key,'title':title} for key,title in zip(['new-one','new-two'],titles)]
        self.inventory={'feed_read_complete':True,'visible_items':items,'homepage_cards':[{'title':title} for title in titles],
                        'sdk_job_offers':5,'homepage_job_cards':2,'feed_manifest':'after','checked_at':'2026-10-19T23:55:00Z'}
        self.baseline={'feed_manifest':'before','visible_items':items[:3]}

    def test_only_signed_new_ids_visible_in_complete_feed_and_cards_count_as_two(self):
        result=confirm(self.delivery,self.inventory,self.baseline)
        self.assertEqual(result['published_new_difficult_offers'],2)
        self.assertEqual(result['added_ids_since_baseline'],['new-one','new-two'])
        self.assertFalse(result['expiry_inferred'])

    def test_receipts_without_cards_or_with_incomplete_feed_do_not_prove_visible_publication(self):
        for field,value in [('feed_read_complete',False),('homepage_cards',[]),('visible_items',[])]:
            inventory=copy.deepcopy(self.inventory);inventory[field]=value
            with self.assertRaises(ValueError):confirm(self.delivery,inventory,self.baseline)

    def test_revalidation_of_a_known_id_is_not_a_new_offer(self):
        self.baseline['visible_items'].append(self.inventory['visible_items'][-1])
        with self.assertRaisesRegex(ValueError,'existing_records_not_new'):confirm(self.delivery,self.inventory,self.baseline)
