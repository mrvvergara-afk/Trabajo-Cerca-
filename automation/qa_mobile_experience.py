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
        page.locator("main.neoShell").wait_for(state="visible",timeout=45000)
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
        try:
            page.wait_for_function(
                "() => /[0-9]+ resultados del catálogo/.test(document.body.innerText)",timeout=35000)
            record("mobile_complete_catalog_counter",True)
            try:
                page.wait_for_function(
                  "() => /[0-9]+ resultados del catálogo/.test(document.querySelector('.tcCatalogCount')?.innerText||'')",
                  timeout=30000)
                page.wait_for_timeout(700)
                cached=page.evaluate("""() => {
                    const raw=localStorage.getItem('tc_public_verified_radar_v1');
                    if(!raw)return null;
                    const c=JSON.parse(raw);
                    const first=c.items?.[0]||{};
                    return {count:c.items?.length||0,
                      noPrivateFields:c.items.every(row=>
                         !('contact' in row)&&!('phone' in row)&&!('email' in row)&&
                         !('ownerToken' in row)&&row.origin==='radar'&&row.kind==='job_offer'),
                      keys:Object.keys(first).slice(0,16)}
                }""")
                record("mobile_public_job_cache_sanitized",
                       cached is not None and cached["count"]>0 and cached["noPrivateFields"],
                       cache=cached)
            except Exception as e:
                record("mobile_public_job_cache_sanitized",False,error=str(e)[:260])
        except PlaywrightTimeoutError:
            record("mobile_complete_catalog_counter",False,
                catalog_label=page.locator(".tcCatalogCount").first.inner_text() if page.locator(".tcCatalogCount").count() else "missing",
                excerpt=page.locator("main").inner_text()[-250:])
        # Inspect editorial own promotion. Absence is an explicit not-verified condition,
        # not a false successful gallery test: a paid campaign may own the featured slot.
        gallery=page.locator(".tcInlineHousePromo .tcInlineGalleryControls")
        try:
            gallery.first.wait_for(state="visible",timeout=14000)
            gallery.scroll_into_view_if_needed()
            image=gallery.locator("xpath=..").locator("img.tcHouseFallbackThumb").first
            original=image.get_attribute("src")
            button=gallery.get_by_role("button",name="Ver imagen 2 de 6").first
            button.click(timeout=5000)
            selected=button.get_attribute("aria-pressed")
            image_now=image.get_attribute("src")
            record("mobile_manual_house_gallery",selected=="true" and original!=image_now,
                selected=selected,original=original,current=image_now)
            six=gallery.get_by_role("button",name="Ver imagen 6 de 6").first
            six.click(timeout=5000)
            record("mobile_six_images_accessible",
                six.get_attribute("aria-pressed")=="true",
                displayed=image.get_attribute("src"))
            # Visual number is hidden; the active control is a small CSS dot.
            style=page.evaluate("""() => {
              const c=document.querySelector('.tcInlineGalleryControls');
              const b=c?.querySelector('button');
              if(!b)return null;
              return {font:getComputedStyle(b).fontSize,
                dot:getComputedStyle(b,'::after').width,
                image:document.querySelector('.tcInlineHousePromo img.tcHouseFallbackThumb')?.getAttribute('src'),
                title:document.querySelector('.tcInlineHousePromo .tcInlineHouseCopy strong')?.innerText};
            }""")
            record("mobile_six_dots_without_numbers",
                style is not None and style["font"]=="0px" and
                float(style["dot"].replace("px",""))<=16,
                style=style)
            # Every non-initial art frame must match its own messaging.
            story_expectations={
              "explore.svg":"Lo que buscas puede estar cerca.",
              "professionals.svg":"Haz visible tu experiencia.",
              "inclusion.svg":"Muestra lo que sabes hacer.",
              "local-business.svg":"Que elijan tu negocio local.",
              "advertisers.svg":"Tu anuncio puede contar más.",
              "employers.svg":"¿Necesitas contratar?"
            }
            current=style["image"].split("/")[-1]
            expected=story_expectations.get(current)
            record("mobile_story_matches_artwork",
                bool(expected) and expected==style["title"],
                artwork=current,expected=expected,actual=style["title"])
            page.screenshot(path=str(OUTPUT/"mobile_gallery.png"),full_page=False)
        except PlaywrightTimeoutError:
            record("mobile_manual_house_gallery",False,
              reason="visible own-promotion gallery not found in initial mobile inventory")
        except Exception as err:
            record("mobile_manual_house_gallery",False,error=str(err)[:180])

        try:
            gateway_button=page.get_by_role("button",name="Directorio",exact=True).first
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
            try:
                directory.get_by_text("Cargando directorio local…").wait_for(
                    state="hidden",timeout=35000)
                text=directory.inner_text()
                record("mobile_directory_fetch_settled",
                  "No se pudo consultar el directorio" not in text and
                  "Cargando directorio local" not in text,
                  text_tail=text[-280:])
            except PlaywrightTimeoutError:
                record("mobile_directory_fetch_settled",False,
                   reason="directory remained loading beyond 35 seconds")
            page.screenshot(path=str(OUTPUT/"mobile_directory.png"),full_page=False)
            after=page.evaluate("""() => ({
              viewport:innerWidth,doc:document.documentElement.scrollWidth
            })""")
            record("mobile_directory_horizontal_overflow",
                   after["doc"]<=after["viewport"]+5,**after)
        except Exception as exc:
            record("mobile_directory_interaction",False,error=str(exc)[:270])
    # Account entry must be visible in BOTH desktop web and installed-style mobile UX.
    # Anonymous browser only: do NOT authenticate or submit credentials.
    try:
        site_menu=page.locator(".tcSiteMenu")
        site_menu.locator("summary").click(timeout=8000)
        panel=site_menu.locator(".tcSiteMenuPanel")
        panel.wait_for(state="visible",timeout=5000)
        account=panel.get_by_role("region",name="Mi cuenta")
        account.wait_for(state="visible",timeout=15000)
        login=account.get_by_role("button",name="Iniciar sesión")
        login.wait_for(state="visible",timeout=16000)
        page.wait_for_function("""() => {
          const login=document.querySelector('.tcSiteMenuPanel .tcAccountMenu button');
          return Boolean(login)&&!login.disabled;
        }""",timeout=15000)
        entry=account.get_by_role("link",name="Acceso administrativo")
        entry.wait_for(state="visible",timeout=9000)
        record(label+"_admin_account_entry_visible", login.is_visible() and entry.is_visible(),
            login_enabled=login.is_enabled(),admin_link=entry.get_attribute("href"))
        no_new_tab=entry.get_attribute("target") in (None,"","_self")
        record(label+"_admin_link_same_tab",no_new_tab)
        entry.click(timeout=9000)
        page.wait_for_url("**?panel=administracion",timeout=15000)
        restricted=page.get_by_role("heading",name="Acceso administrativo")
        restricted.wait_for(state="visible",timeout=15000)
        record(label+"_admin_route_restricted",
            restricted.is_visible() and
            page.get_by_text("Acceso restringido",exact=True).is_visible() and
            page.get_by_role("button",name="Ingresar como administrador").is_visible())
        page.screenshot(path=str(OUTPUT/(label+"_admin_login.png")),full_page=False)
    except Exception as exc:
        record(label+"_admin_menu_workflow",False,error=str(exc)[:280])
    context.close()

