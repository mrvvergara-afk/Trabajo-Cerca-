import unittest
from portal_individual_evidence import territory,read_individual_evidence

def html(title="Cajero/a Angol",company="Ejemplo S.A.",city="Angol",
 dateposted="2026-11-06",valid_through=None, extra=""):
 import json
 job={"@context":"https://schema.org","@type":"JobPosting","title":title,
      "hiringOrganization":{"@type":"Organization","name":company},
      "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress",
       "addressLocality":city,"addressCountry":"CL"}},
      "datePosted":dateposted}
 if valid_through is not None:job["validThrough"]=valid_through
 return '<html><script type="application/ld+json">'+json.dumps(job,ensure_ascii=False)+'</script><body>'+extra+'</body></html>'

class PortalIndividualEvidenceTests(unittest.TestCase):
 def test_valid_specific_job_only_candidate_not_published(self):
  from datetime import date
  result=read_individual_evidence("computrabajo","https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-cajero-en-angol",html(),date(2026,11,6))
  self.assertEqual(result["status"],"ready_for_catalog_crosscheck")
  self.assertEqual(result["work_commune"],"Angol")
  self.assertFalse(result["verified_publication"])
 def test_mininco_and_coihue_mapped(self):
  self.assertEqual(territory("Mininco"),"Collipulli")
  self.assertEqual(territory("Coihue"),"Negrete")
  self.assertIsNone(territory("Quilaco"))
 def test_wrong_territory_not_ready(self):
  from datetime import date
  result=read_individual_evidence("computrabajo","https://cl.computrabajo.com",html(city="Santiago"),date(2026,11,6))
  self.assertEqual(result["status"],"review_required")
 def test_explicit_expiry_overrides_recent(self):
  from datetime import date
  result=read_individual_evidence("laborum","https://www.laborum.cl",html(valid_through="2026-11-05"),date(2026,11,6))
  self.assertEqual(result["status"],"closed")
 def test_missing_date_never_invented_from_relative(self):
  from datetime import date
  result=read_individual_evidence("computrabajo","https://cl.computrabajo.com",html(dateposted="Hace 5 horas"),date(2026,11,6))
  self.assertEqual(result["status"],"review_required")
  self.assertIsNone(result["source_date"])
 def test_historical_is_not_closed(self):
  from datetime import date
  result=read_individual_evidence("trabajando","https://www.trabajando.cl",html(dateposted="2026-10-20"),date(2026,11,6))
  self.assertEqual(result["status"],"historical_review")
 def test_no_jobposting_not_job(self):
  from datetime import date
  result=read_individual_evidence("computrabajo","https://cl.computrabajo.com","<h1>Empleos Angol</h1>",date(2026,11,6))
  self.assertEqual(result["reason"],"jobposting_missing_or_ambiguous")
 def test_explicit_closure_detected(self):
  from datetime import date
  result=read_individual_evidence("computrabajo","https://cl.computrabajo.com",html(extra="Postulaciones cerradas"),date(2026,11,6))
  self.assertEqual(result["status"],"closed")

if __name__=="__main__":unittest.main()
