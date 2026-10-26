import subprocess
import unittest
from unittest.mock import patch

from scripts.social_browser_probe import inspect


class SocialBrowserProbeTests(unittest.TestCase):
    def test_login_wall_never_looks_like_a_readable_individual_notice(self):
        html = """<html><head><title>Facebook</title></head><body>
        Log into Facebook Email or mobile number Password Log in Forgot password?
        <a href="https://www.facebook.com/permalink.php?id=100072332712701&amp;story_fbid=post-1">post</a>
        </body></html>"""
        completed = subprocess.CompletedProcess(["chrome"], 0, stdout=html, stderr="")
        with patch("scripts.social_browser_probe.shutil.which", return_value="/usr/bin/chrome"), \
             patch("scripts.social_browser_probe.subprocess.run", return_value=completed):
            result = inspect({
                "url": "https://www.facebook.com/permalink.php?id=100072332712701&story_fbid=post-1",
                "territory": "Nacimiento",
            }, individual=True)
        self.assertEqual(result["access"], "login_required")
        self.assertEqual(result["reason"], "login_wall")
        self.assertFalse(result["notice_fields"]["published"])


if __name__ == "__main__":
    unittest.main()
