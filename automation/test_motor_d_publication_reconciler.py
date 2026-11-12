"""Regression tests for source-level publication reconciliation, no AppDeploy writes."""
import json
import tempfile
import unittest
from pathlib import Path

from motor_d_publication_reconciler import reconcile, load_batch


OLD="motor-d-20261108-50a5c80afe2d3bf4fd"
NEW="motor-d-20261112-e320b72de7d2b23bc7"


def offer(num, title="Ejecutivo Call Center", commune="Angol"):
    return {
        "id_fuente":"d_"+str(num),
        "url_original":f"https://www.chiletrabajos.cl/trabajo/call-center-{num}",
        "cargo":title, "empresa":"Empresa Tecnología",
        "comunas":[commune], "fecha_cierre":"2026-12-15",
    }


def feed(item):
    return {
        "id":"chatgpt_"+item["id_fuente"],"kind":"job_offer",
        "url":item["url_original"],"title":item["cargo"],
        "company":item["empresa"],"workCommunes":item["comunas"]
    }


class PublicReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.first=offer(3907745)
        self.second=offer(3907748, title="Ejecutivo atención usuarios")
        self.index={"schema_version":1, "batches":[
            {"batch_id":OLD,"file":"20261108/"+OLD+".json","count":2},
            {"batch_id":NEW,"file":"20261112/"+NEW+".json","count":2},
        ], "quarantined_batches":[{"batch_id":OLD,"reason":"reverify"}]}
        self.batches={OLD:[self.first,self.second], NEW:[self.first,self.second]}
        self.history={"scan_date":"2026-11-12","items":[
            {"id_fuente":i["id_fuente"],"url_original":i["url_original"],
             "cargo":i["cargo"],"empresa":i["empresa"],"comunas":i["comunas"],
             "prior_batch_ids":[OLD,NEW]} for i in (self.first,self.second)]}

    def compute(self, rows, index=None, history=None):
        return reconcile(
            index if index is not None else self.index,
            history if history is not None else self.history,
            rows, lambda batch:self.batches[batch["batch_id"]],
            "2026-11-12T16:00:00+00:00")

    def test_both_public_urls_clear_stale_historical_gap(self):
        confirmation,updated=self.compute([feed(self.first),feed(self.second)])
        self.assertEqual(confirmation["feed_rows"],2)
        self.assertEqual(confirmation["quarantined_batches"],1)
        self.assertEqual(confirmation["distinct_nonquarantined_offers"],2)
        self.assertEqual(confirmation["source_confirmed"],2)
        self.assertEqual(confirmation["not_found"],0)
        self.assertEqual(confirmation["latest_batch"]["source_confirmed"],2)
        self.assertEqual(confirmation["previously_flagged_resolved"],2)
        self.assertEqual(updated["state"],"clear")
        self.assertEqual(updated["historical_missing_from_catalog"],0)
        self.assertEqual(updated["items"],[])
        self.assertEqual(len(updated["resolved_published_items"]),2)

    def test_only_one_visible_url_leaves_one_real_pending(self):
        confirmation,updated=self.compute([feed(self.first)])
        self.assertEqual(confirmation["source_confirmed"],1)
        self.assertEqual(updated["historical_missing_from_catalog"],1)
        self.assertEqual(updated["items"][0]["id_fuente"],self.second["id_fuente"])
        self.assertEqual(updated["state"],"needs_receipt_review")

    def test_semantic_duplicate_is_not_proof_of_original_url(self):
        unrelated={**feed(self.first),"url":"https://example.org/job/other"}
        confirmation,updated=self.compute([unrelated])
        self.assertEqual(confirmation["source_confirmed"],0)
        self.assertEqual(confirmation["semantic_only"],1)
        self.assertEqual(updated["historical_missing_from_catalog"],2)
        self.assertIn(self.first["id_fuente"],updated["semantic_only_requires_receipt"])

    def test_quarantined_only_batches_cannot_become_publication_claim(self):
        index={**self.index,"batches":self.index["batches"][:1]}
        c,u=self.compute([feed(self.first),feed(self.second)],index=index)
        self.assertEqual(c["distinct_nonquarantined_offers"],0)
        self.assertEqual(c["source_confirmed"],0)
        self.assertEqual(u["historical_missing_from_catalog"],0)
        self.assertEqual(u["resolved_published_items"][0]["status"],
                         "confirmed_visible_in_live_feed_by_source")

    def test_stale_prior_metadata_not_needed_to_check_new_batch(self):
        c,u=self.compute([feed(self.first),feed(self.second)],
                         history={"scan_date":"2026-11-12","items":[]})
        self.assertEqual(c["source_confirmed"],2)
        self.assertEqual(c["previously_flagged_resolved"],0)
        self.assertEqual(u["state"],"clear")

    def test_invalid_and_traversal_batch_never_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with self.assertRaisesRegex(ValueError,"unsafe_batch_path"):
                load_batch(root,{"batch_id":OLD,"file":"../../etc/passwd"})
            with self.assertRaisesRegex(ValueError,"invalid_batch_list"):
                reconcile({"schema_version":1,"batches":"invalid"},
                          self.history,[],lambda x:[])

    def test_complete_feed_rows_must_be_structured(self):
        with self.assertRaisesRegex(ValueError,"complete_public_feed_required"):
            self.compute([None])
        with self.assertRaisesRegex(ValueError,"invalid_history"):
            self.compute([],history={"items":"unknown"})

    def test_unchanged_public_catalog_is_idempotent(self):
        current=[feed(self.first),feed(self.second)]
        first,previous=self.compute(current)
        again,snapshot=self.compute(current,history=previous)
        self.assertEqual(again["source_confirmed"],2)
        self.assertEqual(snapshot["items"],[])
        self.assertEqual(snapshot["state"],"clear")
        self.assertEqual(snapshot["historical_missing_from_catalog"],0)


if __name__=="__main__":
    unittest.main()
