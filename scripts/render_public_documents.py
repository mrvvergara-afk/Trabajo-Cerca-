"""Read allowed public pages and job responses without login or paid providers."""
import asyncio
import hashlib
import json
import os
import re
import shutil
import urllib.parse
from pathlib import Path

from .common import Budget, write_json
from .local_source_audit import discover
from .public_document_http import PublicCapture, public_url, public_error as source_error

ROOTS = [('los-sauces','https://www.munilossauces.cl/noticias'),
         ('nacimiento','https://www.nacimiento.cl/noticias')]


def diagnostic_url(value):
    parts=urllib.parse.urlsplit(value)
    query=urllib.parse.parse_qsl(parts.query,keep_blank_values=True)
    query=[(key,'[redacted]' if key.lower() in ('key','token','api_key','apikey','access_token','authorization','session') else item) for key,item in query]
    return urllib.parse.urlunsplit((parts.scheme,parts.netloc,parts.path,urllib.parse.urlencode(query),''))[:2000]


def public_job_rows(value):
    rows=[]
    def safe(item):
        if isinstance(item,dict):return {key:safe(value) for key,value in item.items() if not any(part in key.lower() for part in ('token','password','authorization','secret','description','html'))}
        if isinstance(item,list):return [safe(value) for value in item[:100]]
        if isinstance(item,str):return item[:2000]
        return item
    def visit(node,depth=0):
        if depth>7 or len(rows)>=80:return
        if isinstance(node,dict):
            if any(('title' in key.lower() or key.lower() in ('titulo','título','puesto')) and isinstance(item,str) for key,item in node.items()):
                allowed=('title','titulo','título','puesto','requisition','post','location','date','status','apply','company','description','job','city','region','empresa','fecha','ubicacion','ubicación','provincia','ciudad','pais','país','vacantes')
                clean={key:item for key,item in node.items() if not any(part in key.lower() for part in ('token','password','authorization','secret')) and (key.lower()=='id' or any(part in key.lower() for part in allowed))}
                rows.append(safe(clean))
            else:
                for item in node.values():visit(item,depth+1)
        elif isinstance(node,list):
            for item in node[:100]:visit(item,depth+1)
    visit(value)
    return rows


async def main(roots=None, destination=None):
    from playwright.async_api import async_playwright
    output = Path(destination or 'output/document-reader/rendered')
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
            for key, url in (roots if roots is not None else ROOTS):
                blocked = []
                api_results=[];api_tasks=[];search_calls=0
                budget = Budget(70)
                context = await browser.new_context(user_agent='TrabajoCercaLocalAudit/1.0')
                async def route_request(route):
                    nonlocal search_calls
                    target = route.request.url
                    try:
                        public_url(target)
                        if urllib.parse.urlsplit(target).hostname=='us.api.csod.com':
                            if route.request.method not in ('GET','POST','OPTIONS') or search_calls>=3:
                                raise ValueError('public_search_request_budget_exceeded')
                            search_calls+=1
                        allowed = await asyncio.to_thread(capture.allowed, target, budget)
                        if not allowed:
                            raise ValueError('public_source_robots_disallowed')
                        if route.request.resource_type in ('media','font','image'):
                            await route.abort()
                            return
                        await route.continue_()
                    except Exception as exc:
                        blocked.append({'url':diagnostic_url(target),'reason':source_error(exc)})
                        await route.abort()
                await context.route('**/*', route_request)
                page = await context.new_page()
                async def capture_job_response(response):
                    host=urllib.parse.urlsplit(response.url).hostname.removeprefix('www.')
                    if host not in ('us.api.csod.com','laborum.cl'):return
                    if 'json' not in response.headers.get('content-type',''):return
                    entry={'url':diagnostic_url(response.url),'http':response.status}
                    try:
                        raw=await response.body()
                        if len(raw)>2500000:raise ValueError('response_byte_budget_exceeded')
                        data=json.loads(raw)
                        jobs=public_job_rows(data)
                        if host=='laborum.cl' and not jobs:return
                        entry.update(bytes=len(raw),jobs=jobs)
                        if re.search(rb'"(?:access_?token|password|authorization|secret)"\s*:',raw,re.I):
                            entry['original_omitted']='sensitive_response_shape'
                        else:entry['sha256']=capture.put(raw)
                    except Exception as exc:entry['error']=source_error(exc)
                    api_results.append(entry)
                page.on('response',lambda response:api_tasks.append(asyncio.create_task(capture_job_response(response))))
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
                                  text_characters=len(text),text=text[:20000],title=body['title'],candidates=body['candidates'],
                                  public_social_links=body['public_social_links'],
                                  source_published_at=body['source_published_at'])
                except Exception as exc:
                    record.update(access='blocked_or_unavailable',error=source_error(exc))
                finally:
                    if api_tasks:await asyncio.gather(*api_tasks,return_exceptions=True)
                    record['public_job_api_responses']=api_results
                    record['blocked_requests'] = blocked[:40]
                    await context.close()
                results.append(record)
                write_json(output/'manifest.json', {'sources':results,'requests':capture.requests})
                print('PUBLIC_RENDER_RESULT '+json.dumps(record, ensure_ascii=False), flush=True)
        finally:
            await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