def carousel_motion_check(browser, label, reduced, expect_motion):
    """Isolated read-only browser, no account/metric writes, one promo only."""
    context=browser.new_context(viewport={"width":360,"height":780},
      device_scale_factor=2,locale="es-CL",is_mobile=True,has_touch=True,
      reduced_motion=reduced,service_workers="block")
    context.add_init_script("localStorage.setItem('tc_analytics_consent','no');")
    context.route("**/*",suppress_metric_writes)
    page=context.new_page()
    try:
        page.goto(WEB,wait_until="domcontentloaded",timeout=60000)
        gallery=page.locator(".tcInlineHousePromo .tcInlineGalleryControls").first
        gallery.wait_for(state="visible",timeout=30000)
        gallery.scroll_into_view_if_needed()
        image=page.locator(".tcInlineHousePromo img.tcHouseFallbackThumb").first
        first=image.get_attribute("src")
        # Slow auto-advance is 5500ms. Allow a little time for browser scheduling.
        page.wait_for_timeout(6750)
        second=image.get_attribute("src")
        record(label+"_automatic_rotation",(first!=second)==expect_motion,
               original=first,after=second,reduced_motion=reduced)
        # The visible indicator must accept the manual action even with reduced motion.
        two=gallery.get_by_role("button",name="Ver imagen 2 de 6").first
        two.click()
        after_touch=image.get_attribute("src")
        page.wait_for_timeout(5950)
        record(label+"_manual_pauses_auto",image.get_attribute("src")==after_touch,
               selected=after_touch)
        if label=="mobile_motion_allowed":
            before=image.get_attribute("src")
            state=page.evaluate("""() => {
              const root=document.querySelector('.tcInlineHousePromo');
              const image=root.querySelector('img.tcHouseFallbackThumb');
              const a=new Touch({identifier:1,target:root,clientX:230,clientY:250});
              const b=new Touch({identifier:1,target:root,clientX:125,clientY:251});
              root.dispatchEvent(new TouchEvent('touchstart',{
                bubbles:true,cancelable:true,touches:[a],targetTouches:[a],changedTouches:[a]}));
              root.dispatchEvent(new TouchEvent('touchend',{
                bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[b]}));
              return {before:image.getAttribute('src')};
            }""")
            page.wait_for_timeout(200)
            after=image.get_attribute("src")
            record("mobile_swipe_to_next_image",after!=before,
                before=before,after=after,gesture_start=state.get("before"))
        page.screenshot(path=str(OUTPUT/(label+"_carousel.png")),full_page=False)
    except Exception as exc:
        record(label+"_carousel_test",False,error=str(exc)[:280])
    finally:
        context.close()

def main():
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(headless=True,args=["--no-sandbox"])
        try:
            do_browser(browser,"mobile",360,780)
            do_browser(browser,"desktop",1280,800)
            carousel_motion_check(browser,"mobile_motion_allowed","no-preference",True)
            carousel_motion_check(browser,"mobile_reduced_motion","reduce",False)
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
