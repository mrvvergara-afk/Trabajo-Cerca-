import unittest
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from morning_motor_watchdog import TOWNS, assess

CL=ZoneInfo("America/Santiago")
MORNING=datetime(2026,11,13,7,50,tzinfo=CL)


def healthy_payload():
    timestamp=datetime(2026,11,13,6,40,tzinfo=CL).isoformat()
    return (
        {"scan_completed_at":timestamp,"communes_expected":sorted(TOWNS),
         "missing_communes":[],"sources_total":175,"source_inventory_registered":202,
         "sources_accessible":118,"sources_blocked":43,
         "source_inventory_pending":80,"job_candidates_total":245,
         "full_usable_coverage":False},
        {"checked_at":timestamp},
        {"checked_at":timestamp,"municipalities_attempted":sorted(TOWNS),
         "municipalities_readable":sorted(TOWNS),
         "municipalities_missing":[],"municipalities_unreadable":[],
         "local_sources_attempted":17,"chiletrabajos_queries_attempted":15,
         "job_details_checked":60,"ready_for_d_review":13,
         "source_failures":[],"coverage_complete":False},
        {"checked_at":timestamp,"feed_complete":True,
         "source_confirmed":44,"not_found":0}
    )


class MorningMotorWatchdogTests(unittest.TestCase):
    def test_all_motor_a_handoff_urls_failed_is_critical(self):
        d,a,c,p=healthy_payload()
        d["motor_a_handoff_fetched"]=22
        d["motor_a_handoff_http_200"]=0
        state=assess(d,a,c,p,MORNING)
        self.assertEqual(state["status"],"FAILED")
        self.assertIn("D_A_HANDOFF_ALL_JOB_READS_FAILED",state["execution_failures"])

    def test_partially_readable_motor_a_handoff_is_degraded_not_healthy(self):
        d,a,c,p=healthy_payload()
        d["motor_a_handoff_fetched"]=22
        d["motor_a_handoff_http_200"]=9
        state=assess(d,a,c,p,MORNING)
        self.assertEqual(state["status"],"DEGRADED")
        self.assertIn("D_A_HANDOFF_PARTIAL_JOB_READS",state["known_coverage_gaps"])

    def test_both_motors_complete_but_blocked_sources_are_degraded_not_healthy(self):
        values=healthy_payload()
        report=assess(*values,MORNING)
        self.assertEqual(report["status"],"DEGRADED")
        self.assertEqual(report["execution_failures"],[])
        self.assertEqual(report["a"]["municipalities_attempted"],12)
        self.assertEqual(report["d"]["sources_attempted"],175)
        self.assertIn("D_FULL_USABLE_COVERAGE_NOT_ACREDITED",report["known_coverage_gaps"])
        self.assertIn("A_FULL_USEFUL_COVERAGE_NOT_ACREDITED",report["known_coverage_gaps"])

    def test_missed_morning_motor_d_does_not_get_false_success(self):
        d,a,c,p=healthy_payload()
        d["scan_completed_at"]="2026-11-12T18:15:00-03:00"
        report=assess(d,a,c,p,MORNING)
        self.assertEqual(report["status"],"FAILED")
        self.assertIn("D_NO_MORNING_HEARTBEAT",report["execution_failures"])

    def test_missed_motor_a_audit_or_checkpoint_is_critical(self):
        d,a,c,p=healthy_payload()
        a["checked_at"]="2026-11-12T18:00:00-03:00"
        c["checked_at"]="2026-11-12T18:00:00-03:00"
        report=assess(d,a,c,p,MORNING)
        self.assertIn("A_NO_MORNING_CHECKPOINT",report["execution_failures"])
        self.assertIn("A_NO_MORNING_SOURCE_AUDIT",report["execution_failures"])

    def test_omitted_commune_is_critical_even_with_175_sources(self):
        d,a,c,p=healthy_payload()
        d["missing_communes"]=["Lumaco"]
        c["municipalities_attempted"].remove("Lumaco")
        result=assess(d,a,c,p,MORNING)
        self.assertIn("D_MISSING_OR_MISCONFIGURED_COMMUNES",result["execution_failures"])
        self.assertIn("A_DID_NOT_ATTEMPT_ALL_12_MUNICIPALITIES",result["execution_failures"])

    def test_unreadable_municipality_is_degraded_not_counted_as_usable(self):
        d,a,c,p=healthy_payload()
        c["municipalities_readable"].remove("Mulchén")
        c["municipalities_unreadable"]=["Mulchén"]
        result=assess(d,a,c,p,MORNING)
        self.assertEqual(result["status"],"DEGRADED")
        self.assertIn("A_MUNICIPAL_SOURCES_UNREADABLE",result["known_coverage_gaps"])

    def test_reduced_source_roster_is_critical(self):
        d,a,c,p=healthy_payload()
        d["sources_total"]=140
        c["local_sources_attempted"]=11
        c["chiletrabajos_queries_attempted"]=12
        result=assess(d,a,c,p,MORNING)
        self.assertEqual(result["status"],"FAILED")
        self.assertIn("D_SOURCE_ROSTER_INCOMPLETE",result["execution_failures"])
        self.assertIn("A_SOURCE_OR_COMMUNE_QUERY_ROSTER_INCOMPLETE",result["execution_failures"])

    def test_feed_lag_warns_without_falsely_declaring_source_scan_failed(self):
        d,a,c,p=healthy_payload()
        p["checked_at"]="2026-11-12T19:00:00-03:00"
        result=assess(d,a,c,p,MORNING)
        self.assertEqual(result["status"],"DEGRADED")
        self.assertIn("PUBLICATION_RECONCILIATION_NOT_FRESH",result["known_coverage_gaps"])

    def test_distinguishes_morning_in_santiago_from_utc_date(self):
        d,a,c,p=healthy_payload()
        # 02:30 Chile on the same local date is not the morning scan.
        d["scan_completed_at"]="2026-11-13T05:30:00+00:00"
        result=assess(d,a,c,p,MORNING)
        self.assertIn("D_NO_MORNING_HEARTBEAT",result["execution_failures"])


if __name__=="__main__":
    unittest.main()
