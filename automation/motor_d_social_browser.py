"""Trabajo Cerca: lectura visual de perfiles sociales públicos mediante Playwright.
Respeta robots.txt y controles de acceso. No usa sesión, proxies ni servicios pagos.
Nunca deduce que una oferta fue capturada sin evidencia textual recuperada.
"""
import asyncio
import json
import re
import urllib.error
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urljoin
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

SOURCES = [
    {"name":"OMIL Angol Instagram","url":"https://www.instagram.com/omilangol2026/","priority":"critical"},
    {"name":"Radio Nativa Instagram","url":"https://www.instagram.com/radionativacl/","priority":"normal"},
    {"name":"Municipalidad Angol Facebook","url":"https://www.facebook.com/municipalidad.angol/","priority":"critical"},
    {"name":"Radio Nativa Facebook","url":"https://www.facebook.com/RadioNativaCl/","priority":"normal"},
]
USER_AGENT = "TrabajoCercaPublicAudit/1.0"
POST_PATH = re.compile(r"^/(?:p|reel)/[A-Za-z0-9_-]+/?$|^/(?:posts|permalink)/[A-Za-z0-9._/-]+$")
JOB_HINT = re.compile(r"\b(?:empleo|laboral|vacante|postulaci[oó]n|se busca|se requiere|se necesita|contrataci[oó]n|operador|chofer|albañil|mec[aá]nic|el[eé]ctric|capataz|supervisor)\b",re.I)
GATE = re.compile(r"(?:inicia sesi[oó]n|log in|sign in|login_required|checkpoint_required|entrar en facebook)", re.I)
REPORT = Path("automation/motor_d_discovery/social_browser_status.json")

def robots_permission(url):
    parsed=urlsplit(url)
    if parsed.scheme!="https" or parsed.hostname not in ("www.instagram.com","www.facebook.com"):
        return False,"host_not_allowed"
    try:
        req=urllib.request.Request(f"https://{parsed.hostname}/robots.txt",
                                  headers={"User-Agent":USER_AGENT})
        with urllib.request.urlopen(req,timeout=12) as response:
            if response.status!=200:return False,f"robots_http_{response.status}"
            raw=response.read(320001)
        if len(raw)>320000:return False,"robots_too_large"
        parser=urllib.robotparser.RobotFileParser()
        parser.parse(raw.decode("utf-8","replace").splitlines())
        return (True,"robots_permitted") if parser.can_fetch(USER_AGENT,url) else (False,"robots_disallowed")
    except urllib.error.HTTPError as ex:
        return False,f"robots_http_{ex.code}"
    except Exception as ex:
        return False,"robots_error_"+type(ex).__name__

