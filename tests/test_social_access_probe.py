import json
import tempfile
import unittest
from pathlib import Path

from scripts.common import Budget
from scripts.public_document_http import PublicCapture, public_url
from scripts.social_access_probe import channels, inspect_channel, probe_channels, profile_validator

ROWS = [{'url': 'https://www.instagram.com/omilnacimiento/', 'territory': 'Nacimiento'},
        {'url': 'https://www.instagram.com/munilumaco/', 'territory': 'Lumaco'}]


class SocialAccessTests(unittest.TestCase):
    def test_exact_user_accounts_are_selected_and_do_not_broaden_document_publishers(self):
        self.assertEqual(len(channels()), 5)
        self.assertEqual(channels()[0]['url'], ROWS[0]['url'])
        with self.assertRaisesRegex(ValueError, 'publisher_not_allowed'):
            public_url(ROWS[0]['url'])
        validate = profile_validator(ROWS)
        for bad in ['https://www.instagram.com/unrequested/',
                    'https://m.instagram.com/omilnacimiento/',
                    'https://www.instagram.com/omilnacimiento/?access_token=secret',
                    'https://user:secret@www.instagram.com/omilnacimiento/',
                    'http://www.instagram.com/omilnacimiento/']:
            with self.assertRaises(ValueError):
                validate(bad)

    def test_disallowed_robots_downloads_no_profile_and_retains_policy_hash(self):
        calls = []
        def transport(url, budget, maximum):
            calls.append(url)
            return b'User-agent: *\nDisallow: /\n', 'text/plain', 200, None
        with tempfile.TemporaryDirectory() as folder:
            capture = PublicCapture(folder, transport, url_validator=profile_validator(ROWS))
            result = probe_channels(ROWS, capture, Budget(5))
            self.assertEqual([row['access'] for row in result], ['blocked_by_robots']*2)
            self.assertEqual(calls, ['https://www.instagram.com/robots.txt'])
            self.assertTrue((Path(folder)/'objects'/capture.requests[0]['sha256']).is_file())
            self.assertTrue(all(row['published'] == 0 and not row['coverage_complete'] for row in result))

    def test_unknown_policy_is_not_retried_for_the_other_profiles(self):
        calls = []
        def transport(url, budget, maximum):
            calls.append(url)
            return b'Too many requests', 'text/html', 429, None
        with tempfile.TemporaryDirectory() as folder:
            capture = PublicCapture(folder, transport, url_validator=profile_validator(ROWS))
            result = probe_channels(ROWS, capture, Budget(5))
            self.assertEqual([row['access'] for row in result], ['policy_unavailable']*2)
            self.assertEqual(len(calls), 1)
            self.assertEqual(result[1]['shared_origin_failure_from'], ROWS[0]['url'])

    def test_login_redirect_is_detected_before_any_login_request(self):
        calls = []
        def transport(url, budget, maximum):
            calls.append(url)
            return ((b'User-agent: *\nAllow: /\n', 'text/plain', 200, None)
                    if url.endswith('/robots.txt') else
                    (b'', 'text/html', 302, '/accounts/login/?next=profile'))
        with tempfile.TemporaryDirectory() as folder:
            capture = PublicCapture(folder, transport, url_validator=profile_validator(ROWS))
            result = inspect_channel(ROWS[0], Budget(5), capture)
            self.assertEqual(result['access'], 'login_required')
            self.assertEqual(len(calls), 2)
            self.assertFalse(any('/accounts/' in url for url in calls))

    def test_visible_post_links_are_discovery_only_and_foreign_links_are_ignored(self):
        def transport(url, budget, maximum):
            return ((b'User-agent: *\nAllow: /\n', 'text/plain', 200, None)
                    if url.endswith('/robots.txt') else
                    (b'<title>OMIL</title><a href="/p/abc/">Aviso</a>'
                     b'<a href="https://foreign.example/p/abc/">Other</a>', 'text/html', 200, None))
        with tempfile.TemporaryDirectory() as folder:
            capture = PublicCapture(folder, transport, url_validator=profile_validator(ROWS))
            result = inspect_channel(ROWS[0], Budget(5), capture)
            self.assertEqual(result['post_urls'], ['https://www.instagram.com/p/abc/'])
            self.assertEqual(result['access'], 'post_links_visible')
            self.assertEqual(result['posts_read'], 0)
            self.assertEqual(result['published'], 0)
            self.assertFalse(result['coverage_complete'])


if __name__ == '__main__':
    unittest.main()
