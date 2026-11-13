import unittest
from datetime import date
from automation.chatgpt_extraction_contract import canonical_source_url, url_hash, validate_offer, validate_batch

TODAY=date(2026,11,13)
def offer(**changes):
    row={"id_fuente":"cg_"+"a"*20,"cargo":"Operador industrial","empresa":"Empresa Ejemplo",
         "comunas":["Mininco","Coihue"],"ubicacion_trabajo":"Faena Mininco y Coihue",
         "modalidad":"presencial","salario":None,"url_original":"https://www.empresa.example/jobs/123?utm_source=search&a=2&b=1#post",
         "enlace_postulacion":"https://empresa.example/postular?id=123","fecha_publicacion":"2026-11-10",
         "fecha_descubrimiento":"2026-11-13"}
    row.update(changes)
    return row

class StrictExtractionTest(unittest.TestCase):
    def test_alias_and_hash_deterministic(self):
        row=validate_offer(offer(),today=TODAY)
        self.assertEqual(row["comunas"],["Collipulli","Negrete"])
        self.assertEqual(row["url_canonica"],"https://empresa.example/jobs/123?a=2&b=1")
        self.assertEqual(row["hash_url_sha256"],url_hash("https://empresa.example/jobs/123?b=1&a=2&fbclid=abc"))
    def test_schema_unknown_key(self):
        with self.assertRaisesRegex(ValueError,"invalid_strict_offer_keys"):
            validate_offer(offer(inventado=True),today=TODAY)
    def test_unproven_commune(self):
        with self.assertRaisesRegex(ValueError,"territory_not_evidenced"):
            validate_offer(offer(comunas=["Angol"]),today=TODAY)
    def test_outside_commune(self):
        with self.assertRaisesRegex(ValueError,"outside_territory"):
            validate_offer(offer(comunas=["Quilaco"]),today=TODAY)
    def test_missing_salary_key_is_invalid_even_if_unknown(self):
        row=offer();del row["salario"]
        with self.assertRaisesRegex(ValueError,"invalid_strict_offer_keys"):
            validate_offer(row,today=TODAY)
    def test_wrong_hash_rejected(self):
        with self.assertRaisesRegex(ValueError,"url_hash_mismatch"):
            validate_offer(offer(hash_url_sha256="0"*64),today=TODAY)
    def test_url_duplicate_same_job_different_trackers(self):
        p=offer()
        q=offer(id_fuente="cg_"+"b"*20,url_original="https://empresa.example/jobs/123?b=1&a=2&utm_medium=email")
        with self.assertRaisesRegex(ValueError,"duplicate_canonical_url_hash"):
            validate_batch([p,q],today=TODAY)
    def test_existing_url_hash_blocked(self):
        with self.assertRaisesRegex(ValueError,"duplicate_canonical_url_hash"):
            validate_batch([offer()],{url_hash(offer()["url_original"])},today=TODAY)
    def test_url_application_keeps_query(self):
        self.assertEqual(canonical_source_url("https://www.example.com/apply?job=123&ref=direct"),"https://example.com/apply?job=123&ref=direct")
    def test_reject_credentials_and_private_ip(self):
        for x in ("https://name:pass@example.com/a","https://127.0.0.1/a","http://jobs.example.com/job"):
            with self.subTest(x=x), self.assertRaises(ValueError):canonical_source_url(x)
    def test_future_or_expired(self):
        with self.assertRaisesRegex(ValueError,"expired_offer"):
            validate_offer(offer(fecha_cierre="2026-11-12"),today=TODAY)
        with self.assertRaisesRegex(ValueError,"future_date"):
            validate_offer(offer(fecha_publicacion="2026-11-14"),today=TODAY)
    def test_unknown_modality_rejected(self):
        with self.assertRaisesRegex(ValueError,"invalid_modalidad"):
            validate_offer(offer(modalidad="quizas"),today=TODAY)

if __name__=="__main__":unittest.main()
