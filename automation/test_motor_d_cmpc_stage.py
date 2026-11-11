"""Prove that CMPC browser evidence, not a stale file, reaches AppDeploy."""
import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from stage_cmpc_approved_batch import build,main

NOW=datetime(2026,11,11,18,0,tzinfo=timezone.utc)
URL="https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/19249?c=cmpc"
TITLE="INSTRUMENTISTA AREA"
CARD="INSTRUMENTISTA AREA\n\nNacimiento, REGION DEL BIOBIO, Chile\n\n28/10/2026"

def fixture():
    approved={"schema_version":1,"approval":"approved_for_publication",
              "producer":"motor_d_cmpc_browser","batch_id":"motor-d-cmpc-1234567890abcdef",
              "offers":[{"id_fuente":"cmpc_19249","cargo":TITLE,"empresa":"CMPC",
                         "comunas":["Nacimiento"],"url_original":URL,
                         "fecha_publicacion":"2026-10-28","fecha_cierre":None}]}
    page={"url":URL,"cargo":TITLE,"ficha_accessible":True,
          "evidencia_tarjeta":CARD,"ficha_excerpt":("Requisitos. Responsabilidades y postular para la planta Santa Fe. "*4),
          "ficha_checked_at":NOW.isoformat()}
    browser={"fuente":"CMPC Cornerstone","checked_at":NOW.isoformat(),
             "state":"individual_links_found","individual_details":[page]}
    index={"schema_version":1,"batches":[],"seen_offer_ids":[]}
    return approved,browser,index

class CmpcBridgeTests(unittest.TestCase):
    def test_new_verified_official_offer_stages_into_real_index(self):
        approved,browser,index=fixture()
        relative,batch,new_index=build(approved,browser,index,NOW)
        self.assertRegex(relative,r"^20261111/motor-d-20261111-[a-f0-9]{18}.json$")
        self.assertEqual(batch["approval"],"approved_for_publication")
        self.assertEqual(batch["producer"],"motor_d_territorial")
        self.assertEqual(batch["batch_type"],"recovery")
        self.assertEqual(batch["offers"][0]["comunas"],["Nacimiento"])
        self.assertEqual(batch["offers"][0]["fecha_publicacion"],"2026-10-28")
        self.assertEqual(batch["offers"][0]["fecha_descubrimiento"],"2026-11-11")
        self.assertEqual(len(new_index["batches"]),1)
        self.assertIn(batch["offers"][0]["id_fuente"],new_index["seen_offer_ids"])
        self.assertTrue(batch["offers"][0]["id_fuente"].startswith("d_"))
        self.assertEqual(len(batch["offers"][0]["id_fuente"]),22)

    def test_repeated_official_scan_does_not_duplicate(self):
        approved,browser,index=fixture()
        relative,batch,next_index=build(approved,browser,index,NOW)
        self.assertIsNone(build(approved,browser,next_index,NOW))

    def test_stale_browser_capture_does_not_publish(self):
        approved,browser,index=fixture()
        browser["checked_at"]="2026-11-09T17:59:00+00:00"
        with self.assertRaisesRegex(ValueError,"stale_official_browser"):
            build(approved,browser,index,NOW)

    def test_current_index_but_old_individual_page_does_not_publish(self):
        approved,browser,index=fixture()
        browser["individual_details"][0]["ficha_checked_at"]="2026-11-09T17:59:00+00:00"
        with self.assertRaisesRegex(ValueError,"stale_cmpc_individual"):
            build(approved,browser,index,NOW)

    def test_missing_individual_detail_fails_closed(self):
        approved,browser,index=fixture()
        browser["individual_details"]=[]
        with self.assertRaisesRegex(ValueError,"cmpc_offer_not_currently_accessible"):
            build(approved,browser,index,NOW)

    def test_date_or_workplace_tampering_fails_closed(self):
        approved,browser,index=fixture()
        approved["offers"][0]["fecha_publicacion"]="2026-11-10"
        with self.assertRaisesRegex(ValueError,"cmpc_original_date"):
            build(approved,browser,index,NOW)
        approved,browser,index=fixture()
        approved["offers"][0]["comunas"]=["Angol"]
        with self.assertRaisesRegex(ValueError,"cmpc_workplace_differs"):
            build(approved,browser,index,NOW)

    def test_non_cmpc_source_cannot_hijack_bridge(self):
        approved,browser,index=fixture()
        approved["offers"][0]["url_original"]="https://example.org/requisition/19249?c=cmpc"
        with self.assertRaisesRegex(ValueError,"cmpc_identity_mismatch"):
            build(approved,browser,index,NOW)

    def test_closed_offer_cannot_be_staged(self):
        approved,browser,index=fixture()
        browser["individual_details"][0]["ficha_excerpt"]+="\nPOSTULACIONES CERRADAS"
        with self.assertRaisesRegex(ValueError,"cmpc_source_closed"):
            build(approved,browser,index,NOW)

    def test_missing_approved_file_makes_no_writes(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            (root/"ready").mkdir()
            (root/"ready"/"index.json").write_text('{"schema_version":1,"batches":[],"seen_offer_ids":[]}')
            import sys
            from contextlib import redirect_stdout
            import io
            old=sys.argv
            sys.argv=["stage_cmpc_approved_batch","--approved",str(root/"missing.json"),
                      "--browser",str(root/"missing-browser.json"),"--root",str(root/"ready")]
            try:
                with redirect_stdout(io.StringIO()) as out:main()
            finally:sys.argv=old
            self.assertIn("no_current_official_approvals",out.getvalue())
            self.assertEqual(len(list((root/"ready").glob("**/*.json"))),1)

if __name__=="__main__":
    unittest.main()
