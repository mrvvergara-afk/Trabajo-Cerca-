#!/usr/bin/env python3
"""Mobile/desktop browser smoke for the public LAB. NO submissions, admin login, or persisted ad events."""
import json, os, re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

WEB = "https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/"
OUTPUT = Path("qa-browser-artifacts")
OUTPUT.mkdir(exist_ok=True)
checks = []

def record(name, ok, **extra):
    row={"check":name,"pass":bool(ok),**extra}
    checks.append(row)
    print("TC_BROWSER_QA "+json.dumps(row,ensure_ascii=False),flush=True)

def suppress_metric_writes(route):
    """Allow read-only navigation. Browser-generated marketing events are NOT written to live DB."""
    req=route.request
    url=req.url.lower()
    if req.method.upper() in ("POST","PUT","PATCH","DELETE"):
        if any(part in url for part in (
            "/api/growth/commercial-events","/api/growth/house-events",
            "/api/analytics", "/api/growth/events",
        )):
            route.fulfill(status=202,content_type="application/json",
                          body='{"received":true,"qaSynthetic":true}')
            return
        # No form mutation allowed in this smoke.
        route.fulfill(status=403,content_type="application/json",
                      body='{"error":"browser_qa_readonly"}')
        return
    route.continue_()

def do_browser(browser, label, width, height):
    context=browser.new_context(viewport={"width":width,"height":height},
      device_scale_factor=2 if label=="mobile" else 1,locale="es-CL",
      reduced_motion="reduce",service_workers="block")
    context.add_init_script("localStorage.setItem('tc_analytics_consent','no');")
    context.route("**/*",suppress_metric_writes)
    page=context.new_page()
    exceptions=[]
    page.on("pageerror",lambda err:exceptions.append(str(err)[:250]))
    start=time.monotonic()
    response=page.goto(WEB,wait_until="domcontentloaded",timeout=60000)
    try:
        page.locator(".tcPurposeGateway").wait_for(state="visible",timeout=60000)
        gateway=True
    except PlaywrightTimeoutError:
        gateway=False
    elapsed=round((time.monotonic()-start)*1000)
    diagnostics=page.evaluate("""() => ({
      ready:document.readyState,
      rootCharacters:document.querySelector('#root')?.innerText?.length||0,
      rootExcerpt:document.querySelector('#root')?.innerText?.slice(0,350)||'',
      mainCount:document.querySelectorAll('main').length,
      gatewayCount:document.querySelectorAll('.tcPurposeGateway').length,
      viewport:innerWidth,
      bodyExcerpt:document.body?.innerText?.slice(0,500)||'',
      overlay:!!document.querySelector('[data-appdeploy-overlay]')
    })""")
    record(label+"_first_navigation",gateway and response.status==200,
      http=response.status if response else None,visible_gateway=gateway,
      elapsed_ms=elapsed,diagnostics=diagnostics,page_errors=exceptions[:6])
    if not gateway:
        page.screenshot(path=str(OUTPUT/(label+"_failure.png")),full_page=False)
        (OUTPUT/(label+"_body_excerpt.txt")).write_text(page.content()[-6000:])
        context.close();return

    page.screenshot(path=str(OUTPUT/(label+"_home.png")),full_page=False)
    bounds=page.evaluate("""() => ({
        viewport:innerWidth,doc:document.documentElement.scrollWidth,
        nav:Math.round(performance.getEntriesByType('navigation')[0]?.responseStart||0),
        dom:Math.round(performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd||0)
    })""")
    record(label+"_horizontal_overflow",bounds["doc"]<=bounds["viewport"]+5,
      **bounds)
    record(label+"_javascript_uncaught",len(exceptions)==0,exceptions=exceptions[:8])

    if label=="mobile":
        # Inspect editorial own promotion. Absence is an explicit not-verified condition,
        # not a false successful gallery test: a paid campaign may own the featured slot.
        gallery=page.locator(".tcHouseAd.tcPremiumAd .tcHouseGalleryControls")
        try:
            gallery.first.wait_for(state="visible",timeout=14000)
            gallery.scroll_into_view_if_needed()
            button=gallery.locator("button[aria-label^='Imagen 2']").first
            button.click(timeout=5000)
            selected=button.get_attribute("aria-pressed")
            art=page.locator(".tcHouseAd.tcPremiumAd .tcHouseGalleryLabel").first.inner_text()
            record("mobile_manual_house_gallery",selected=="true" and "2/3" in art,
                selected=selected,visible_caption=art)
            page.screenshot(path=str(OUTPUT/"mobile_gallery.png"),full_page=False)
        except PlaywrightTimeoutError:
            record("mobile_manual_house_gallery",False,
              reason="featured HOUSE_AD not displayed or gallery is hidden in this inventory")
        except Exception as err:
            record("mobile_manual_house_gallery",False,error=str(err)[:180])

        try:
            gateway_button=page.locator(".tcPurposeGrid button").filter(
                has_text=re.compile("Servicios y negocios",re.IGNORECASE)).first
            gateway_button.click(timeout=9000)
            directory=page.locator("#local-directory")
            directory.wait_for(state="visible",timeout=30000)
            record("mobile_local_directory_opens",True)
            btn=directory.locator(".tcDirectorySavedControls button").first
            btn.click(timeout=9000)
            record("mobile_saved_favorites_filter",btn.get_attribute("aria-pressed")=="true")
            shops=directory.get_by_role("button",name="Negocios",exact=True)
            shops.click(timeout=9000)
            record("mobile_business_directory_tab",shops.get_attribute("aria-pressed")=="true")
            page.screenshot(path=str(OUTPUT/"mobile_directory.png"),full_page=False)
            after=page.evaluate("""() => ({
              viewport:innerWidth,doc:document.documentElement.scrollWidth
            })""")
            record("mobile_directory_horizontal_overflow",
                   after["doc"]<=after["viewport"]+5,**after)
        except Exception as exc:
            record("mobile_directory_interaction",False,error=str(exc)[:270])
    context.close()

def main():
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True,args=["--no-sandbox"])
        try:
            do_browser(browser,"mobile",360,780)
            do_browser(browser,"desktop",1280,800)
        finally:
            browser.close()
    report={"total":len(checks),"passed":sum(v["pass"] for v in checks),
      "failed":[v["check"] for v in checks if not v["pass"]],
      "note":"Browser navigation only; no owner actions or marketing writes; not load testing."}
    (OUTPUT/"report.json").write_text(json.dumps({"checks":checks,"summary":report},
                                           ensure_ascii=False,indent=2))
    print("TRABAJO_CERCA_BROWSER_QA "+json.dumps(report,ensure_ascii=False),flush=True)
    if report["failed"]:sys.exit(1)

if __name__=="__main__":main()
