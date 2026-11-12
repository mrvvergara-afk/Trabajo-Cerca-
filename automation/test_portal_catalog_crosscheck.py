import unittest
from portal_catalog_crosscheck import identity,key,crosscheck

C={"status":"ready_for_catalog_crosscheck","url":"https://www.trabajando.cl/trabajo/6145395-bodeguero-preunic",
   "title":"Bodeguero Navidad","company":"Preunic","work_commune":"Angol"}

class PortalCatalogCrosscheckTests(unittest.TestCase):
 def test_catalog_unavailable_never_approved(self):
  result=crosscheck(C,None)
  self.assertEqual(result["status"],"catalog_unavailable")
  self.assertFalse(result["can_publish"])
 def test_duplicate_source_identity(self):
  result=crosscheck(C,[{"url":"https://www.trabajando.cl/trabajo/6145395-cambiado",
      "title":"Bodeguero","company":"Preunic","workCommunes":["Angol"]}])
  self.assertEqual(result["status"],"duplicate_source_identity")
 def test_semantic_duplicate_across_portals(self):
  result=crosscheck(C,[{"url":"https://www.chiletrabajos.cl/trabajo/bodeguero-3926914",
      "title":"Bodeguero Navidad","company":"Preunic","workCommunes":["Angol"]}])
  self.assertEqual(result["status"],"possible_semantic_duplicate")
 def test_missing_from_catalog_requires_secondary_verification(self):
  result=crosscheck(C,[])
  self.assertEqual(result["status"],"not_found_in_catalog")
  self.assertFalse(result["can_publish"])
 def test_non_verified_candidate_cannot_crosscheck(self):
  result=crosscheck(dict(C,status="review_required"),[])
  self.assertEqual(result["status"],"not_verified_candidate")
 def test_incomplete_commune_cannot_publish(self):
  result=crosscheck(dict(C,work_commune=None),[])
  self.assertEqual(result["status"],"missing_candidate_identity")
 def test_url_normalizations(self):
  self.assertEqual(identity("https://www.trabajando.cl/trabajo/6145395-bodeguero-preunic"),
                   identity("https://www.trabajando.cl/trabajo/6145395-renamed"))
  self.assertEqual(key("Técnico de Bodega","ACME Spa","Angol"),
                   key("tecnico de bodega","ACME SPA","ANGOL"))

if __name__=="__main__":unittest.main()