async def inspect(browser, source):
    result={"name":source["name"],"url":source["url"],"priority":source["priority"],
            "checked_at":datetime.now(timezone.utc).isoformat(),"status":"untested",
            "http_status":None,"posts_found":0,"posts_opened":0,"images_seen":0,
            "poster_images_read":0,"jobs_extracted":0,"posts":[],"errors":[]}
    allowed,reason=await asyncio.to_thread(robots_permission,source["url"])
    result["robots"]=reason
    if not allowed:
        result["status"]="blocked_by_robots_or_unavailable"
        return result
    context=await browser.new_context(user_agent=USER_AGENT,viewport={"width":1280,"height":850},locale="es-CL")
    page=await context.new_page()
    try:
        response=await page.goto(source["url"],wait_until="domcontentloaded",timeout=20000)
        result["http_status"]=response.status if response else None
        if response and response.status in (401,403,406,429):
            result["status"]="http_access_restricted";return result
        await page.wait_for_timeout(1000)
        body=(await page.locator("body").inner_text(timeout=6000))[:12000]
        if GATE.search(body[:1800]):
            result["status"]="login_required";return result
        hrefs=await page.locator("a[href]").evaluate_all("(nodes)=>nodes.map(n=>n.getAttribute('href')).filter(Boolean).slice(0,300)")
        postlinks=[]
        for href in hrefs:
            full=urljoin(source["url"],href)
            parsed=urlsplit(full)
            if parsed.hostname not in ("www.instagram.com","instagram.com","www.facebook.com","facebook.com"):continue
            if POST_PATH.match(parsed.path):
                normalized=f"https://{parsed.hostname}{parsed.path.rstrip('/')}/"
                if normalized not in postlinks:postlinks.append(normalized)
        result["posts_found"]=len(postlinks)
        if not postlinks:
            result["status"]="profile_loaded_no_public_posts"
            return result
        # Respetar robots también para cada publicación. No extraer contenido de rutas restringidas.
        for url in postlinks[:3]:
            ok,post_reason=await asyncio.to_thread(robots_permission,url)
            if not ok:
                result["posts"].append({"url":url,"status":"post_access_disallowed","reason":post_reason})
                continue
            postpage=await context.new_page()
            try:
                resp=await postpage.goto(url,wait_until="domcontentloaded",timeout=15000)
                if not resp or resp.status in (401,403,406,429):
                    result["posts"].append({"url":url,"status":"restricted","http":resp.status if resp else None})
                    continue
                await postpage.wait_for_timeout(600)
                post_text=(await postpage.locator("body").inner_text(timeout=5000))[:8000]
                if GATE.search(post_text[:1400]):
                    result["posts"].append({"url":url,"status":"login_required"})
                    continue
                images=await postpage.locator("img").evaluate_all("(nodes)=>nodes.slice(0,30).map(n=>({alt:(n.alt||'').slice(0,1000),src:n.currentSrc||n.src})).filter(x=>x.src)")
                poster_alt=[x["alt"] for x in images if JOB_HINT.search(x["alt"])]
                evidence_text=post_text[:2500]
                qualified=bool(JOB_HINT.search(evidence_text) or poster_alt)
                result["posts_opened"]+=1
                result["images_seen"]+=len(images)
                # Imágenes renderizadas pero no descargadas ni procesadas por OCR.
                result["posts"].append({"url":url,"status":"public_text_evidence" if qualified else "public_post_no_job_evidence",
                                        "image_count":len(images),"job_hint":qualified,
                                        "text_excerpt":evidence_text[:700] if qualified else "",
                                        "poster_alt_excerpt":poster_alt[:2]})
                if qualified:result["jobs_extracted"]+=1
            except (PlaywrightTimeout,Exception) as exc:
                result["posts"].append({"url":url,"status":"read_error","detail":type(exc).__name__})
            finally:
                await postpage.close()
        result["status"]="public_posts_read" if result["posts_opened"] else "posts_found_not_read"
    except (PlaywrightTimeout,Exception) as exc:
        result["status"]="browser_error"
        result["errors"].append(type(exc).__name__)
    finally:
        await context.close()
    return result

async def main():
    REPORT.parent.mkdir(parents=True,exist_ok=True)
    output={"schema":"trabajo-cerca.social-playwright.v1",
            "checked_at":datetime.now(timezone.utc).isoformat(),
            "method":"Playwright Chromium; robots precheck; public pages only; no login/proxies",
            "results":[],"captured_job_posters":0,"automatic_publications":0}
    async with async_playwright() as playwright:
        browser=await playwright.chromium.launch(headless=True)
        try:
            for source in SOURCES:
                result=await inspect(browser,source)
                output["results"].append(result)
                print("SOCIAL_BROWSER_SOURCE "+json.dumps({"source":result["name"],"status":result["status"],
                    "posts_found":result["posts_found"],"posts_opened":result["posts_opened"],
                    "jobs_extracted":result["jobs_extracted"]},ensure_ascii=False),flush=True)
        finally:
            await browser.close()
    REPORT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    summary={"sources_checked":len(output["results"]),
             "accessible_sources":sum(x["status"]=="public_posts_read" for x in output["results"]),
             "post_pages_read":sum(x["posts_opened"] for x in output["results"]),
             "posters_ocr_read":0,
             "offers_identified_from_text":sum(x["jobs_extracted"] for x in output["results"]),
             "offers_published":0}
    print("SOCIAL_BROWSER_SUMMARY "+json.dumps(summary),flush=True)

if __name__=="__main__":
    asyncio.run(main())
