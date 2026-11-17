#!/usr/bin/env python3
"""Regression tests for the read-only ChatGPT coverage audit."""
import importlib.util
import pathlib
import unittest

PATH = pathlib.Path(__file__).with_name("audit_chatgpt_coverage.py")
spec = importlib.util.spec_from_file_location("chatgpt_audit", PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def inventory():
    return {
        "count": 2,
        "target_communes": sorted(module.COMMUNES),
        "sources": [
            {"key": "a", "scan_wave": 0},
            {"key": "b", "scan_wave": 1},
        ],
        "discovery_targets": [{"key": "d"}],
    }

class AuditTests(unittest.TestCase):
    def test_attempt_is_not_read(self):
        report = module.audit(inventory(), {
            "sources": [
                {"source_id": "a", "scan_wave": 0, "status": "failed", "checked_at": "2026-11-17T12:00:00Z"},
                {"source_id": "b", "scan_wave": 1, "status": "checked_empty", "checked_at": "2026-11-17T16:00:00Z"},
            ],
            "discovery": [{"source_id": "d", "status": "checked_empty"}],
        })
        self.assertEqual(report["attempted"], 2)
        self.assertEqual(report["effective_reads"], 1)
        self.assertTrue(report["daily_attempt_coverage_complete"])
        self.assertFalse(report["daily_effective_coverage_complete"])

    def test_missing_discovery_is_not_complete(self):
        report = module.audit(inventory(), {"sources": [], "discovery": []})
        self.assertEqual(report["discovery_missing"], ["d"])
        self.assertFalse(report["daily_attempt_coverage_complete"])

    def test_invalid_wave_detected(self):
        report = module.audit(inventory(), {
            "sources": [{"source_id": "a", "scan_wave": 5, "status": "checked_found"}],
            "discovery": [],
        })
        self.assertIn("a", report["invalid_source_records"])

if __name__ == "__main__":
    unittest.main()
