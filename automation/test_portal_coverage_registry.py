import unittest
from portal_coverage_registry import COMMUNES,PORTALS,AUTHORIZATION_NEEDED,build_audit_tasks,blocked_without_authorization,classify_http,coverage_report

class PortalCoverageTests(unittest.TestCase):
 def test_twelve_communes(self):
  self.assertEqual(len(COMMUNES),12)
  self.assertNotIn("Quilaco",COMMUNES)
 def test_all_48_queries_without_guessing(self):
  self.assertEqual(len(build_audit_tasks()),48)
  self.assertEqual(len({(x["portal"],x["commune"]) for x in build_audit_tasks()}),48)
 def test_dont_bypass_indeed_and_linkedin(self):
  self.assertNotIn("indeed",PORTALS)
  self.assertNotIn("linkedin",PORTALS)
  self.assertEqual(len(blocked_without_authorization()),24)
  self.assertTrue(all(x["status"]=="requires_authorized_access" for x in blocked_without_authorization()))
 def test_blocked_not_empty(self):
  self.assertEqual(classify_http(403),"access_restricted")
  self.assertEqual(classify_http(429),"access_restricted")
  self.assertNotEqual(classify_http(403),"index_accessible_no_job_links")
 def test_catalogue_publications_never_inferred(self):
  row={"portal":"computrabajo","status":"index_links_found","unverified_links":20}
  self.assertEqual(coverage_report([row])["summary"]["computrabajo"]["confirmed_publications"],0)

if __name__=="__main__":unittest.main()
