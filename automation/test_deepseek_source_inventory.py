"""Keep DeepSeek's official source inventory aligned with configured sources.

This is a documentation guard: it does not crawl, verify or publish jobs.
"""
import json
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RADAR=ROOT/"automation"/"trabajo_cerca"/"fuentes_diarias.json"
AUDIT=ROOT/"automation"/"motor_d_audit_sources.json"
INVENTORY=ROOT/"docs"/"DEEPSEEK_ANEXO_INVENTARIO_FUENTES_20261109.md"
BRIEF=ROOT/"docs"/"DEEPSEEK_AUDITORIA_FUENTES_TRABAJO_CERCA_20261109.md"


class DeepseekSourcesDocumentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cfg=json.loads(RADAR.read_text(encoding="utf8"))
        cls.audit=json.loads(AUDIT.read_text(encoding="utf8"))
        cls.inventory=INVENTORY.read_text(encoding="utf8")
        cls.brief=BRIEF.read_text(encoding="utf8")

    def test_all_configured_radar_source_urls_appear_in_inventory(self):
        for kind in ("seed_urls","discovery","social_reference"):
            for item in self.cfg[kind]:
                with self.subTest(kind=kind,id=item["id"]):
                    self.assertIn(item["url"],self.inventory)

    def test_all_historical_audit_links_appear_in_inventory(self):
        for item in self.audit["seed_pages"]:
            with self.subTest(name=item["name"]):
                self.assertIn(item["url"],self.inventory)

    def test_live_territorial_sources_and_social_probe_are_listed(self):
        # Runtime seeds are generated from code and cover extra portals.
        from motor_d_territorial_daily import SEEDS,INDEED_SEEDS,COMMUNES
        from motor_d_social_sources import SOURCES
        # The 09-11 historical appendix documents the first 44 legacy seeds.
        # The live roster now adds verified discovery pages and 12-commune A
        # portal families; NEVER cap it at the old snapshot length.
        self.assertGreater(len(SEEDS),44)
        self.assertGreaterEqual(len(SEEDS)+len(INDEED_SEEDS),170)
        self.assertEqual(len(INDEED_SEEDS),12)
        self.assertEqual(len(COMMUNES),12)
        for name,group in (("SEEDS · corte 09-11",SEEDS[:44]),("INDEED_SEEDS",INDEED_SEEDS)):
            for city,source,url in group:
                with self.subTest(group=name,source=source,commune=city):
                    self.assertIn(url,self.inventory)
        # New source onboarding belongs in the live registry, not the old
        # appendix. The contract protects new entries from being forgotten.
        from motor_d_source_registry import plan,load_data,HERE
        live=plan(SEEDS,INDEED_SEEDS,social_refs=SOURCES)
        expected={row["url"] for row in self.cfg["discovery"]}
        actual={row["url"] for row in live["public"]}
        self.assertTrue(expected.issubset(actual))
        self.assertEqual(len(live["public"]),len({row["id"] for row in live["public"]}))
        contract=(ROOT/"automation"/"CONTRATO_COBERTURA_100_FUENTES.md").read_text(encoding="utf-8")
        for portal in ("Mipleo","Kitempleo","CMPC","ARAUCO","Brayben","SERFONAC"):
            self.assertIn(portal,contract)
        for social in SOURCES:
            with self.subTest(source=social["name"]):
                self.assertIn(social["url"],self.inventory)

    def test_twelve_communes_and_main_brief_reference(self):
        self.assertEqual(len(self.cfg["territories"]),12)
        self.assertNotIn("Quilaco",self.cfg["territories"])
        for commune in self.cfg["territories"]:
            self.assertIn("**"+commune+"**",self.inventory)
        self.assertIn("DEEPSEEK_ANEXO_INVENTARIO_FUENTES_20261109.md",self.brief)
        self.assertIn("fuentes configuradas",self.inventory)
        self.assertIn("no implica",self.inventory.lower())


if __name__=="__main__":
    unittest.main()
