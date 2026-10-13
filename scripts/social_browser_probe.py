"""Read two reviewed Facebook profiles in a fresh public browser, without login."""
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.parse
from pathlib import Path

from .common import canonical_url, utcnow, write_json
from .local_source_audit import Document, discover, evidence_fields, source_error
from .social_access_probe import channels, MAX_PROFILE_BYTES


def inspect(row, *, individual=False):
    result={**row,'read_only':True,'paid_provider_calls':0,'coverage_complete':False}
    browser=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not browser: return {**result,'access':'unavailable','reason':'readonly_browser_unavailable'}
    try:
        with tempfile.TemporaryDirectory() as directory:
            environment={key:value for key,value in os.environ.items()
                         if key not in ('GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')}
            value=subprocess.run([browser,'--headless','--disable-gpu','--no-first-run',
              '--disable-background-networking','--user-data-dir='+directory,'--virtual-time-budget=12000',
              '--dump-dom',row['url']],capture_output=True,text=True,timeout=50,env=environment,check=True)
        if len(value.stdout.encode())>MAX_PROFILE_BYTES:
            return {**result,'access':'unavailable','reason':'source_byte_budget_exceeded'}
        parser=Document();parser.feed(value.stdout)
        refs=set()
        for href,_ in parser.links:
            try: url=canonical_url(urllib.parse.urljoin(row['url'],href))
            except ValueError: continue
            if (urllib.parse.urlsplit(url).hostname.removeprefix('www.') in ('facebook.com','m.facebook.com','web.facebook.com')
                    and re.search(r'/posts/|/permalink/|[?&]story_fbid=',url,re.I)):
                parts=urllib.parse.urlsplit(url)
                query=urllib.parse.urlencode([(key,val) for key,val in urllib.parse.parse_qsl(parts.query)
                                            if key in ('story_fbid','id')])
                url=urllib.parse.urlunsplit((parts.scheme,parts.netloc,parts.path,query,''))
                refs.add(url)
        result.update(title=parser.title.strip()[:180],post_references=len(refs),post_urls=sorted(refs)[:10],
                      access='post_links_visible' if refs else 'no_readable_posts',
                      reason='individual_notices_not_verified')
        if individual:
            page=discover(value.stdout,row['url'])
            result.update(source_published_at=page['source_published_at'],
                          notice_fields=evidence_fields(page['text'],page['source_published_at']),
                          page_text_preview=' '.join(page['text'].split()[:25]),
                          media_references=len(page['images']))
    except Exception as exc: result.update(access='unavailable',reason=source_error(exc))
    return result


def main():
    reviewed={row['url'].rstrip('/'):row for row in channels()}
    targets=['https://www.facebook.com/municipalidadrenaico','https://www.facebook.com/MuniNegreteCL']
    rows=[inspect(reviewed[url]) for url in targets if url in reviewed]
    posts=[inspect({'url':row['post_urls'][0],'profile':row['url'],'territory':row['territory']},individual=True)
           for row in rows if row.get('post_urls')]
    result={'checked_at':utcnow().isoformat(),'read_only':True,'paid_provider_calls':0,
            'checked':len(rows),'coverage_complete':False,'results':rows,'individual_posts':posts}
    write_json(Path('output/public-sources/social-browser-probe.json'),result)
    print('SOCIAL_BROWSER_PROBE '+json.dumps(result,ensure_ascii=False))


if __name__=='__main__':main()
