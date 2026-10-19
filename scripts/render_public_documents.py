"""Read two municipal pages in a real browser without login or paid providers."""
import asyncio
import hashlib
import json
import os
import shutil
from pathlib import Path

from .common import Budget, write_json
from .local_source_audit import discover, source_error
from .public_document_http import PublicCapture, public_url

ROOTS = [('los-sauces','https://www.munilossauces.cl/noticias'),
         ('nacimiento','https://www.nacimiento.cl/noticias')]


async def main():
    from playwright.async_api import async_playwright
    output = Path('output/document-reader/rendered')
    output.mkdir(parents=True, exist_ok=False)
    capture = PublicCapture(output)
    results = []
    environment = {key:value for key,value in os.environ.items()
                   if key not in ('GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL')}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=shutil.which('google-chrome') or shutil.which('chromium'),
            headless=True, env=environment)
        try:
            for key, url in ROOTS:
                blocked = []
                budget = Budget(70)
                context = await browser.new_context(user_agent='TrabajoCercaLocalAudit/1.0')
                async def route_request(route):
                    target = route.request.url
                    try:
                        public_url(target)
                        allowed = await asyncio.to_thread(capture.allowed, target, budget)
                        if not allowed:
                            raise ValueError('public_source_robots_disallowed')
                        if route.request.resource_type in ('media','font','image'):
                            await route.abort()
                            return
                        await route.continue_()
                    except Exception as exc:
                        blocked.append({'url':target[:2000],'reason':source_error(exc)})
                        await route.abort()
                await context.route('**/*', route_request)
                page = await context.new_page()
                record = {'key':key,'url':url,'read_only':True,'paid_provider_calls':0,
                          'verified':False,'published':0,'coverage_complete':False}
                try:
                    if not await asyncio.to_thread(capture.allowed, url, budget):
                        raise ValueError('public_source_robots_disallowed')
                    raw, final, mime, status = await asyncio.to_thread(capture, url, budget)
                    record.update(http=status, original_html_sha256=hashlib.sha256(raw).hexdigest())
                    response = await page.goto(url, wait_until='domcontentloaded', timeout=25000)
                    await page.wait_for_timeout(8000)
                    html = await page.content()
                    if len(html.encode()) > 1200000:
                        raise ValueError('rendered_page_budget_exceeded')
                    text = await page.locator('body').inner_text(timeout=5000)
                    if response and response.status >= 400:
                        raise ValueError('rendered_http_'+str(response.status))
                    if any(label in text.lower() for label in ('captcha','verify you are human','just a moment')):
                        raise ValueError('public_access_challenge')
                    path = output/(key+'.html')
                    path.write_text(html)
                    body = discover(html, page.url)
                    record.update(access='rendered' if len(text.strip())>160 else 'rendered_content_unavailable',
                                  final_url=page.url,html_file=str(path),
                                  rendered_html_sha256=hashlib.sha256(html.encode()).hexdigest(),
                                  text_characters=len(text),title=body['title'],candidates=body['candidates'],
                                  public_social_links=body['public_social_links'],
                                  source_published_at=body['source_published_at'])
                except Exception as exc:
                    record.update(access='blocked_or_unavailable',error=source_error(exc))
                finally:
                    record['blocked_requests'] = blocked[:40]
                    await context.close()
                results.append(record)
                write_json(output/'manifest.json', {'sources':results,'requests':capture.requests})
                print('PUBLIC_RENDER_RESULT '+json.dumps(record, ensure_ascii=False), flush=True)
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
