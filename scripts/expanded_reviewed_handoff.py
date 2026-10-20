"""Publish only explicitly reviewed originals through the existing signed exchange."""
import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import time
from datetime import timedelta
from pathlib import Path

from . import laboratory_exchange, observe_laboratory, observe_site_inventory
from .common import decode_public_html, parse_date, utcnow, write_json
from .document_queue_reader import publish_evidence, restore_checkpoint
from .expanded_source_pass import known_identities
from .inventory_retention_proof import cards
from .public_source_adapters import source_adapter, same_job
from .radar_v2_publish import matching_publication
from .reviewed_document_handoff import existing_data_parent
from .verify_candidates import evaluate

CONFIG=Path('config/expanded-reviewed-publication-2026-10-20.json')


def prepare(targets, originals, visible, now=None):
    now=now or utcnow();existing=known_identities(visible);seen=set(existing);records=[];skipped=[]
    for target in targets:
        url=target['url'];adapter=source_adapter(url)
        if not adapter:raise ValueError('unsupported_individual_source')
        if adapter['identityUrl'] in seen:
            skipped.append({'url':url,'reason':'already_visible_or_same_identity'});continue
        raw=originals[url];captured=parse_date(target['captured_at'])
        if not captured or captured>now or now-captured>timedelta(hours=24):raise ValueError('original_capture_requires_refresh')
        if hashlib.sha256(raw).hexdigest()!=target['sha256']:raise ValueError('original_hash_changed')
        if target.get('local_contact_proof'):
            evidence=json.loads(Path(target['local_contact_proof']).read_text())
            row={'source_url':url,'source':adapter['name'],'title':target['title'],'company':target['company'],
                'work_commune':target['commune'],'source_published_at':target['published_at'],'valid_through':'',
                'application':url,'verified_at':evidence['reviewed_at'],
                'verification_method':adapter['name']+' individual notice + dated public in-person application',
                'validity_method':'dated_in_person','local_contact_evidence':evidence,'vacancies':target['vacancies'],
                'application_details':{'method':'in_person','instructions':target['application_instructions']}}
            if evidence['source_html'].encode()!=raw:raise ValueError('local_original_hash_changed')
            subprocess.run(['node','--disable-warning=ExperimentalWarning','scripts/verify_local_contact.mjs'],
                input=json.dumps({'item':row,'now':int(now.timestamp()*1000)}),text=True,capture_output=True,check=True)
            identity=hashlib.sha256(adapter['identityUrl'].encode()).hexdigest();candidate=identity[:24]
            row.update(candidate_id=candidate,idempotency_key='radar:'+candidate)
            records.append(row);seen.add(adapter['identityUrl']);continue
        result=evaluate({'url':url},decode_public_html(raw),url,status=200,now=now)
        if (result.get('status')!='verified' or result.get('title')!=target['title'] or
                result.get('company')!=target['company'] or result.get('work_commune')!=target['commune']):
            raise ValueError('reviewed_role_or_worksite_changed:'+url+':'+str(result.get('reason')))
        if source_adapter(result['application']) and not same_job(url,result['application']):raise ValueError('application_belongs_to_another_job')
        identity=hashlib.sha256(adapter['identityUrl'].encode()).hexdigest();candidate=identity[:24]
        row={'source_url':url,'source':result['source'],'title':result['title'],'company':result['company'],
            'work_commune':result['work_commune'],'source_published_at':result['source_published_at'],
            'valid_through':result.get('valid_through') or '', 'application':result['application'],
            'verified_at':target['captured_at'],'verification_method':result['verification_method'],
            'candidate_id':candidate,'idempotency_key':'radar:'+candidate,
            'validity_method':result.get('validity_method') or 'explicit_deadline'}
        if result.get('validity_evidence'):
            row['validity_evidence']={**result['validity_evidence'],'checked_at':target['captured_at']}
        records.append(row);seen.add(adapter['identityUrl'])
    return records,skipped


