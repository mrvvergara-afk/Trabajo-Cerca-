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
    def test_endpoint_and_discovery_cannot_share_a_key(self):
        config = inventory()
        config["discovery_targets"] = [{"key": "a"}]
        with self.assertRaisesRegex(ValueError, "duplicate_source_and_discovery_key"):
            module.audit(config, {})

    def test_heartbeat_neither_counts_as_read_nor_erases_valid_measurement(self):
        report = module.audit(inventory(), {
            "waves": {"0": {"heartbeat_at": "2026-11-26T16:00:00Z",
                            "results": [{"key": "a", "status": "not_attempted"}]}},
            "sources": [{"source_id": "a", "scan_wave": 0, "status": "checked_found",
                         "checked_at": "2026-11-26T12:00:00Z"}],
        })
        self.assertEqual(report["attempted"], 1)
        self.assertEqual(report["effective_reads"], 1)
        self.assertFalse(report["daily_effective_coverage_complete"])

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

    def test_blocked_discovery_cannot_count_as_effective_coverage(self):
        report = module.audit(inventory(), {
            "sources": [
                {"source_id": "a", "scan_wave": 0, "status": "checked_found"},
                {"source_id": "b", "scan_wave": 1, "status": "checked_empty"},
            ],
            "discovery": [{"source_id": "d", "status": "blocked"}],
        })
        self.assertTrue(report["daily_attempt_coverage_complete"])
        self.assertFalse(report["daily_effective_coverage_complete"])

    def test_missing_discovery_with_all_sources_is_safe(self):
        report = module.audit(inventory(), {
            "sources": [
                {"source_id": "a", "scan_wave": 0, "status": "checked_found"},
                {"source_id": "b", "scan_wave": 1, "status": "checked_empty"},
            ],
            "discovery": [],
        })
        self.assertFalse(report["daily_effective_coverage_complete"])

    def test_missing_discovery_is_not_complete(self):
        report = module.audit(inventory(), {"sources": [], "discovery": []})
        self.assertEqual(report["discovery_missing"], ["d"])
        self.assertFalse(report["daily_attempt_coverage_complete"])

    def test_not_attempted_does_not_count_as_complete(self):
        report = module.audit(inventory(), {
            "sources": [
                {"source_id": "a", "scan_wave": 0, "status": "not_attempted"},
                {"source_id": "b", "scan_wave": 1, "status": "checked_empty"},
            ],
            "discovery": [{"source_id": "d", "status": "checked_empty"}],
        })
        self.assertEqual(report["attempted"], 1)
        self.assertFalse(report["daily_attempt_coverage_complete"])

    def test_failure_is_recovery_candidate(self):
        report = module.audit(inventory(), {
            "sources": [{"source_id": "a", "scan_wave": 0, "status": "failed", "reason": "timeout"}],
            "discovery": [],
        })
        self.assertEqual(report["retry_candidates"][0]["source_id"], "a")
        self.assertEqual(report["retry_candidates"][0]["recovery_strategy"], "bounded_retry_then_alternative")

    def test_duplicate_discovery_retries_are_one_target(self):
        report = module.audit(inventory(), {
            "sources": [
                {"source_id": "a", "scan_wave": 0, "status": "checked_empty"},
                {"source_id": "b", "scan_wave": 1, "status": "checked_empty"},
            ],
            "discovery": [
                {"source_id": "d", "status": "failed", "checked_at": "2026-11-18T11:00:00Z"},
                {"source_id": "d", "status": "checked_found", "checked_at": "2026-11-18T12:00:00Z"},
            ],
        })
        self.assertEqual(report["discovery_records_total"], 2)
        self.assertEqual(report["discovery_recorded_unique"], 1)
        self.assertEqual(report["discovery_retry_rows"], 1)
        self.assertTrue(report["daily_attempt_coverage_complete"])
        self.assertTrue(report["daily_effective_coverage_complete"])

    def test_missing_target_stays_missing_even_with_two_other_rows(self):
        report = module.audit(inventory(), {
            "sources": [
                {"source_id": "a", "scan_wave": 0, "status": "checked_empty"},
                {"source_id": "b", "scan_wave": 1, "status": "checked_empty"},
            ],
            "discovery": [
                {"source_id": "a", "status": "checked_empty"},
                {"source_id": "a", "status": "checked_empty"},
            ],
        })
        self.assertEqual(report["discovery_recorded_unique"], 0)
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
