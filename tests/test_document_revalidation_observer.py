import copy
import datetime as dt
import unittest

from scripts.observe_document_revalidation import EXPECTED_IDS, validate

NOW = dt.datetime(2026, 10, 18, 12, 20, tzinfo=dt.timezone.utc)


def proof():
    return {'documentRevalidation': {'schema': 'trabajo-cerca.document-revalidation-status.v1',
            'readOnly': True, 'providerCalls': 0, 'feedManifestId': 'complete-manifest', 'documents': [{
                'key': 'traiguen-salud-2026-10', 'publishedIds': sorted(EXPECTED_IDS),
                'visibleIds': sorted(EXPECTED_IDS), 'status': 'revalidated',
                'lastSuccessAt': NOW.isoformat(), 'registrationPending': False,
                'originalPublishedAt': '2026-10-01T12:04:54+00:00', 'nextCheckAt': '2026-10-19T00:20:00Z'}]},
            'feed': {'complete': True, 'manifestId': 'complete-manifest'}, 'feedReadError': None, 'visibleIds': []}


class DocumentRevalidationObserverTests(unittest.TestCase):
    def test_actual_fresh_state_and_three_saved_ids_are_confirmed_in_the_same_complete_feed(self):
        result = validate(proof(), now=NOW)
        self.assertTrue(result['actual_cron_revalidation_confirmed'])
        self.assertEqual(result['visible_count'], 3)
        self.assertEqual(result['new_offers'], 0)

    def test_pending_unavailable_or_incomplete_registration_never_counts_as_a_success(self):
        for status in ('pending', 'source_unavailable'):
            item = proof(); item['documentRevalidation']['documents'][0]['status'] = status
            self.assertIsNone(validate(item, now=NOW))
        item = proof(); item['documentRevalidation']['documents'][0]['registrationPending'] = True
        self.assertIsNone(validate(item, now=NOW))

    def test_wrong_identity_old_check_modified_date_or_paid_calls_are_rejected(self):
        for change in ('identity', 'stale', 'date', 'paid'):
            item = proof(); document = item['documentRevalidation']['documents'][0]
            if change == 'identity': document['publishedIds'][0] = 'another-id'
            if change == 'stale': document['lastSuccessAt'] = (NOW - dt.timedelta(days=2)).isoformat()
            if change == 'date': document['originalPublishedAt'] = NOW.isoformat()
            if change == 'paid': item['documentRevalidation']['providerCalls'] = 1
            with self.assertRaises(ValueError): validate(item, now=NOW)

    def test_other_feed_and_missing_visible_ids_are_not_proof_of_publication(self):
        item = proof(); item['documentRevalidation']['feedManifestId'] = 'older-feed'
        self.assertIsNone(validate(item, now=NOW))
        item['visibleIds'] = sorted(EXPECTED_IDS)
        self.assertTrue(validate(item, now=NOW)['actual_cron_revalidation_confirmed'])
        item = proof(); item['feed']['complete'] = False
        self.assertIsNone(validate(item, now=NOW))


if __name__ == '__main__':
    unittest.main()
