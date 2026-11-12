"""Do not mistake source visits or discovery for publication."""
import unittest
from motor_d_heartbeat import COMMUNES, project


def fixture():
    return {
        "date": "2026-11-11T10:25:00-03:00",
        "communes_expected": list(COMMUNES),
        "missing_communes": [],
        "sources_total": 56,
        "sources_accessible": 36,
        "sources_blocked": 13,
        "job_candidates_total": 107,
        "express_ready_candidates": 1,
    }


class TestHeartbeat(unittest.TestCase):
    def test_motor_a_handoff_http_failure_is_in_heartbeat(self):
        value = fixture()
        value["motor_a_review_handoff"]={"fetched":22,"http_200":0}
        record=project(value,"b"*64)
        self.assertEqual(record["motor_a_handoff_fetched"],22)
        self.assertEqual(record["motor_a_handoff_http_200"],0)
        self.assertTrue(record["motor_a_handoff_failed"])

    def test_motor_a_handoff_success_and_invalid_counts(self):
        value = fixture()
        value["motor_a_review_handoff"]={"fetched":22,"http_200":9}
        self.assertFalse(project(value,"b"*64)["motor_a_handoff_failed"])
        value["motor_a_review_handoff"]["http_200"]=23
        with self.assertRaises(ValueError):project(value,"b"*64)

    def test_evidenced_scan_is_not_publication(self):
        record = project(fixture(), "a" * 64)
        self.assertEqual(record["sources_accessible"], 36)
        self.assertFalse(record["publication_confirmed"])
        self.assertEqual(record["published_in_trabajo_cerca"], 0)

    def test_missing_commune(self):
        value = fixture()
        value["communes_expected"].pop()
        with self.assertRaises(ValueError): project(value, "b" * 64)

    def test_unvisited_commune(self):
        value = fixture()
        value["missing_communes"] = ["Purén"]
        with self.assertRaises(ValueError): project(value, "b" * 64)

    def test_all_sources_blocked(self):
        value = fixture()
        value["sources_accessible"] = 0
        with self.assertRaises(ValueError): project(value, "b" * 64)

    def test_timestamp_without_timezone(self):
        value = fixture()
        value["date"] = "2026-11-11T10:25:00"
        with self.assertRaises(ValueError): project(value, "b" * 64)

    def test_bad_counts(self):
        value = fixture()
        value["sources_total"] = True
        with self.assertRaises(ValueError): project(value, "b" * 64)

    def test_inconsistent_counts(self):
        value = fixture()
        value["sources_blocked"] = 40
        with self.assertRaises(ValueError): project(value, "b" * 64)


if __name__ == "__main__": unittest.main()
