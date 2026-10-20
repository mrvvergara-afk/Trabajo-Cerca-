"""A bounded full-index pass over requested territories; no publication or paid services."""
import asyncio
import hashlib
import json
import os
import re
import urllib.parse
from collections import defaultdict
from pathlib import Path

from .common import Budget, canonical_url, decode_public_html, normalized, utcnow, write_json
from .document_queue_reader import publish_evidence, restore_checkpoint
from .local_source_audit import discover
from .observe_site_inventory import main as observe_inventory
from .local_history import verify_notice
from .portal_index import portal_index_links
from .primary_source_discovery import ROOTS as REVIEWED_PRIMARY_ROOTS, metadata_address, original_metadata
from .public_document_http import PublicCapture, public_error
from .public_portals import plans
from .public_source_adapters import source_adapter
from .render_public_documents import main as render_public
from .verify_candidates import evaluate

TOWNS=['Angol','Lumaco','Los Sauces','Traiguén','Renaico','Nacimiento','Negrete','Mulchén','Collipulli']
RENDERED_PORTAL_HOSTS={'laborum.cl'}


def known_identities(items):
    return {adapter['identityUrl'] for item in items
            if item.get('url') and (adapter:=source_adapter(item['url']))}


def select_unread(candidates, existing, limit=30):
    """Fair by territory, retaining every discovered item in the durable backlog."""
    groups=defaultdict(list);seen=set(existing)
    for row in candidates:
        adapter=source_adapter(row['url'])
        if not adapter or adapter['identityUrl'] in seen:
            continue
        seen.add(adapter['identityUrl']);groups[row.get('territory') or row.get('commune_query') or 'Zona'].append(row)
    order=[town for town in TOWNS if town in groups]+sorted(set(groups)-set(TOWNS))
    chosen=[]
    while groups and len(chosen)<limit:
        for town in order:
            if groups.get(town) and len(chosen)<limit:
                chosen.append(groups[town].pop(0))
        groups={town:rows for town,rows in groups.items() if rows}
    return chosen


def configured_roots():
    local=json.loads(Path('config/local-source-priorities.json').read_text())['sources']
    roots=[{**row,'category':'local'} for row in local if row.get('family') in ('municipal','media') and not row.get('identity_requires_check')]
    # Explicit search/feed indexes reveal notices absent from a homepage.
    roots.extend({'url':url,'name':name,'territory':town,'category':'local'} for town,name,url in [
        ('Angol','Angol · búsqueda OMIL','https://noticias.angol.cl/index.php/component/search/?searchword=oferta%20laboral&searchphrase=all'),
        ('Lumaco','Lumaco · prensa','https://www.munilumaco.cl/index.php/sala-de-prensa'),
        ('Traiguén','Traiguén · búsqueda laboral','https://mtraiguen.cl/?s=oferta+laboral'),
        ('Negrete','Negrete · RSS','https://www.muninegrete.cl/feed/'),
        ('Mulchén','Mulchén · búsqueda laboral','https://www.munimulchen.cl/?s=oferta+laboral'),
        ('Malleco','Malleco7 · ediciones','https://www.malleco7.cl/ediciones-digitales-malleco7/'),
        ('Nacimiento','Radio Viaducto','https://radioviaducto.cl/'),
        ('Malleco','Las Noticias de Malleco','https://lasnoticiasdemalleco.cl/'),
    ])
    roots.extend({**row,'name':row['source'],'territory':row['commune_query'],'category':'portal'} for row in plans(TOWNS))
    return roots


def snapshot(url, output, capture, budget):
    raw,final,mime,status=capture(url,budget,max_bytes=1200000)
    text=decode_public_html(raw) if 'html' in mime else raw.decode('utf-8','replace')
    if re.search(r'verify you are human|verifica si realmente|no (?:es|eres) un robot|tr[aá]fico inusual|unusual traffic',text,re.I):
        raise ValueError('public_access_challenge')
    page=discover(text,final)
    portal=portal_index_links(text,final)
    return {'url':url,'final_url':final,'http':status,'mime':mime,'html_sha256':capture.put(raw),
            'title':page['title'],'text':page['text'],'local_candidates':page['candidates'],
            'public_social_links':page['public_social_links'],'portal_index':portal,
            'source_published_at':page.get('source_published_at'),'access':'read','coverage_complete':False},raw