async def consume_once():
    from playwright.async_api import async_playwright
    environment={key:value for key,value in os.environ.items() if key not in ('GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL')}
    async with async_playwright() as playwright:
        browser=await playwright.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),headless=True,env=environment)
        try:
            page=await browser.new_page()
            await page.route('**/api/analytics',lambda route:route.abort())
            await page.route('**/api/growth/sponsor',lambda route:route.abort())
            await page.goto('https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?radar-receiver-proof=1#operacion',wait_until='domcontentloaded',timeout=30000)
            await page.wait_for_selector('#reviewed-receiver-run',timeout=60000)
            await page.locator('#reviewed-receiver-run').click()
            await page.wait_for_function("""() => {const el=document.getElementById('radar-receiver-check');if(!el)return false;try{const x=JSON.parse(el.textContent);return Boolean(x.result&&!x.running);}catch{return false;}}""",timeout=60000)
            return json.loads(await page.locator('#radar-receiver-check').inner_text())['result']
        finally:await browser.close()


def main():
    context={'repository':os.environ.get('GITHUB_REPOSITORY'),'repository_id':os.environ.get('RADAR_REPOSITORY_ID'),
        'ref':os.environ.get('GITHUB_REF'),'sha':os.environ.get('GITHUB_SHA'),'run_id':os.environ.get('GITHUB_RUN_ID')}
    if context['repository']!=laboratory_exchange.REPOSITORY or context['ref']!='refs/heads/'+laboratory_exchange.DOCUMENT_PRODUCER_BRANCH:
        raise ValueError('authorized_repair_branch_required')
    settings=json.loads(CONFIG.read_text());targets=settings['approved']
    if not 0<len(targets)<=24:raise ValueError('reviewed_delivery_budget_exceeded')
    output=Path('output/expanded-reviewed-handoff');output.mkdir(parents=True,exist_ok=True)
    for commit in sorted({row['capture_commit'] for row in targets}):subprocess.run(['git','fetch','origin',commit],check=True)
    originals={row['url']:subprocess.check_output(['git','show',row['capture_commit']+':'+row['original_path']]) for row in targets}
    observe_site_inventory.main();baseline=json.loads(Path('output/site-inventory/proof.json').read_text());write_json(output/'before-inventory.json',baseline)
    recovered_ids=set();resume=settings.get('resume_exchange')
    if resume:
        subprocess.run(['git','fetch','origin',resume['commit']],check=True)
        old=json.loads(subprocess.check_output(['git','show',resume['commit']+':'+resume['path']]))['records']
        consumed=asyncio.run(consume_once());observe_laboratory.main()
        proof=json.loads(Path('output/laboratory_observation_proof.json').read_text())
        expected={row['candidate_id'] for row in old}
        diagnostics=[row for row in proof.get('ingestion',{}).get('receipts',[]) if row.get('candidateId') in expected]
        write_json(output/'recovered-exchange-proof.json',proof)
        print('EXPANDED_RECOVERY_DIAGNOSTICS '+json.dumps({'consumed':consumed,'receipts':diagnostics},ensure_ascii=False),flush=True)
        confirmed=matching_publication(proof,{'run_id':resume['run_id']},old)
        if not confirmed:
            parent,checkpoint=restore_checkpoint();saved=publish_evidence(output,checkpoint,parent,context['run_id']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
            raise RuntimeError('previous_signed_exchange_not_fully_visible:'+saved)
        recovered_ids=set(confirmed['published_ids'])
        observe_site_inventory.main();baseline=json.loads(Path('output/site-inventory/proof.json').read_text())
    records,skipped=prepare(targets,originals,baseline['visible_items'])
    if settings.get('revalidate_cmpc'):
        from .cmpc_reviewed_handoff import prepare as cmpc_prepare
        from .render_public_documents import main as render_public
        ids=settings['revalidate_cmpc'];destination=output/'cmpc-revalidation'
        roots=[('cmpc-'+str(job),'https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/'+str(job)+'?c=cmpc') for job in ids]
        asyncio.run(render_public(roots,destination));outcomes=[]
        queue=cmpc_prepare(json.loads((destination/'manifest.json').read_text()),destination/'objects',role_ids=ids,outcomes=outcomes)
        write_json(output/'cmpc-per-role-outcomes.json',{'outcomes':outcomes,'revalidations':len(queue['records']),'new_offers':0})
        records.extend(queue['records'])
        parent,checkpoint=restore_checkpoint();publish_evidence(destination,checkpoint,parent,context['run_id']+'-cmpc-capture')
    write_json(output/'reviewed-queue.json',{'records':records,'skipped':skipped,'published':0})
    all_ids=set(recovered_ids);deliveries=[]
    for batch_index in range(0,len(records),3):
        batch_records=records[batch_index:batch_index+3];batch_name=str(batch_index//3+1)
        queue={'schema':'trabajo-cerca.ingestion.v1','generated_at':utcnow().isoformat(),'published_count':0,'records':batch_records}
        body=laboratory_exchange.unsigned_body(queue,context)
        envelope=laboratory_exchange.signed_envelope(body,laboratory_exchange.request_proof(body))
        parent=existing_data_parent(laboratory_exchange.DATA_BRANCH)
        if not parent:raise ValueError('durable_history_required')
        exchange=laboratory_exchange.publish_git_snapshot({'exchange/latest.json':(json.dumps(envelope,separators=(',',':'))+'\n').encode(),
            'history/'+context['run_id']+'/batches/'+batch_name+'-review.json':(json.dumps(queue,ensure_ascii=False)+'\n').encode()},context['run_id'],expected_parent=parent)
        confirmed=None;limit=time.monotonic()+480
        while time.monotonic()<limit:
            consumed=asyncio.run(consume_once());write_json(output/('batch-'+batch_name+'-consume.json'),consumed)
            if consumed.get('error') or consumed.get('status')=='batch_rejected':raise ValueError('signed_receiver_rejected_or_unavailable')
            observe_laboratory.main();proof=json.loads(Path('output/laboratory_observation_proof.json').read_text())
            observed={row.get('candidateId') for row in proof.get('ingestion',{}).get('receipts',[]) if row.get('publishedId')}
            expected={row['candidate_id'] for row in batch_records}
            confirmed=matching_publication(proof,context,batch_records) if observed==expected else None
            if confirmed:break
            print('EXPANDED_REVIEWED_WAIT '+json.dumps({'batch':batch_name,'status':consumed.get('status'),'confirmed':False}),flush=True)
            time.sleep(30)
        if not confirmed:raise RuntimeError('signed_publication_not_confirmed_within_budget')
        ids=set(confirmed['published_ids']);all_ids.update(ids)
        delivery={'batch':batch_name,'exchange_commit':exchange,'confirmation':confirmed,'source_urls':[row['source_url'] for row in batch_records]}
        deliveries.append(delivery);write_json(output/('batch-'+batch_name+'-confirmation.json'),delivery)
        print('EXPANDED_BATCH_CONFIRMED '+json.dumps(delivery,ensure_ascii=False),flush=True)
    observe_site_inventory.main();after=json.loads(Path('output/site-inventory/proof.json').read_text());write_json(output/'after-inventory.json',after)
    comparison=json.loads(Path(settings['comparison_baseline']).read_text()) if settings.get('comparison_baseline') else baseline
    visible={row['id'] for row in after['visible_items']};before={row['id'] for row in comparison['visible_items']}
    if not after['feed_read_complete'] or not all_ids<=visible:raise ValueError('published_ids_missing_from_complete_feed')
    view=asyncio.run(cards({row['id'] for row in after['visible_items'] if row.get('kind')=='job_offer'}));write_json(output/'cards.json',view)
    if not all_ids<=set(view['all_cards']['ids']):raise ValueError('published_ids_not_visible_on_cards')
    report={'schema':'trabajo-cerca.expanded-reviewed-publication.v1','checked_at':after['checked_at'],'deliveries':deliveries,
        'new_offers_confirmed':len(all_ids-before),'published_ids':sorted(all_ids),'already_visible_ids':sorted(all_ids&before),
        'added_ids':sorted(visible-before),'removed_ids':sorted(before-visible),'removal_reasons_confirmed':False,
        'sdk_job_offer_records':after['sdk_job_offers'],'all_cards_confirmed':True,'paid_provider_calls':0,'skipped':skipped}
    write_json(output/'confirmation.json',report)
    parent,checkpoint=restore_checkpoint();commit=publish_evidence(output,checkpoint,parent,context['run_id']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
    print('EXPANDED_REVIEWED_CONFIRMED '+json.dumps({**report,'data_commit':commit},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
