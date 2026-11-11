import unittest
from stage_motor_d_handoff import prepare

def fixture():
    return {"approval":"approved_for_publication","producer":"motor_d_territorial","offers":[{"id_fuente":"d_"+"a"*20,"cargo":"Operario","empresa":"Empresa","comunas":["Mininco"],"url_original":"https://example.com/job/123","fecha_publicacion":"2026-11-09","fecha_descubrimiento":"2026-11-11"}]}
class HandoffTests(unittest.TestCase):
    def test_valid_bridge_batch(self):
        path,batch,index=prepare(fixture(),{"schema_version":1,"batches":[],"seen_offer_ids":[]},day="20261111")
        self.assertEqual(batch["producer"],"motor_d_territorial")
        self.assertEqual(batch["offers"][0]["comunas"],["Collipulli"])
        self.assertRegex(path,r"^20261111/motor-d-20261111-[a-f0-9]{18}\.json$")
        self.assertEqual(len(index["batches"]),1)
    def test_unapproved_fails(self):
        x=fixture();x["approval"]="pending"
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
    def test_outside_fails(self):
        x=fixture();x["offers"][0]["comunas"]=["Los Ángeles"]
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
    def test_duplicate_fails(self):
        x=fixture()
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[],"seen_offer_ids":["d_"+"a"*20]},day="20261111")
    def test_empty_fails(self):
        x=fixture();x["offers"]=[]
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
if __name__=="__main__": unittest.main()
