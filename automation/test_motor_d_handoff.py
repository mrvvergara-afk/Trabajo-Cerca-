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
    def test_sixteen_offers_rejected(self):
        x=fixture()
        x["offers"]=[{**x["offers"][0],"id_fuente":"d_"+format(i,"020x")} for i in range(16)]
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
    def test_bad_date_rejected(self):
        x=fixture();x["offers"][0]["fecha_publicacion"]="2026-11-99"
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
    def test_duplicate_within_batch_rejected(self):
        x=fixture();x["offers"].append(dict(x["offers"][0]))
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
    def test_invalid_producer_rejected(self):
        x=fixture();x["producer"]="unknown"
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
    def test_missing_source_url_rejected(self):
        x=fixture();x["offers"][0]["url_original"]="not-a-link"
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
    def test_repeat_payload_has_same_id(self):
        x=fixture();y=fixture();index={"schema_version":1,"batches":[]}
        first=prepare(x,index,day="20261111")[1]["batch_id"]
        second=prepare(y,index,day="20261111")[1]["batch_id"]
        self.assertEqual(first,second)
    def test_future_publication_rejected(self):
        x=fixture();x["offers"][0]["fecha_publicacion"]="2099-01-01"
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
    def test_duplicate_identity_in_batch_rejected(self):
        x=fixture();second=dict(x["offers"][0]);second["id_fuente"]="d_"+"b"*20;x["offers"].append(second)
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
    def test_input_not_mutated(self):
        x=fixture();prepare(x,{"schema_version":1,"batches":[]},day="20261111")
        self.assertEqual(x["offers"][0]["comunas"],["Mininco"])
    def test_url_with_credentials_rejected(self):
        x=fixture();x["offers"][0]["url_original"]="https://user:secret@example.com/job"
        with self.assertRaises(ValueError): prepare(x,{"schema_version":1,"batches":[]},day="20261111")
if __name__=="__main__": unittest.main()
