"""Preflight del código AppDeploy preparado: no toca producción."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1] / "appdeploy_staging"


class BackendPreflight(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bc = (ROOT / "fast-bc-html.ts").read_text(encoding="utf-8")
        cls.feed = (ROOT / "public-feed.ts").read_text(encoding="utf-8")

    def test_motor_d_index_contract(self):
        """Validate D index format without making unrelated CI time-dependent."""
        import json
        from datetime import date
        index = json.loads((ROOT.parent / "automation" / "motor_d_ready" / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(index.get("schema_version"), 1)
        batches = index.get("batches")
        self.assertIsInstance(batches, list)
        ids = [entry["batch_id"] for entry in batches]
        self.assertEqual(len(ids), len(set(ids)), "Duplicated Motor D batch IDs")
        for entry in batches:
            batch_id = entry["batch_id"]
            self.assertRegex(batch_id, r"^motor-d-\d{8}-[a-f0-9]{18}$")
            self.assertEqual(entry["file"], batch_id[8:16] + "/" + batch_id + ".json")
            date.fromisoformat(batch_id[8:12] + "-" + batch_id[12:14] + "-" + batch_id[14:16])

    def test_bc_idle_cycle_skips_redundant_status_write(self):
        html = (ROOT / "fast-bc-html.ts").read_text(encoding="utf-8")
        idle = html.index("if(checked===0 && storageFailures===0)")
        status_write = html.index("db.tx.update(STATUS")
        self.assertLess(idle, status_write)
        self.assertIn("FAST_B_C_HTML_IDLE", html)

    def test_bc_does_not_count_storage_as_publication(self):
        self.assertIn("decision='stored_pending_public_feed';published=false", self.bc)
        self.assertNotIn("decision='verified_for_public_feed';published=true", self.bc)

    def test_bc_index_and_dedup(self):
        self.assertIn("genericSourceIndex(url)", self.bc)
        self.assertIn("seenUrls.has(url)", self.bc)
        self.assertIn("deferredIndex", self.bc)

    def test_bc_failed_write_is_not_already_seen(self):
        self.assertIn("FAST_B_C_DECISION_WRITE_FAILED", self.bc)
        self.assertIn("storageFailures++", self.bc)
        self.assertNotIn("if(!stored){already++;}", self.bc)

    def test_feed_checks_leaf_before_serving(self):
        position = self.feed.index("export async function readPublicFeedPage")
        check = self.feed.index("Public feed page identity mismatch", position)
        serve = self.feed.index("return { ...summary, items:", position)
        self.assertLess(check, serve)

    def test_feed_queue_health_is_read_only_and_bounded(self):
        progress = self.feed.split("export async function publicFeedProgress()", 1)[1].split("export async function readStagedPublicFeedPage()", 1)[0]
        self.assertIn("db.list<Change>('public_feed_changes',{limit:STEP_SIZE})", progress)
        self.assertIn("pendingFeedChangesAtLeast", progress)
        self.assertIn("oldestQueuedAt", progress)
        self.assertNotIn("db.delete(", progress)
        self.assertNotIn("db.add(", progress)
        self.assertNotIn("db.update(", progress)

    def test_feed_change_acknowledgement_after_publish(self):
        incremental = self.feed.split("const changes = await db.list<Change>('public_feed_changes'", 1)[1]
        self.assertLess(incremental.index("const result = await publish("),
                        incremental.index("db.delete('public_feed_changes'"))
        self.assertIn("regressionBlocked", incremental)

    def test_feed_preserves_approved_offer_without_confirmed_closure(self):
        self.assertIn("PUBLIC_FEED_LAST_GOOD_PRESERVED", self.feed)
        self.assertIn("previous?.item.verified===true", self.feed)
        self.assertIn("!/confirmed|explicit|administrative|owner_request/.test(closure)", self.feed)

    def test_feed_blocks_unexplained_disappearance(self):
        publication = self.feed.split("async function publish(record:Manifest, projector:Projector)", 1)[1].split("export async function readPublicFeedSummary()", 1)[0]
        self.assertIn("PUBLIC_FEED_REGRESSION_BLOCKED", publication)
        self.assertIn("regressionBlocked:true", publication)
        self.assertLess(publication.index("if(unexpected.length)"), publication.index("db.add('public_feed_manifests'"))

    def test_feed_recovers_last_good_for_summary_and_lookup(self):
        summary = self.feed.split("export async function readPublicFeedSummary()", 1)[1].split("export async function currentPublicFeedManifest()", 1)[0]
        lookup = self.feed.split("export async function currentPublicFeedManifest()", 1)[1].split("export async function publicFeedProgress()", 1)[0]
        self.assertIn("public_feed_last_good", summary)
        self.assertIn("public_feed_last_good", lookup)


if __name__ == "__main__":
    unittest.main()
