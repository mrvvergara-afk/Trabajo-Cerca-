import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from schedule_watchdog import assess  # noqa: E402


class WatchdogTests(unittest.TestCase):
    def test_fresh_heartbeat(self):
        result = assess({"scan_completed_at": "2026-11-12T15:22:44-03:00"}, 
                        datetime(2026, 11, 12, 19, 0, tzinfo=timezone.utc))
        self.assertEqual(result["status"], "OK")
        self.assertEqual(result["action"], "none")

    def test_stale_and_missing(self):
        now = datetime(2026, 11, 13, 0, 30, tzinfo=timezone.utc)
        stale = assess({"scan_completed_at": "2026-11-12T15:22:44-03:00"}, now)
        self.assertEqual(stale["status"], "STALE")
        self.assertEqual(stale["action"], "dispatch_motor_d")
        self.assertEqual(assess({}, now)["status"], "STALE")

    def test_naive_timestamp_is_not_accepted_as_proof(self):
        result = assess({"scan_completed_at": "2026-11-12T15:22:44"},
                        datetime(2026, 11, 12, 19, 0, tzinfo=timezone.utc))
        self.assertEqual(result["status"], "STALE")


if __name__ == "__main__":
    unittest.main()