import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from automation.stage_chatgpt_handoff import prepare, stage, durable_json
from automation.test_stage_chatgpt_handoff import index, payload


class DurableHandoff(unittest.TestCase):
    def test_recovers_batch_file_when_index_commit_was_interrupted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "chatgpt_ready"
            reviewed, existing = payload(), index()
            day, today = "20261113", date(2026, 11, 13)
            rel, batch, _ = prepare(reviewed, existing, day, today=today)
            durable_json(root / "index.json", existing)
            durable_json(root / rel, batch)
            status = stage(reviewed, root, day=day, today=today)
            self.assertTrue(status["recovered_unindexed_batch"])
            self.assertFalse(status["publication_confirmed"])
            updated = json.loads((root / "index.json").read_text())
            self.assertEqual(updated["batches"][0]["batch_id"], batch["batch_id"])

    def test_unapproved_coverage_cannot_generate_a_batch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "chatgpt_ready"
            durable_json(root / "index.json", index())
            with self.assertRaisesRegex(ValueError, "invalid_chatgpt_approval"):
                stage({"waves": {"1": {"found": 5}}}, root)
            self.assertEqual(list(root.iterdir()), [root / "index.json"])
