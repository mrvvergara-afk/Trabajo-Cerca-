"""Deliver exactly three reviewed Laborum originals through the existing signed receiver."""
import hashlib
import json
import os
import subprocess
import time
from datetime import timedelta
from pathlib import Path
from . import laboratory_exchange,observe_laboratory,observe_site_inventory
from .common import parse_date,utcnow,write_json
from .document_queue_reader import publish_evidence,restore_checkpoint
from .inventory_retention_proof import cards
from .public_source_adapters import source_adapter,same_job
from .radar_v2_publish import matching_publication
from .reviewed_document_handoff import existing_data_parent
from .verify_candidates import evaluate
import asyncio

CAPTURE='d5704078106d121a6368338b41f1b64397aae266'
HISTORY='history/39401994040-1/'


def prepare(config,manifest,review,originals,now=None):
    now=now or utcnow();records=[]
    for target in config['pages']:
        pages=[page for page in manifest['sources'] if page['url']==target['url']]
        saved=[row for row in review['rows'] if row['source_url']==target['url']]
        if len(pages)!=1 or len(saved)!=1:raise ValueError('individual_capture_required')
        page=pages[0];captured=parse_date(saved[0]['captured_at']);raw=originals[target['key']]
        if not captured or captured>now or now-captured>timedelta(hours=24):raise ValueError('capture_requires_recollection')
        if page.get('access')!='rendered' or not same_job(target['url'],page['final_url']) or hashlib.sha256(raw).hexdigest()!=page['rendered_html_sha256']:
            raise ValueError('original_capture_identity_or_hash_changed')
        result=evaluate({'url':target['url']},raw.decode(),page['final_url'],status=page['http'],now=now)
        if result.get('status')!='verified' or result.get('work_commune')!='Angol' or result.get('title')!=target['title_hint']:
            raise ValueError('individual_role_not_verified')
        if not same_job(target['url'],result.get('application','')):raise ValueError('application_points_to_another_job')
        adapter=source_adapter(target['url']);identity=hashlib.sha256(adapter['identityUrl'].encode()).hexdigest();candidate=identity[:24]
        records.append({'source_url':target['url'],'source':result['source'],'title':result['title'],'company':result['company'],
            'work_commune':result['work_commune'],'source_published_at':result['source_published_at'],'valid_through':result['valid_through'],
            'application':result['application'],'verified_at':saved[0]['captured_at'],'verification_method':result['verification_method'],
            'validity_method':'explicit_deadline','candidate_id':candidate,'idempotency_key':'radar:'+candidate})
    return {'schema':'trabajo-cerca.ingestion.v1','generated_at':now.isoformat(),'published_count':0,'records':records,'ready_count':len(records)}


def main():
    context={'repository':os.environ.get('GITHUB_REPOSITORY'),'repository_id':os.environ.get('RADAR_REPOSITORY_ID'),
        'ref':os.environ.get('GITHUB_REF'),'sha':os.environ.get('GITHUB_SHA'),'run_id':os.environ.get('GITHUB_RUN_ID')}
    if context['repository']!=laboratory_exchange.REPOSITORY or context['ref']!='refs/heads/'+laboratory_exchange.DOCUMENT_PRODUCER_BRANCH:raise ValueError('repair_branch_required')
    output=Path('output/portal-reviewed-handoff');output.mkdir(parents=True,exist_ok=True)
    subprocess.run(['git','fetch','origin',CAPTURE],check=True)
    def original(name):return subprocess.check_output(['git','show',CAPTURE+':'+HISTORY+name])
    manifest=json.loads(original('manifest.json'));review=json.loads(original('review.json'))
    config=json.loads(Path('config/portal-individual-review-2026-10-20.json').read_text())
    originals={page['key']:original(page['key']+'.html') for page in config['pages']}
    queue=prepare(config,manifest,review,originals);write_json(output/'reviewed-queue.json',queue)
    observe_site_inventory.main();baseline=json.loads(Path('output/site-inventory/proof.json').read_text());write_json(output/'before-inventory.json',baseline)
    data_parent=existing_data_parent(laboratory_exchange.DATA_BRANCH)
    if not data_parent:raise ValueError('existing_durable_history_required')
    body=laboratory_exchange.unsigned_body(queue,context);envelope=laboratory_exchange.signed_envelope(body,laboratory_exchange.request_proof(body))
    files={'exchange/latest.json':(json.dumps(envelope,separators=(',',':'))+'\n').encode(),
        'history/'+context['run_id']+'/portal-review.json':(json.dumps(queue,ensure_ascii=False)+'\n').encode()}
    exchange=laboratory_exchange.publish_git_snapshot(files,context['run_id'],expected_parent=data_parent)
    report={'schema':'trabajo-cerca.portal-reviewed-delivery.v1','capture_commit':CAPTURE,'exchange_commit':exchange,
        'run_id':context['run_id'],'reviewed':len(queue['records']),'published_new':0,'paid_provider_calls':0}
    write_json(output/'delivery.json',report);print('PORTAL_REVIEWED_SENT '+json.dumps(report),flush=True)
    limit=time.monotonic()+1200
    while time.monotonic()<limit:
        observe_laboratory.main();proof=json.loads(Path('output/laboratory_observation_proof.json').read_text());confirmed=matching_publication(proof,context,queue['records'])
        if confirmed:
            observe_site_inventory.main();current=json.loads(Path('output/site-inventory/proof.json').read_text())
            after={row['id'] for row in current['visible_items']};before={row['id'] for row in baseline['visible_items']};ids=set(confirmed['published_ids'])
            if not ids<=after or not current['feed_read_complete']:raise ValueError('published_ids_missing_from_full_sdk')
            browser=asyncio.run(cards({row['id'] for row in current['visible_items'] if row.get('kind')=='job_offer'}))
            if not ids<=set(browser['all_cards']['ids']):raise ValueError('published_cards_not_confirmed')
            report.update(published_new=len(ids-before),published_ids=sorted(ids),already_present_ids=sorted(ids&before),
                sdk_total_items=current['sdk_total_items'],sdk_job_offers=current['sdk_job_offers'],added_ids=sorted(after-before),removed_ids=sorted(before-after),
                confirmation=confirmed,all_cards_confirmed=True,feed_manifest=current['feed_manifest'])
            write_json(output/'after-inventory.json',current);write_json(output/'cards.json',browser);write_json(output/'confirmation.json',report)
            parent,checkpoint=restore_checkpoint();commit=publish_evidence(output,checkpoint,parent,context['run_id']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
            confirmation={'history/'+context['run_id']+'/portal-publication-confirmation.json':(json.dumps(report)+'\n').encode()}
            laboratory_exchange.publish_git_snapshot(confirmation,context['run_id'],expected_parent=exchange)
            print('PORTAL_REVIEWED_CONFIRMED '+json.dumps({**report,'data_commit':commit},ensure_ascii=False),flush=True);return
        print('PORTAL_REVIEWED_WAIT '+json.dumps({'confirmed':False,'ingestion_status':proof.get('ingestion',{}).get('status')}),flush=True)
        time.sleep(45)
    raise RuntimeError('signed_receiver_publication_not_confirmed_within_bounded_window')

if __name__=='__main__':main()
