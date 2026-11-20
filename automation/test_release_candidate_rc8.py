#!/usr/bin/env python3
"""Read-only checks for TC RC8. Never deploy here."""
from pathlib import Path
import json,unittest,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/"docs/releases/TRABAJO_CERCA_CONSOLIDATED_RC8_APPDEPLOY_FILES.json"
STAGES={"src/App.tsx":"appdeploy_staging_ui/src/App.tsx",
        "src/administrator-access.tsx":"appdeploy_staging_ui/src/administrator-access.tsx"}
class ReleaseRC8(unittest.TestCase):
  @classmethod
  def setUpClass(cls):
    cls.m=json.loads(MANIFEST.read_text())
    cls.by={e["filename"]:e for e in cls.m["files"]}
  def test_manifest_pins_exact_baseline_and_no_data_migrations(self):
    self.assertEqual(self.m["baseline_snapshot"],"1795136804449")
    self.assertEqual(self.m["app_id"],"trabajo-cerca-laboratorio-3ojgro")
    self.assertEqual(len(self.by),12)
    self.assertEqual(len(self.m["files"]),12)
    self.assertNotIn("backend/index.ts",self.by)
    self.assertFalse(any(x.startswith("backend/") for x in self.by))
    self.assertFalse(any(x.startswith("tests/") for x in self.by))
    self.assertFalse(any(x.startswith("shared/") for x in self.by))
  def test_official_vector_assets_and_pwa(self):
    for name in ("trabajo-cerca-oficial.svg","trabajo-cerca-simbolo.svg"):
      path="public/brand/"+name
      src=ROOT/path
      self.assertTrue(src.exists())
      svg=ET.fromstring(src.read_text())
      self.assertEqual(svg.tag,"{http://www.w3.org/2000/svg}svg")
      self.assertIn("Trabajo Cerca",src.read_text())
      self.assertEqual(self.by[path]["content"],src.read_text())
    manifest=json.loads((ROOT/"appdeploy_staging_public/public/manifest.webmanifest").read_text())
    self.assertEqual(len(manifest["icons"]),1)
    self.assertEqual(manifest["icons"][0]["src"],"./brand/trabajo-cerca-oficial.svg")
    self.assertEqual(manifest["start_url"],"./")
    sw=(ROOT/"appdeploy_staging_public/public/sw.js").read_text()
    self.assertIn("trabajo-cerca-shell-brand-20261120",sw)
    self.assertIn("brand/trabajo-cerca-oficial.svg",sw)
    shell=(ROOT/"appdeploy_staging_ui/index.html").read_text()
    self.assertIn("tcBrandSplash",shell)
    self.assertIn("./brand/trabajo-cerca-oficial.svg",shell)
    self.assertNotIn("href=\"./icon-192.png\"",shell)
  def test_administration_separate_url_and_server_access_preserved(self):
    main=(ROOT/"appdeploy_staging_ui/src/main.tsx").read_text()
    admin=(ROOT/"appdeploy_staging_ui/src/administrator-access.tsx").read_text()
    app=(ROOT/"appdeploy_staging_ui/src/App.tsx").read_text()
    self.assertIn("=== 'admin'",main)
    self.assertIn("<OperationsPanel /> : <App />",main)
    self.assertEqual(admin.count("href='./admin'"),2)
    self.assertIn("api.get('/api/admin/session')",admin)
    self.assertIn("if(active&&response.data?.administrator===true)",admin)
    self.assertIn("window.location.assign('./');",app)
    self.assertIn("CENTRO DE ADMINISTRACIÓN",app)
    self.assertNotIn("src='/icon-192.png'",app)
  def test_gallery_editor_validation_and_mobile_overflow(self):
    e=(ROOT/"appdeploy_staging_ui/src/commercial-overview.tsx").read_text()
    c=(ROOT/"appdeploy_staging_ui/src/commercial-slides.tsx").read_text()
    css=(ROOT/"appdeploy_staging_ui/src/ux-admin-brand-hotfix.css").read_text()
    self.assertIn("normalizedSlides",e)
    self.assertIn("Completa el título y la descripción",e)
    self.assertIn("api.put('/api/admin/marketing/campaigns/details',payload)",e)
    self.assertIn("setFailedSrc",c)
    self.assertIn("tcCommercialSlideMissing",c)
    self.assertIn("@media(max-width:720px)",css)
    self.assertIn("tcEditorSaveBar{position:static!important",css)
    self.assertIn("tcBIChartHead{flex-direction:column!important",css)
    self.assertIn("tcCommercialVisual",css)
    self.assertIn("object-fit:contain",css)
    self.assertIn(".tcBootShell.tcBrandSplash",css)
  def test_only_source_files_are_changed_not_original_data(self):
    self.assertTrue(all(e.get("content") or e.get("diffs") for e in self.by.values()))
    self.assertEqual(self.by["src/App.tsx"]["diffs"][1]["multiple"],True)
    self.assertEqual(self.by["src/administrator-access.tsx"]["diffs"][0]["multiple"],True)
    self.assertNotIn("src/house-advertising.tsx",self.by)
    self.assertNotIn("backend/house-marketing.ts",self.by)
if __name__=="__main__":unittest.main(verbosity=2)
