"""Preflight del código AppDeploy preparado: no toca producción."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1] / "appdeploy_staging"


class BackendPreflight(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bc = (ROOT / "fast-bc-html.ts").read_text(encoding="utf-8")
        cls.feed = (ROOT / "public-feed.ts").read_text(encoding="utf-8")

    def test_pwa_manifest_icons_are_same_origin(self):
        import json
        manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
        icons = manifest["icons"]
        self.assertEqual(len(icons), 3)
        self.assertEqual([i["src"] for i in icons],
                         ["./icon-192.png", "./icon-512.svg", "./icon-maskable-512.svg"])
        self.assertTrue(all(i["src"].startswith("./") for i in icons))
        self.assertTrue((ROOT / "icon-512.svg").is_file())
        self.assertTrue((ROOT / "icon-maskable-512.svg").is_file())

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

    def test_motor_d_reports_missing_producer_heartbeat(self):
        bridge = (ROOT / "motor-d-auto-import.ts").read_text(encoding="utf-8")
        self.assertIn("no_recent_batches_unverified_producer", bridge)
        self.assertIn("producerExecutionUnverified", bridge)
        self.assertIn("latestBatchDate", bridge)
        self.assertIn("producer_heartbeat.json", bridge)
        self.assertIn("no_unprocessed_batches_producer_confirmed", bridge)
        self.assertIn("no_unprocessed_batches_producer_unverified", bridge)
        self.assertIn("MOTOR_D_PRODUCER_HEARTBEAT_UNAVAILABLE", bridge)
        self.assertIn("EXPECTED_TERRITORIES.every", bridge)
        self.assertIn(r"/^motor-d-(\d{8})-/", bridge)

    def test_bc_pipeline_idle_does_not_migrate_or_write_checkpoint(self):
        pipeline = (ROOT / "fast-bc-pipeline.ts").read_text(encoding="utf-8")
        idle = pipeline.index("if(result.processed===0 && html.checked===0 && html.storageFailures===0)")
        migration = pipeline.index("db.list<Progress>('fast_bc_state_v1'")
        write = pipeline.index("db.tx.update(STATE")
        self.assertLess(idle, migration)
        self.assertLess(idle, write)
        self.assertIn("MOTOR_B_C_FAST_IDLE", pipeline)

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
        position = self.feed.index("async function readPublicFeedPageUncached")
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

    def test_chatgpt_bridge_is_hooked_into_publication_cron(self):
        index=(ROOT/"index.ts").read_text(encoding="utf-8")
        self.assertIn("await chatgptAutoImportHandler();",index)
        self.assertIn("await confirmChatGPTPublications();",index)
        cron=index.split("export const v14VerificationHandler",1)[1].split("export const v15VerificationRecoveryHandler",1)[0]
        self.assertLess(cron.index("await chatgptAutoImportHandler();"),cron.index("advancePublicFeed(feedProjector)"))
        self.assertGreater(cron.index("await confirmChatGPTPublications();"),cron.index("advancePublicFeed(feedProjector)"))

    def test_worksite_one_time_repair_uses_correct_source_tables_and_audit(self):
        script=(ROOT/"territory-repair.ts").read_text(encoding="utf-8")
        index=(ROOT/"index.ts").read_text(encoding="utf-8")
        source=(ROOT/"free-public-sources.ts").read_text(encoding="utf-8")
        importer=(ROOT/"chatgpt-direct-import.ts").read_text(encoding="utf-8")
        self.assertIn("const table='radar_external_'+hash.slice(0,32)",script)
        self.assertIn("if:{externalVerifiedAt:existing.externalVerifiedAt}",script)
        self.assertIn("territory_repair_audit",script)
        self.assertIn("WORKSITE_SAFE_REPAIR",script)
        self.assertIn("await repairApprovedTerritoriesOnce();",index)
        self.assertIn("'audited_original_worksite'",source)
        self.assertIn("const table='radar_external_'+externalHash.slice(0,32)",importer)
        self.assertIn("sourceTable:table",importer)

    def test_chatgpt_importer_confirms_corrected_location_and_official_open_lease(self):
        importer=(ROOT/"chatgpt-direct-import.ts").read_text(encoding="utf-8")
        bridge=(ROOT/"chatgpt-auto-import.ts").read_text(encoding="utf-8")
        retention=(ROOT/"offer-retention.ts").read_text(encoding="utf-8")
        for item in ("strictUndatedOpen","openOfficialEvidenceValidUntil",
                     "territory_reconciled","expectedWorkCommunes"):
            self.assertIn(item,importer)
        self.assertIn("territory_reconciled",bridge)
        self.assertIn("expectedWorkCommunes",bridge)
        self.assertIn("verified_open_official_source_needs_fresh_evidence",retention)

    def test_feed_preserves_original_worksite_against_newer_portal_city(self):
        self.assertIn("preserveVerifiedTerritory", self.feed)
        self.assertIn("workLocationEvidence", self.feed)
        self.assertIn("priorSites.length>0", self.feed)

    def test_staged_verifier_rejects_expiry_and_false_victoria(self):
        verifier=(ROOT/"public-source-verifier.ts").read_text(encoding="utf-8")
        self.assertIn("genuineWorksitePlaceMention",verifier)
        self.assertIn("nueva",verifier)
        self.assertIn("este anuncio ha expirado",verifier)

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



    def test_omil_flexible_import_is_limited_to_official_open_source(self):
        importer=(ROOT/"chatgpt-direct-import.ts").read_text(encoding="utf-8")
        self.assertIn("original_no_informada_municipal_abierta",importer)
        self.assertIn("oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos",importer)
        self.assertIn("municipal_open_index_url",importer)
        self.assertIn("officialMunicipalIndexStatus",importer)
        self.assertIn("review_expired",importer)
        self.assertIn("sourceOriginalDateUnreported:true",importer)
        self.assertIn("sourcePublishedAt:x.fecha_publicacion",importer)
        self.assertIn("Fecha original no informada",importer)
        self.assertIn("municipalOpenEvidenceValidUntil",importer)

    def test_omil_open_lease_has_refresh_and_confirmed_close(self):
        importer=(ROOT/"chatgpt-direct-import.ts").read_text(encoding="utf-8")
        retention=(ROOT/"offer-retention.ts").read_text(encoding="utf-8")
        index=(ROOT/"index.ts").read_text(encoding="utf-8")
        self.assertIn("revalidateOfficialMunicipalOpenOffers",importer)
        self.assertIn("confirmed_official_index_closed",importer)
        self.assertIn("revalidateOfficialMunicipalOpenOffers",index)
        self.assertIn("municipalOpenEvidenceValidUntil",index)
        self.assertIn("municipal_open_status_needs_fresh_evidence",retention)
        self.assertIn("municipalEvidenceExpired",self.feed)
        self.assertIn("!municipalEvidenceExpired",self.feed)


    def test_cmpc_duplicate_repair_is_guarded_and_idempotent(self):
        repair=(ROOT/"territory-repair.ts").read_text(encoding="utf-8")
        index=(ROOT/"index.ts").read_text(encoding="utf-8")
        self.assertIn("CMPC_BAD_ID = 'chatgpt_d_1a99f7fd5b8b9d116634'",repair)
        self.assertIn("CMPC_OFFICIAL_ID = 'chatgpt_d_910ceee091936904696e'",repair)
        self.assertIn("19427?c=cmpc",repair)
        self.assertIn("3934867",repair)
        self.assertIn("flags(bad,'aggregator','Purén')",repair)
        self.assertIn("flags(official,'ats','Collipulli')",repair)
        self.assertIn("officialSource(row?.url,source)",repair)
        self.assertIn("/requisition\\/19427",repair)
        self.assertIn("source_or_official_guard_failed",repair)
        self.assertIn("if:{ active:true, verified:true, url:String(bad.url) }",repair)
        self.assertIn("db.tx.add('public_feed_changes'",repair)
        self.assertIn("db.tx.add('territory_repair_audit'",repair)
        self.assertIn("closureReason:'administrative_semantic_duplicate'",repair)
        self.assertIn("status:'administrative_closure_requeued'",repair)
        self.assertIn("archiveReason:'semantic_duplicate_of_official_ats'",repair)
        self.assertIn("if (bad.closureReason === 'administrative_semantic_duplicate')",repair)
        self.assertIn("db.tx.update('radar_jobs'",repair)
        feed=(ROOT/"public-feed.ts").read_text(encoding="utf-8")
        self.assertIn("!/confirmed|explicit|administrative|owner_request/.test(closure)",feed)
        self.assertIn("const closure=String(record.closureReason||'')",feed)
        self.assertIn("await db.transact(changes)",repair)
        self.assertIn("await archiveMislocatedCmpcDuplicateOnce();",index)
        cron=index.split("export const v14VerificationHandler",1)[1].split("export const v15VerificationRecoveryHandler",1)[0]
        self.assertLess(cron.index("await archiveMislocatedCmpcDuplicateOnce();"),
                        cron.index("advancePublicFeed(feedProjector)"))

    def test_explicit_sublocality_blocks_wrong_work_commune(self):
        source=(ROOT/"chatgpt-direct-import.ts").read_text(encoding="utf-8")
        self.assertIn("{name:'mininco',commune:'Collipulli'}",source)
        self.assertIn("{name:'coihue',commune:'Negrete'}",source)
        self.assertIn("{name:'capitan pastene',commune:'Lumaco'}",source)
        self.assertIn("!(communes as string[]).includes(commune)",source)

if __name__ == "__main__":
    unittest.main()
