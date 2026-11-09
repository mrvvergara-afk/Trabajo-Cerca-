"""Regression: high-priority OMIL Nacimiento social access is not a fake empty job feed."""
import ast
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit

from motor_d_social_sources import SOURCES
import motor_d_social_access_probe as probe


class NacimientoSocialCoverageTests(unittest.TestCase):
    def test_both_official_nacimiento_social_sources_are_checked_first(self):
        self.assertEqual([s["name"] for s in SOURCES[:2]],
                         ["OMIL Nacimiento Facebook",
                          "Municipalidad Nacimiento Facebook"])
        self.assertTrue(all(s["commune"] == "Nacimiento"
                            and s["priority"] == "critical" for s in SOURCES[:2]))
        self.assertTrue(all(s["url"].startswith("https://www.facebook.com/")
                            for s in SOURCES[:2]))
        self.assertTrue(all(x["commune"] != "Quilaco" for x in SOURCES))

    def test_all_sources_are_public_profile_urls_without_credentials(self):
        urls=[s["url"] for s in SOURCES]
        self.assertEqual(len(urls),len(set(urls)))
        for item in SOURCES:
            value=urlsplit(item["url"])
            self.assertEqual(value.scheme,"https")
            self.assertIn(value.hostname,("www.facebook.com","www.instagram.com"))
            self.assertIsNone(value.username)
            self.assertIsNone(value.password)
            self.assertIn(item["priority"],("normal","critical"))

    def test_probe_does_not_claim_zero_vacancies_when_robots_disallows_access(self):
        source=SOURCES[0]
        with patch.object(probe,"read",return_value=(200,"text/plain",b"User-agent: *\\nDisallow: /\\n")) as network:
            result=probe.inspect(source)
        self.assertEqual(result["source"],"OMIL Nacimiento Facebook")
        self.assertEqual(result["commune"],"Nacimiento")
        self.assertEqual(result["status"],"robots_disallowed")
        self.assertEqual(result["posts_discovered"],0)
        self.assertEqual(result["jobs_extracted"],0)
        self.assertEqual(network.call_count,1)

    def test_browser_keeps_explicit_read_failure_and_never_auto_publishes(self):
        path=Path(__file__).resolve().parent/"motor_d_social_browser.py"
        code=path.read_text(encoding="utf-8")
        ast.parse(code)
        self.assertIn("from motor_d_social_sources import SOURCES",code)
        self.assertIn("blocked_by_robots_or_unavailable",code)
        self.assertIn("unread_sources_are_not_zero_vacancies",code)
        self.assertIn('"automatic_publications":0',code)

    def test_probe_and_browser_share_same_source_registry(self):
        self.assertIs(probe.SOURCES,SOURCES)
        browser=(Path(__file__).resolve().parent/"motor_d_social_browser.py").read_text()
        self.assertIn("from motor_d_social_sources import SOURCES",browser)


if __name__ == "__main__":
    unittest.main()
