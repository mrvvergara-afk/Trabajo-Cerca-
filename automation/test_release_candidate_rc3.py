#!/usr/bin/env python3
"""Strict, read-only preflight for Trabajo Cerca RC2 one-shot AppDeploy release.

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
MANIFEST = ROOT / "docs/releases/TRABAJO_CERCA_CONSOLIDATED_RC3_APPDEPLOY_FILES.json"
EXPECTED = {
    "backend/chatgpt-direct-import.ts",
    "backend/public-source-verifier.ts",
    "backend/motor-gemini-github-pull.ts",
    "backend/motor-b-sources.ts",
    "backend/worksite-semantics.ts",
    "backend/gemini-verify-scheduler.ts",
    "src/house-advertising.tsx",
    "src/house-photo-selection.ts",
    "src/administrator-access.tsx",
    "src/executive-metrics.ts",
    "src/executive-control-center.tsx",
    "src/executive-control-center.css",
}
NEW_FILES = {"backend/worksite-semantics.ts", "backend/gemini-verify-scheduler.ts", "src/house-photo-selection.ts", "src/executive-metrics.ts", "src/executive-control-center.tsx", "src/executive-control-center.css"}


def stage_path(name: str) -> pathlib.Path:
    if name.startswith("backend/"):
        return ROOT / "appdeploy_staging" / name.removeprefix("backend/")
    if name.startswith("src/"):
        return ROOT / "appdeploy_staging_ui" / name
    raise AssertionError("Unexpected release path " + name)
SNAPSHOT = "1795108368721"


def git_blob_sha(text: str) -> str:
    data = text.encode("utf-8")
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


class ReleaseCandidatePreflight(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if (ROOT / "docs/releases/TRABAJO_CERCA_CONSOLIDATED_RC5_APPDEPLOY_FILES.json").exists():
            raise unittest.SkipTest("Paquete histórico reemplazado por RC5; ver QA vigente.")
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

    def test_only_twelve_expected_files(self):
        self.assertEqual(set(self.files), EXPECTED)
        self.assertEqual(len(self.manifest["files"]), len(self.files))
        self.assertEqual(sum(x.startswith("backend/") for x in self.files), 6)
        self.assertEqual(sum(x.startswith("src/") for x in self.files), 6)
        self.assertFalse(any(x == "backend/index.ts" for x in self.files))
        self.assertFalse(any(x == "src/App.tsx" for x in self.files))

    def test_staged_source_is_cryptographically_pinned(self):
        blobs = self.manifest["source_file_blobs"]
        self.assertEqual(set(blobs), EXPECTED)
        for name in sorted(EXPECTED):
            src = stage_path(name)
            self.assertTrue(src.is_file(), name)
            content = src.read_text(encoding="utf-8")
            self.assertEqual(git_blob_sha(content), blobs[name], name)

    def test_update_diffs_not_fullfile_rewrites(self):
        for name, entry in self.files.items():
            self.assertNotIn("content", entry) if name not in NEW_FILES else self.assertNotIn("diffs", entry)
            staged = stage_path(name).read_text(encoding="utf-8")
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


    def test_original_photos_and_admin_withdrawals(self):
        photo = (ROOT/"appdeploy_staging_ui/src/house-photo-selection.ts").read_text(encoding="utf-8")
        banner = (ROOT/"appdeploy_staging_ui/src/house-advertising.tsx").read_text(encoding="utf-8")
        approved = (ROOT/"appdeploy_staging_ui/shared/ad-images.ts").read_text(encoding="utf-8")
        self.assertIn("safeAdImage",photo)
        self.assertIn("if(input.imageDisabled===true) return undefined",photo)
        self.assertIn("selectHousePhotoUrl",banner)
        self.assertIn("HOUSE_DEFAULTS.find",banner)
        self.assertIn("houseSequence(house.campaign.id)",banner)
        self.assertNotIn("creative.storagePath && !creative.imageDisabled",banner)
        self.assertIn("raw.githubusercontent.com",approved)
        self.assertIn("Imagen ilustrativa",banner)
        self.assertIn("tcCampaignFallbackArt",banner)
        self.assertEqual(len(self.files["src/house-advertising.tsx"]["diffs"]),3)
        self.assertIn("photo-v2-(640|1200)",approved)

    def test_release_supersedes_old_but_does_not_publish(self):
        m=self.manifest
        self.assertEqual(m["release"],"TC-CONSOLIDATED-20261119-RC3")
        self.assertTrue(any("supersedes RC2" in x for x in m["guardrails"]))
        self.assertFalse(any("src/commercial-admin.tsx" in x for x in self.files))
        self.assertFalse(any("src/house-admin.tsx" in x for x in self.files))


    def test_executive_dashboard_is_private_and_read_only(self):
        admin = (ROOT/"appdeploy_staging_ui/src/administrator-access.tsx").read_text(encoding="utf-8")
        dashboard = (ROOT/"appdeploy_staging_ui/src/executive-control-center.tsx").read_text(encoding="utf-8")
        metrics = (ROOT/"appdeploy_staging_ui/src/executive-metrics.ts").read_text(encoding="utf-8")
        self.assertIn("ExecutiveControlCenter = lazy",admin)
        self.assertIn("{allowed && <div className='tcAdminWorkspace'>",admin)
        self.assertIn("<ExecutiveControlCenter summary={summary}/>",admin)
        self.assertNotIn("tcAdminStatGrid",admin)
        self.assertIn("Promise.allSettled",dashboard)
        for endpoint in [
            "/api/admin/territorial-coverage",
            "/api/admin/gemini/status",
            "/api/admin/motors/health",
        ]: self.assertIn(endpoint,dashboard)
        self.assertNotIn("api.post(",dashboard)
        self.assertNotIn("api.put(",dashboard)
        self.assertNotIn("fetch(",dashboard)
        self.assertNotIn("localStorage",dashboard)
        self.assertIn("Sin datos",metrics)
        self.assertIn("'Cobertura efectiva'",metrics)
        self.assertIn("'Motores saludables'",metrics)
        self.assertNotIn("'Temuco'",metrics)
        self.assertNotIn("'Los Ángeles'",metrics)
        self.assertEqual(len(self.files["src/administrator-access.tsx"]["diffs"]),2)

    def test_release_has_no_secondary_admin_or_backend_overwrite(self):
        self.assertNotIn("backend/index.ts",self.files)
        self.assertNotIn("src/App.tsx",self.files)
        self.assertNotIn("src/commercial-admin.tsx",self.files)
        self.assertNotIn("src/house-admin.tsx",self.files)
        self.assertEqual(len(self.files),12)


if __name__ == "__main__":
    unittest.main(verbosity=2)
