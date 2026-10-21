"""Passive production audit: public browser/resources only; never submits forms or runs collectors."""
import asyncio
import json
import os
import shutil
from pathlib import Path
from .common import utcnow, write_json

URL='https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/'

async def observe():
    from playwright.async_api import async_playwright
    environment={k:v for k,v in os.environ.items() if k not in ('GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL')}
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),headless=True,env=environment)
        try:
            page=await browser.new_page(viewport={'width':390,'height':844})
            response=await page.goto(URL,wait_until='domcontentloaded',timeout=30000)
            await page.wait_for_selector('article.neoJobCard',timeout=60000)
            headers=await response.all_headers()
            security={name:headers.get(name) for name in ('content-security-policy','strict-transport-security','x-frame-options','x-content-type-options','referrer-policy','permissions-policy','cache-control')}
            resources={}
            for name in ('manifest.webmanifest','sw.js','icon-192.png','icon-512.png','icon-maskable-512.png','robots.txt','sitemap.xml'):
                item=await page.request.get(URL+name)
                resources[name]={'status':item.status,'mime':item.headers.get('content-type'),'bytes':len(await item.body())}
            accessibility=await page.evaluate('''() => ({
                unnamedButtons:[...document.querySelectorAll('button')].filter(e=>e.getBoundingClientRect().width && !(e.textContent.trim() || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title)).map(e=>({className:e.className,html:e.outerHTML.slice(0,300)})),
                missingImageAlt:[...document.querySelectorAll('img:not([alt])')].length,
                horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
                title:document.title,
                description:document.querySelector('meta[name=description]')?.content || null,
                canonical:document.querySelector('link[rel=canonical]')?.href || null,
                serviceWorkerAvailable:'serviceWorker' in navigator,
                navigation:performance.getEntriesByType('navigation').map(n=>({domContentLoadedMs:n.domContentLoadedEventEnd,responseMs:n.responseEnd}))
            })''')
            await page.get_by_role('button',name='Privacidad',exact=True).click()
            modal=page.locator('.legalModal')
            privacy=await modal.inner_text()
            focusInside=await modal.evaluate('(e)=>e.contains(document.activeElement)')
            await page.keyboard.press('Escape')
            escapeCloses=not await modal.is_visible()
            if not escapeCloses:await modal.get_by_role('button',name='Cerrar',exact=True).click()
            return {'checked_at':utcnow().isoformat(),'http_status':response.status,'headers':security,'resources':resources,
                'accessibility_sample':accessibility,'privacy_text':privacy,'privacy_modal_focus_on_open_inside':focusInside,
                'privacy_modal_escape_closes':escapeCloses,'scope':'passive_public_browser_chromium_mobile',
                'dangerous_operational_routes_called':False,'forms_submitted':0,'collector_calls':0}
        finally:await browser.close()

if __name__=='__main__':
    report=asyncio.run(observe())
    write_json(Path('output/site-inventory/production-readiness.json'),report)
    print('PRODUCTION_READINESS_PROOF '+json.dumps(report,ensure_ascii=False),flush=True)
