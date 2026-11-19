#!/usr/bin/env python3
"""Strict, read-only preflight for one-shot Trabajo Cerca P1 AppDeploy release.

This validates the release candidate in GitHub. It cannot prove that an isolated
LAB exists, that a database backup is restorable, or that publication succeeded.
Those are separately required manual/operational gates.
"""
import hashlib
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/releases/TRABAJO_CERCA_P1_RC1_APPDEPLOY_FILES.json"
EXPECTED = {
    "backend/chatgpt-direct-import.ts",
    "backend/public-source-verifier.ts",
    "backend/motor-gemini-github-pull.ts",
    "backend/motor-b-sources.ts",
    "backend/worksite-semantics.ts",
    "backend/gemini-verify-scheduler.ts",
}
NEW_FILES = {"backend/worksite-semantics.ts", "backend/gemini-verify-scheduler.ts"}
SNAPSHOT = "1795108368721"


def git_blob_sha(text: str) -> str:
    data = text.encode("utf-8")
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


class ReleaseCandidatePreflight(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        cls.files = {f["filename"]: f for f in cls.manifest["files"]}

    def test_identity_and_predeployment_gate(self):
        m = self.manifest
        self.assertEqual(m["target_app"]["app_id"], "trabajo-cerca-laboratorio-3ojgro")
        self.assertEqual(m["target_app"]["snapshot_version"], SNAPSHOT)
        self.assertEqual(m["target_app"]["app_type"], "frontend+backend")
        self.assertEqual(m["authorization"], "NOT_AUTHORIZED")
        self.assertIn("NOT_DEPLOYABLE_WITHOUT_ISOLATED_LAB", m["status"])
        self.assertTrue(any("explicit user authorization" in x for x in m["guardrails"]))
        self.assertTrue(any("database" in x for x in m["guardrails"]))

    def test_only_six_expected_backend_files(self):
        self.assertEqual(set(self.files), EXPECTED)
        self.assertEqual(len(self.manifest["files"]), len(self.files))
        self.assertTrue(all(x.startswith("backend/") for x in self.files))
        self.assertFalse(any(x.startswith("src/") for x in self.files))

    def test_staged_source_is_cryptographically_pinned(self):
        blobs = self.manifest["source_file_blobs"]
        self.assertEqual(set(blobs), EXPECTED)
        for name in sorted(EXPECTED):
            src = ROOT / "appdeploy_staging" / name.removeprefix("backend/")
            self.assertTrue(src.is_file(), name)
            content = src.read_text(encoding="utf-8")
            self.assertEqual(git_blob_sha(content), blobs[name], name)

    def test_update_diffs_not_fullfile_rewrites(self):
        for name, entry in self.files.items():
            self.assertNotIn("content", entry) if name not in NEW_FILES else self.assertNotIn("diffs", entry)
            staged = (ROOT / "appdeploy_staging" / name.removeprefix("backend/")).read_text(encoding="utf-8")
            if name in NEW_FILES:
                self.assertEqual(entry["content"], staged)
                continue
            self.assertTrue(entry["diffs"], name)
            for change in entry["diffs"]:
                self.assertIsInstance(change["from"], str)
                self.assertTrue(change["from"].strip(), name)
                self.assertTrue(change["to"].strip(), name)
                # Each new-state anchor is present once in final staged source.
                self.assertEqual(staged.count(change["to"]), 1, name)

    def test_no_production_data_or_credentials_shipped(self):
        payload = MANIFEST.read_text(encoding="utf-8")
        for term in ("MOTOR_C_GITHUB_READ_TOKEN=", "Authorization: Bearer ", "BEGIN PRIVATE KEY"):
            self.assertNotIn(term, payload)
        self.assertNotIn("radar_jobs.json", self.files)
        self.assertNotIn("output/trabajo_cerca_review_queue_v2.json", self.files)

    def test_worksite_semantics_stays_evidence_based(self):
        worksite = (ROOT / "appdeploy_staging/worksite-semantics.ts").read_text(encoding="utf-8")
        importer = (ROOT / "appdeploy_staging/chatgpt-direct-import.ts").read_text(encoding="utf-8")
        self.assertIn("workplaceWithoutEmployerNames", worksite)
        self.assertIn("worksiteMentionsCommune", importer)
        self.assertNotIn("const titleSite=", importer)
        self.assertIn("x.ubicacion_trabajo", importer)

    def test_gemini_bridge_and_retries_are_review_only(self):
        bridge = (ROOT / "appdeploy_staging/motor-gemini-github-pull.ts").read_text(encoding="utf-8")
        scheduler = (ROOT / "appdeploy_staging/gemini-verify-scheduler.ts").read_text(encoding="utf-8")
        self.assertIn("'trabajando.cl':'Trabajando.com'", bridge)
        self.assertIn("if(!adapter||adapter.family==='aggregator')return null", bridge)
        self.assertIn("geminiRetryableReason", bridge)
        self.assertIn("duplicate_check_in_progress", scheduler)
        self.assertIn("queued_for_verification", bridge)
        self.assertNotIn("await publishDirectly(", bridge)

    def test_negrete_feed_uses_existing_document_reader(self):
        registry = (ROOT / "appdeploy_staging/motor-b-sources.ts").read_text(encoding="utf-8")
        self.assertEqual(registry.count("https://www.muninegrete.cl/feed/"), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
