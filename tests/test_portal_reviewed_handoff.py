import copy
import datetime as dt
import hashlib
import unittest
from unittest.mock import patch
from scripts.portal_reviewed_handoff import prepare

NOW=dt.datetime(2026,10,20,9,45,tzinfo=dt.timezone.utc)
URL='https://www.laborum.cl/empleos/cajero-unimarc-1118469523.html'

class PortalHandoffTests(unittest.TestCase):
    def fixture(self):
        raw=b'<html>original public capture</html>'
        config={'pages':[{'key':'job','url':URL,'title_hint':'Cajero'}]}
        manifest={'sources':[{'url':URL,'final_url':URL,'access':'rendered','http':200,'rendered_html_sha256':hashlib.sha256(raw).hexdigest()}]}
        review={'rows':[{'source_url':URL,'captured_at':'2026-10-20T09:37:55+00:00'}]}
        result={'status':'verified','title':'Cajero','company':'Unimarc','work_commune':'Angol','application':URL,'source':'Laborum','source_published_at':'2026-10-06T00:00:00Z','valid_through':'2027-02-03T00:00:00Z','verification_method':'Laborum individual page + matching JobPosting'}
        return config,manifest,review,{'job':raw},result

    def test_rebuilt_review_preserves_editorial_and_capture_dates_without_claiming_publication(self):
        config,manifest,review,originals,result=self.fixture()
        with patch('scripts.portal_reviewed_handoff.evaluate',return_value=result):queue=prepare(config,manifest,review,originals,NOW)
        self.assertEqual(queue['published_count'],0)
        self.assertEqual(queue['records'][0]['source_published_at'],'2026-10-06T00:00:00Z')
        self.assertEqual(queue['records'][0]['verified_at'],review['rows'][0]['captured_at'])
        self.assertEqual(queue['records'][0]['application'],URL)

    def test_other_job_application_and_changed_original_never_reach_signer(self):
        config,manifest,review,originals,result=self.fixture()
        with patch('scripts.portal_reviewed_handoff.evaluate',return_value={**result,'application':URL.replace('1118469523','1118486145')}):
            with self.assertRaisesRegex(ValueError,'another_job'):prepare(config,manifest,review,originals,NOW)
        with self.assertRaisesRegex(ValueError,'hash_changed'):prepare(config,manifest,review,{'job':b'changed'},NOW)

    def test_old_capture_or_pending_date_cannot_be_freshened_by_replaying(self):
        config,manifest,review,originals,result=self.fixture()
        with self.assertRaisesRegex(ValueError,'recollection'):prepare(config,manifest,review,originals,NOW+dt.timedelta(days=2))
        with patch('scripts.portal_reviewed_handoff.evaluate',return_value={**result,'status':'pending','reason':'source_date_missing_or_future'}):
            with self.assertRaisesRegex(ValueError,'not_verified'):prepare(config,manifest,review,originals,NOW)