def main():
    if (os.environ.get('GITHUB_REF')!='refs/heads/repair/mulchen-captura-2026-10-17' or
            os.environ.get('GITHUB_REPOSITORY')!='mrvvergara-afk/Trabajo-Cerca-'):
        raise ValueError('authorized_repair_branch_required')
    output=Path('output/expanded-source-pass');output.mkdir(parents=True,exist_ok=True)
    observe_inventory()
    baseline=json.loads(Path('output/site-inventory/proof.json').read_text())
    write_json(output/'before-inventory.json',baseline)
    existing=known_identities(baseline['visible_items'])
    capture=PublicCapture(output/'http');budget=Budget(540)
    roots=configured_roots();rows=[];candidates=[];render_roots=[];shared={};blocked={}
    for root in roots:
        url=canonical_url(root['url']);host=urllib.parse.urlsplit(url).netloc
        row={**root,'url':url,'coverage_complete':False,'published':0}
        if budget.remaining()<3:
            rows.append({**row,'access':'not_checked','error':'run_budget_exhausted'});continue
        if url in shared:
            rows.append({**row,'access':'shared_index','same_index_url':url});continue
        if host in blocked:
            rows.append({**row,'access':'blocked_shared_host','error':blocked[host]});continue
        if root['category']=='portal' and urllib.parse.urlsplit(url).hostname.removeprefix('www.') in RENDERED_PORTAL_HOSTS:
            render_roots.append(('index-'+normalized(root['territory']).replace(' ','-'),url,root['territory']))
            shared[url]=row
            rows.append({**row,'access':'queued_for_public_render'})
            continue
        try:
            detail,_=snapshot(url,output,capture,budget);row.update(detail)
            shared[url]=row
            for item in detail['portal_index']['links']:
                candidates.append({**item,'territory':root['territory'],'discovered_from':url})
        except Exception as exc:
            reason=public_error(exc);row.update(access='blocked_or_unavailable',error=reason)
            if reason in ('robots_policy_unavailable','public_source_robots_disallowed','public_source_http_403','public_source_http_429','public_access_challenge'):
                blocked[host]=reason
        rows.append(row)
        print('EXPANDED_INDEX '+json.dumps({key:row.get(key) for key in ('name','territory','url','access','error')}|{'individual_links':row.get('portal_index',{}).get('individual_links_found',0)},ensure_ascii=False),flush=True)
    write_json(output/'static-indexes.json',{'sources':rows,'requests':capture.requests})
    # Read new individual local pages, not old PDFs or the restricted /api/ render.
    _,prior=restore_checkpoint()
    def compact(value):
        parts=urllib.parse.urlsplit(canonical_url(value))
        return parts.hostname.removeprefix('www.')+parts.path.rstrip('/')
    old_refs={compact(value) for value in prior.get('items',{})}
    old_refs.update(compact(value) for value in REVIEWED_PRIMARY_ROOTS)
    local_work={}
    for parent in rows:
        if parent['category']!='local':continue
        for candidate in parent.get('local_candidates',[]):
            url=candidate['url']
            adapter=source_adapter(url)
            if (candidate.get('kind')!='page' or not adapter or adapter['family']!='local' or
                    compact(url) in old_refs or adapter['identityUrl'] in existing or
                    re.search(r'/category/|/tag/|[?&]s=|/concursos-publicos/?$|ediciones-digitales',url)):
                continue
            local_work.setdefault(url,{**candidate,'territory':parent['territory'],'discovered_from':parent['url']})
    local_reviews=[]
    for item in list(local_work.values())[:18]:
        if budget.remaining()<4:break
        try:
            detail,raw=snapshot(item['url'],output,capture,budget)
            published=detail.get('source_published_at')
            meta=metadata_address(raw,detail['final_url'])
            if not published and meta:
                try:
                    data,address,_,_=capture(meta,budget)
                    published=original_metadata(json.loads(data),detail['final_url'])
                    detail.update(metadata_url=address,metadata_sha256=capture.put(data))
                except Exception as exc:detail['metadata_error']=public_error(exc)
            result=verify_notice(detail['text'],item['url'],published,sha256=detail['html_sha256'],complete=len(detail['text'])<14000)
            local_reviews.append({'candidate':item,'page':detail,'review':result})
        except Exception as exc:local_reviews.append({'candidate':item,'error':public_error(exc)})
    write_json(output/'local-reviews.json',{'rows':local_reviews,'new_pdf_references':[candidate for row in rows for candidate in row.get('local_candidates',[]) if candidate.get('kind')=='document' and compact(candidate['url']) not in old_refs],'published':0})
    # Public JS index rendering is separate from eligibility and never applied to restricted municipalities.
    if render_roots:
        asyncio.run(render_public(roots=[(key,url) for key,url,_ in render_roots],destination=output/'rendered-indexes'))
        rendered=json.loads((output/'rendered-indexes/manifest.json').read_text())
        territory={url:town for _,url,town in render_roots}
        for page in rendered['sources']:
            if page.get('access')!='rendered':continue
            raw=Path(page['html_file']).read_text()
            found=portal_index_links(raw,page['final_url'])
            page['complete_individual_link_index']=found
            candidates.extend({**item,'territory':territory[page['url']],'discovered_from':page['url']} for item in found['links'])
        write_json(output/'rendered-indexes/manifest.json',rendered)
    unique={}
    # Rendered Laborum results first; they were the demonstrated unconsumed backlog.
    for item in sorted(candidates,key=lambda row:row.get('source')!='Laborum'):
        unique.setdefault(item['source_identity'],item)
    candidates=list(unique.values());write_json(output/'discovered-backlog.json',{'candidates':candidates,'already_visible_identities':sorted(existing),'published':0})
    chosen=select_unread(candidates,existing,limit=36)
    render_jobs=[];reviews=[]
    for item in chosen:
        if urllib.parse.urlsplit(item['url']).hostname.removeprefix('www.') in RENDERED_PORTAL_HOSTS:
            render_jobs.append((hashlib.sha256(item['url'].encode()).hexdigest()[:16],item['url']));continue
        try:
            raw,final,mime,status=capture(item['url'],budget,max_bytes=1200000)
            result=evaluate({'url':item['url']},decode_public_html(raw),final,status=status,now=utcnow())
            result.update(source_url=item['url'],captured_at=utcnow().isoformat(),original_sha256=capture.put(raw),capture_kind='http')
        except Exception as exc:result={'status':'pending','reason':public_error(exc),'source_url':item['url']}
        reviews.append(result)
    if render_jobs:
        asyncio.run(render_public(roots=render_jobs,destination=output/'rendered-jobs'))
        manifest=json.loads((output/'rendered-jobs/manifest.json').read_text())
        for page in manifest['sources']:
            result={'source_url':page['url'],'status':'pending','reason':page.get('error') or page.get('access')}
            if page.get('access')=='rendered':
                raw=Path(page['html_file']).read_text()
                result=evaluate({'url':page['url']},raw,page['final_url'],status=page['http'],now=utcnow())
                result.update(source_url=page['url'],captured_at=utcnow().isoformat(),original_sha256=page['rendered_html_sha256'],capture_kind='rendered',html_file=page['html_file'])
            reviews.append(result)
    write_json(output/'reviews.json',{'rows':reviews,'published':0,'paid_provider_calls':0})
    report={'schema':'trabajo-cerca.expanded-source-pass.v1','checked_at':utcnow().isoformat(),
            'requested_towns':TOWNS,'index_rows':len(rows),'distinct_individual_job_links':len(candidates),
            'already_visible':sum(item['source_identity'] in existing for item in candidates),
            'selected_for_review':len(chosen),'reviewed':len(reviews),'verified_for_handoff':sum(row.get('status')=='verified' for row in reviews),
            'local_individual_pages_reviewed':len(local_reviews),'local_indexes':[{key:row.get(key) for key in ('name','territory','url','access','error','local_candidates','public_social_links')} for row in rows if row['category']=='local'],
            'coverage_complete':False,'new_offers_confirmed':0,'published':0,'paid_provider_calls':0,
            'social_profiles_not_retried':'Instagram policy captured 39409845792: User-agent * Disallow /; indexed search recorded separately, timelines not read'}
    write_json(output/'summary.json',report)
    parent,checkpoint=restore_checkpoint()
    run=os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
    commit=publish_evidence(output,checkpoint,parent,run)
    print('EXPANDED_SOURCE_PASS '+json.dumps({**report,'data_commit':commit,'reviews':reviews},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
