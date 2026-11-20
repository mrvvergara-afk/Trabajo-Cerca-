#!/usr/bin/env python3
"""Read-only release guard for RC9. No backend, catalogue or advert writes."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
APP=(ROOT/'appdeploy_staging_ui/src/App.tsx').read_text()
MAIN=(ROOT/'appdeploy_staging_ui/src/main.tsx').read_text()
CSS=(ROOT/'appdeploy_staging_ui/src/ux-rc9-mobile.css').read_text()
class RC9(unittest.TestCase):
 def test_optional_analytics_default_off(self):
  self.assertIn("localStorage.getItem('tc_analytics_consent')||'no'",APP)
  self.assertIn("setAnalyticsChoice(choice)",APP)
  self.assertIn("localStorage.removeItem('tc_analytics_id')",APP)
  self.assertIn("analyticsChoice === null",APP)
  self.assertIn("Preferencias de medición",APP)
 def test_install_is_opt_in_and_never_forced(self):
  self.assertIn("!isStandalone && showInstallInvitation",APP)
  self.assertIn("tc_install_invite_dismissed",APP)
  self.assertIn("setShowInstallInvitation(false)",APP)
  self.assertIn("onClick={()=>void installApp()}",APP)
  self.assertIn("!isStandalone && <button type='button' className='tcShareInstallButton'",APP)
  self.assertIn("Abre el enlace para ver esta oferta",APP)
  self.assertIn("const url = listingShareUrl(window.location.href,item.id);",APP)
  self.assertIn("window.addEventListener('beforeinstallprompt'",APP)
 def test_full_location_names_in_header(self):
  self.assertIn("tcMobilePlaceValue",APP)
  self.assertIn("grid-template-rows:40px 39px",CSS)
  self.assertIn("grid-column:1/-1!important;grid-row:2!important",CSS)
  self.assertIn("width:100%!important;max-width:none!important",CSS)
  self.assertNotIn("text-overflow:ellipsis!important;white-space:nowrap!important}\n .tcStitchShell .tcMobilePlace",CSS)
 def test_paid_ads_grid_is_explicit(self):
  self.assertIn("grid-template-columns:clamp(86px,26vw,108px) minmax(0,1fr)",CSS)
  self.assertIn("tcAdContent.tcPremiumCommercial>.tcCommercialCopy",CSS)
  self.assertIn("grid-column:2!important;grid-row:1!important",CSS)
  self.assertIn("tcAdContent.tcPremiumCommercial>.tcCommercialAction",CSS)
  self.assertIn("grid-column:1/-1!important;grid-row:2!important",CSS)
  self.assertIn("object-fit:contain!important",CSS)
 def test_import_after_previous_css_and_no_backend_files(self):
  self.assertLess(MAIN.index("import './ux-admin-brand-hotfix.css'"),MAIN.index("import './ux-rc9-mobile.css'"))
  self.assertFalse(any('backend' in path for path in ['appdeploy_staging_ui/src/App.tsx','appdeploy_staging_ui/src/main.tsx','appdeploy_staging_ui/src/ux-rc9-mobile.css']))
if __name__=='__main__':unittest.main(verbosity=2)
