"""Contract tests for Motor D source-coverage accounting."""
import unittest
from audit_motor_d_coverage import audit, COMMUNES

def fixture():
    return {"run_date":"2026-11-11","communes":[{"commune":name,"planned_sources":1,"visited_sources":1,"blocked_sources":0,"unvisited_sources":0,"sources":[{"url":"https://example.org/"+str(i),"category":"municipal","status":"visited","checked_at":"2026-11-11T10:00:00Z","result":"no_offers"}]} for i,name in enumerate(COMMUNES)]}

class CoverageTests(unittest.TestCase):
    def test_complete_evidenced_territory(self):
        result=audit(fixture())
        self.assertTrue(result["ok"],result)
        self.assertTrue(result["exhaustive"])
        self.assertEqual(result["visited"],12)
    def test_missing_commune_fails(self):
        value=fixture();value["communes"].pop()
        self.assertFalse(audit(value)["ok"])
    def test_fake_visit_without_evidence_fails(self):
        value=fixture();value["communes"][0]["sources"][0].pop("checked_at")
        self.assertFalse(audit(value)["ok"])
    def test_blocked_source_is_not_visited(self):
        value=fixture();row=value["communes"][0];row["sources"][0]["status"]="blocked";row["visited_sources"]=0;row["blocked_sources"]=1
        result=audit(value)
        self.assertTrue(result["ok"],result)
        self.assertFalse(result["exhaustive"])
        self.assertEqual(result["visited"],11)
    def test_missing_source_cannot_be_marked_exhaustive(self):
        value=fixture();row=value["communes"][0];row["sources"][0]["status"]="unvisited";row["visited_sources"]=0;row["unvisited_sources"]=1
        self.assertFalse(audit(value)["exhaustive"])
    def test_counts_must_match_evidence(self):
        value=fixture();value["communes"][0]["visited_sources"]=99
        self.assertFalse(audit(value)["ok"])

if __name__=="__main__": unittest.main()
