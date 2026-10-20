import datetime as dt
import hashlib
import unittest
from unittest.mock import patch
from scripts.expanded_reviewed_handoff import prepare, publication_age_preserved

NOW=dt.datetime(2026,10,20,12,tzinfo=dt.timezone.utc)
URL='https://www.laborum.cl/empleos/cargo-1118466023.html'
RAW=b'<html>retained original</html>'
TARGET={'url':URL,'title':'Asesor','company':'Empresa','commune':'Angol',
 'sha256':hashlib.sha256(RAW).hexdigest(),'captured_at':'2026-10-20T11:00:00Z'}
RESULT={'status':'verified','title':'Asesor','company':'Empresa','work_commune':'Angol','source':'Laborum',
 'source_published_at':'2026-10-19T00:00:00Z','valid_through':'2026-12-20T00:00:00Z','application':URL,
 'verification_method':'Laborum individual page + matching JobPosting'}

class ExpandedHandoffTests(unittest.TestCase):
    def test_prior_incorporation_can_be_earlier_than_one_snapshot_but_never_reset_to_today(self):
        for stamp in ['2026-10-15T10:18:22.963Z','2026-10-07T12:00:00Z']:
            self.assertTrue(publication_age_preserved({'firstPublishedAt':stamp}))
        for stamp in [None,'invalid','2026-10-20T12:00:00Z']:
            self.assertFalse(publication_age_preserved({'firstPublishedAt':stamp}))

    @patch('scripts.expanded_reviewed_handoff.evaluate',return_value=RESULT)
    def test_only_exact_reviewed_fields_and_hash_prepare_an_idempotent_record(self,evaluate):
        records,skipped=prepare([TARGET],{URL:RAW},[],NOW)
        self.assertEqual(len(records),1);self.assertFalse(skipped)
        self.assertEqual(records[0]['verified_at'],TARGET['captured_at'])
        self.assertEqual(records[0]['candidate_id'],hashlib.sha256('https://www.laborum.cl/empleos/oferta-1118466023.html'.encode()).hexdigest()[:24])

    @patch('scripts.expanded_reviewed_handoff.evaluate',return_value=RESULT)
    def test_a_visible_url_variant_is_not_prepared_or_counted_as_new(self,evaluate):
        records,skipped=prepare([TARGET],{URL:RAW},[{'url':URL.replace('cargo-','otro-')}],NOW)
        self.assertFalse(records);self.assertEqual(len(skipped),1);evaluate.assert_not_called()

    def test_changed_bytes_and_expired_capture_fail_before_verification(self):
        for target,raw in [(TARGET,b'changed'),({**TARGET,'captured_at':'2026-10-18T11:00:00Z'},RAW)]:
            with self.assertRaises(ValueError):prepare([target],{URL:raw},[],NOW)

    def test_other_role_worksite_or_application_never_reaches_a_signed_queue(self):
        for changed in [{'work_commune':'Nacimiento'},{'title':'Otra oferta'},{'application':URL.replace('1118466023','1118466019')}]:
            with patch('scripts.expanded_reviewed_handoff.evaluate',return_value={**RESULT,**changed}):
                with self.assertRaises(ValueError):prepare([TARGET],{URL:RAW},[],NOW)

if __name__=='__main__':unittest.main()
