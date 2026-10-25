"""Finish only the captured index backlog and new primary date/access work."""
import asyncio
import hashlib
import json
import os
import re
import subprocess
import urllib.parse
from pathlib import Path

from .common import Budget, decode_public_html, utcnow, write_json
from .document_queue_reader import publish_evidence, restore_checkpoint, recent_editions
from .expanded_source_pass import known_identities
from .local_source_audit import discover
from .observe_site_inventory import main as observe_inventory
from .portal_index import portal_index_links
from .public_document_http import PublicCapture, public_error
from .public_source_adapters import source_adapter
from .render_public_documents import main as render_public
from .social_access_probe import channels, profile_validator, probe_channels
from .verify_candidates import evaluate

CAPTURE='a6a2e6be225a79349ffabeb2047a1f272e184338'
HISTORY='history/39413875293-1/'


def main():
    if os.environ.get('GITHUB_REF')!='refs/heads/repair/mulchen-captura-2026-10-17':
        raise ValueError('repair_branch_required')
    output=Path('output/expanded-source-drain');output.mkdir(parents=True,exist_ok=True)
    subprocess.run(['git','fetch','origin',CAPTURE],check=True)
    def saved(name):return subprocess.check_output(['git','show',CAPTURE+':'+HISTORY+name])
    def blob(digest):return subprocess.check_output(['git','show',CAPTURE+':objects/'+digest])
    backlog=json.loads(saved('discovered-backlog.json'))['candidates']
    previous=json.loads(saved('reviews.json'))['rows']
    old_render=json.loads(saved('rendered-jobs/manifest.json'))['sources']
    byurl={row['url']:row for row in old_render}
    observe_inventory()
    baseline=json.loads(Path('output/site-inventory/proof.json').read_text())
    write_json(output/'before-inventory.json',baseline)
    existing=known_identities(baseline['visible_items'])
    capture=PublicCapture(output/'http');budget=Budget(600);reviews=[]
    # Re-evaluate retained originals with the corrected worksite parser, with no HTTP/OCR.
    for row in previous:
        if not row.get('original_sha256'):
            reviews.append(row);continue
        raw=(saved('rendered-jobs/'+Path(row['html_file']).name)
             if row.get('capture_kind')=='rendered' else blob(row['original_sha256']))
        if hashlib.sha256(raw).hexdigest()!=row['original_sha256']:raise ValueError('original_hash_changed')
        result=evaluate({'url':row['source_url']},decode_public_html(raw),row['source_url'],now=utcnow())
        result.update(source_url=row['source_url'],captured_at=row['captured_at'],original_sha256=row['original_sha256'],
                      capture_kind=row['capture_kind'],original_capture_commit=CAPTURE,
                      original_history=HISTORY,html_file=row.get('html_file'),replayed_without_network=True)
        reviews.append(result)
    reviewed={source_adapter(row['source_url'])['identityUrl'] for row in previous if source_adapter(row['source_url'])}
    unread=[row for row in backlog if row['source_identity'] not in reviewed|existing]
    render_jobs=[]
    for item in unread:
        if budget.remaining()<4:
            reviews.append({'source_url':item['url'],'status':'pending','reason':'run_budget_exhausted'});continue
        if urllib.parse.urlsplit(item['url']).hostname.removeprefix('www.')=='laborum.cl':
            render_jobs.append((hashlib.sha256(item['url'].encode()).hexdigest()[:16],item['url']));continue
        try:
            raw,final,mime,http=capture(item['url'],budget,max_bytes=1200000)
            result=evaluate({'url':item['url']},decode_public_html(raw),final,status=http,now=utcnow())
            result.update(source_url=item['url'],captured_at=utcnow().isoformat(),original_sha256=capture.put(raw),capture_kind='http')
        except Exception as exc:result={'source_url':item['url'],'status':'pending','reason':public_error(exc)}
        reviews.append(result)
    if render_jobs:
        asyncio.run(render_public(roots=render_jobs,destination=output/'rendered-jobs'))
        for page in json.loads((output/'rendered-jobs/manifest.json').read_text())['sources']:
            result={'source_url':page['url'],'status':'pending','reason':page.get('error') or page.get('access')}
            if page.get('access')=='rendered':
                raw=Path(page['html_file']).read_bytes()
                result=evaluate({'url':page['url']},decode_public_html(raw),page['final_url'],status=page['http'],now=utcnow())
                result.update(source_url=page['url'],captured_at=utcnow().isoformat(),original_sha256=page['rendered_html_sha256'],capture_kind='rendered',html_file=page['html_file'])
            reviews.append(result)
    write_json(output/'reviews.json',{'rows':reviews,'published':0,'paid_provider_calls':0})
    # Original dates from the public publisher's REST representation, never upload paths.
    dates=[]
    for kind in ('pages','posts'):
        url='https://www.munimulchen.cl/wp-json/wp/v2/'+kind+'/17979'
        try:
            raw,final,mime,http=capture(url,Budget(25),max_bytes=250000)
            value=json.loads(raw)
            dates.append({'url':url,'http':http,'sha256':capture.put(raw),
                'id':value.get('id'),'status':value.get('status'),'link':value.get('link'),
                'date_gmt':value.get('date_gmt'),'modified_gmt':value.get('modified_gmt'),
                'title':value.get('title'),'content':value.get('content')})
            if value.get('id')==17979:break
        except Exception as exc:
            reason=public_error(exc);dates.append({'url':url,'error':reason})
            if reason!='public_source_http_404':break
    write_json(output/'mulchen-primary-date.json',{'source_url':'https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/',
        'id_evidence':'shortlink in the retained primary HTML: ?p=17979','results':dates,'published':0})
    # Exact Facebook links previously accredited from official publishers; no alternate domains or login.
    local=json.loads(Path('config/local-source-priorities.json').read_text())['sources']
    facebook=[{'url':row['url'],'territory':row['territory'],'discovered_from':row['discovered_from']}
              for row in local if row.get('family')=='social' and row.get('discovered_from') and 'www.facebook.com/' in row['url'] and not row.get('identity_requires_check')]
    social=PublicCapture(output/'social',url_validator=profile_validator(facebook))
    social_result=probe_channels(facebook,social,Budget(65))
    write_json(output/'facebook-access.json',{'results':social_result,'requests':social.requests,'published':0,'paid_provider_calls':0})
    # Parse the new index snapshot, preserving old completed edition references without rereading their PDFs.
    indexes=json.loads(saved('static-indexes.json'))['sources']
    editions=[]
    for index in indexes:
        if index['url'].rstrip('/')=='https://www.malleco7.cl/ediciones-digitales-malleco7' and index.get('html_sha256'):
            editions=recent_editions(decode_public_html(blob(index['html_sha256'])),utcnow());break
    write_json(output/'edition-index.json',{'editions':editions,'pdfs_read':0,'published':0})
    employers=[]
    for url in ['https://www.arauco.com/','https://jobs.arauco.com/search/?q=&locationsearch=Chile']:
        try:
            raw,final,mime,http=capture(url,Budget(25),max_bytes=1200000)
            employers.append({'url':url,'final_url':final,'http':http,'sha256':capture.put(raw),
                              'individual_jobs':portal_index_links(decode_public_html(raw),final)})
        except Exception as exc:employers.append({'url':url,'error':public_error(exc)})
    asyncio.run(render_public(roots=[('cmpc-current-index','https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc')],destination=output/'employer-index'))
    write_json(output/'employer-indexes.json',{'sources':employers,'published':0})
    report={'schema':'trabajo-cerca.expanded-source-drain.v1','checked_at':utcnow().isoformat(),
        'previous_capture':CAPTURE,'previous_reviews_replayed_without_network':len(previous),
        'new_individual_pages_selected':len(unread),'reviews_total':len(reviews),
        'verified_for_handoff':sum(row.get('status')=='verified' for row in reviews),
        'facebook':social_result,'mulchen_dates':dates,'recent_edition_index':editions,'employers':employers,
        'new_offers_confirmed':0,'published':0,'paid_provider_calls':0,'coverage_complete':False}
    write_json(output/'summary.json',report)
    parent,checkpoint=restore_checkpoint()
    commit=publish_evidence(output,checkpoint,parent,os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
    print('EXPANDED_SOURCE_DRAIN '+json.dumps({**report,'data_commit':commit,'reviews':reviews},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
