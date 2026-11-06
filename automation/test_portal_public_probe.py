import unittest
from portal_public_probe import canonical_job,extract_individual_links,scan_one,collect
from portal_coverage_registry import PORTALS, COMMUNES

class PortalReadOnlyProbeTests(unittest.TestCase):
 def test_computrabajo_city_url_not_broad_keyword_search(self):
  self.assertEqual(PORTALS["computrabajo"]("Angol"),"https://cl.computrabajo.com/empleos-en-araucania-en-angol")
  self.assertEqual(PORTALS["computrabajo"]("Nacimiento"),"https://cl.computrabajo.com/empleos-en-biobio-en-nacimiento")
 def test_trabajando_is_in_registry(self):
  self.assertIn("trabajando",PORTALS)
 def test_specific_job_links_only(self):
  html="""<a href='/ofertas-de-trabajo/oferta-de-trabajo-de-operador-en-angol-XXX'>Operador Angol</a>
  <a href='/trabajo-de-angol'>Trabajos Angol</a><a href='https://evil.example/ofertas-de-trabajo/oferta-de-trabajo-de-a'>Otra</a>"""
  rows=extract_individual_links("computrabajo",html,"https://cl.computrabajo.com/empleos-en-araucania-en-angol")
  self.assertEqual(len(rows),1)
  self.assertEqual(rows[0]["label"],"Operador Angol")
 def test_canonical_strips_tracking_and_denies_untrusted_sites(self):
  url=canonical_job("chiletrabajos","https://www.chiletrabajos.cl/trabajo/operador-123456?utm_source=ad","https://www.chiletrabajos.cl/")
  self.assertEqual(url,"https://www.chiletrabajos.cl/trabajo/operador-123456")
  self.assertIsNone(canonical_job("chiletrabajos","https://evil.invalid/trabajo/operador-123456","https://www.chiletrabajos.cl/"))
 def test_robots_denial_never_tries_http(self):
  calls=[]
  def fetch(url):
   calls.append(url)
   return 200,"<a href='/trabajo/prueba'>Prueba</a>"
  row=scan_one("chiletrabajos","Angol",fetch=fetch,authorize=lambda _: (False,"robots_disallowed"))
  self.assertEqual(row["status"],"robots_disallowed")
  self.assertEqual(calls,[])
 def test_403_not_misread_as_no_vacancies(self):
  row=scan_one("computrabajo","Angol",fetch=lambda url:(403,None),authorize=lambda _: (True,"robots_permitted"))
  self.assertEqual(row["status"],"access_restricted")
  self.assertEqual(row["unverified_links"],0)
 def test_accessible_index_returns_unverified_links_not_job_offers(self):
  html='<a href="/trabajo/supervisor-angol-12345">Supervisor</a>'
  row=scan_one("chiletrabajos","Angol",fetch=lambda url:(200,html),authorize=lambda _: (True,"robots_permitted"))
  self.assertEqual(row["status"],"index_links_found")
  self.assertEqual(row["unverified_links"],1)
  self.assertEqual(row["individual_offers_read"],0)
 def test_soft_404_and_access_challenge_are_not_empty_jobs(self):
  for text,expected in (("No encontramos la página que buscas","soft_404_or_invalid_search_path"),
                        ("verify you are human","access_challenge")):
   row=scan_one("laborum","Angol",fetch=lambda url:(200,"<html><body>"+text+"</body></html>"),
                authorize=lambda _: (True,"robots_permitted"))
   self.assertEqual(row["status"],expected)
   self.assertEqual(row["unverified_links"],0)
 def test_no_territory_leaks(self):
  self.assertNotIn("Quilaco",COMMUNES)
  self.assertEqual(len(COMMUNES),12)
 def test_all_tasks_bounded(self):
  rows=collect(["chiletrabajos"],["Angol","Victoria"],fetch=lambda url:(200,"<html></html>"),authorize=lambda _: (True,"robots_permitted"))
  self.assertEqual(len(rows),2)
  self.assertTrue(all(r["status"]=="index_accessible_no_job_links" for r in rows))

if __name__=="__main__":unittest.main()
