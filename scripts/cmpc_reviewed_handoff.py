"""Two reviewed public CMPC roles, signed through the existing laboratory receiver.

No login, application submission, provider call, credential edit or new schedule.
The public page and its anonymous search response must still agree at delivery.
"""
import asyncio
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from . import laboratory_exchange, observe_laboratory
from .common import utcnow, write_json
from .document_queue_reader import publish_evidence, restore_checkpoint
from .radar_v2_publish import matching_publication
from .render_public_documents import main as render_sources
from .reviewed_document_handoff import existing_data_parent

ROLES={18859:('Ingeniero/a Procesos y Excelencia Sr','Collipulli','Ubicación: Planta Pacífico - Mininco.'),
       18943:('Inspector de Vibraciones','Nacimiento','Ubicación: Nacimiento.')}
METHOD='CMPC · portal de empleo public career page + official requisition response'


def source_date(value):
    parsed=datetime.strptime(value,'%m/%d/%Y').replace(tzinfo=ZoneInfo('America/Santiago'))
    return parsed.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')


def prepare(manifest,objects,*,now=None):
    now=now or utcnow()
    records=[]
    for job,(title,commune,site) in ROLES.items():
        url='https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/'+str(job)+'?c=cmpc'
        pages=[page for page in manifest['sources'] if page['url']==url]
        if len(pages)!=1 or pages[0].get('access')!='rendered' or any(block.get('url','').startswith('https://us.api.csod.com/') for block in pages[0].get('blocked_requests',[])):
            raise ValueError('cmpc_individual_page_unavailable')
        page=pages[0];text=page['text'];normalized=re.sub(r'\s+',' ',text).strip()
        for literal in (title,commune,'req'+str(job),'Apply Now','En CMPC',site):
            if literal not in normalized:raise ValueError('cmpc_reviewed_literal_changed')
        responses=[row for row in page['public_job_api_responses'] if row.get('http')==200 and len(row.get('jobs',[]))==1 and row['jobs'][0].get('requisitionId')==job]
        if len(responses)!=1:raise ValueError('cmpc_official_response_missing')
        response=responses[0];raw=(Path(objects)/response['sha256']).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=response['sha256']:raise ValueError('cmpc_original_hash_mismatch')
        original=json.loads(raw)
        rows=original.get('data',{}).get('requisitions',[])
        if original.get('status')!='Success' or len(rows)!=1:raise ValueError('cmpc_individual_response_required')
        row=rows[0]
        if row['requisitionId']!=job or row['displayJobTitle']!=title or not any(place.get('city')==commune and place.get('country')=='CL' for place in row['locations']):
            raise ValueError('cmpc_role_or_workplace_changed')
        published=source_date(row['postingEffectiveDate']);deadline=source_date(row['postingExpirationDate'])
        if ('Posted on: '+row['postingEffectiveDate'] not in normalized or
            not 0<=(now-datetime.fromisoformat(published)).total_seconds()<=45*86400 or datetime.fromisoformat(deadline)<=now):
            raise ValueError('cmpc_role_not_recent_or_closed')
        verified=now.isoformat();identity=hashlib.sha256(url.encode()).hexdigest();candidate=identity[:24]
        records.append({'source_url':url,'source':'CMPC · portal de empleo','title':title,'company':'CMPC',
                        'work_commune':commune,'work_site':site,'source_published_at':published,'valid_through':deadline,
                        'application':url,'verified_at':verified,'verification_method':METHOD,'candidate_id':candidate,
                        'idempotency_key':'radar:'+candidate,'validity_method':'explicit_deadline',
                        'source_evidence':{'sha256':hashlib.sha256(text.encode()).hexdigest(),'source_url':url,'complete_document':True,'text':text},
                        'cmpc_evidence':{'schema':'trabajo-cerca.cmpc-public-review.v1','requisition_id':job,
                          'api_url':response['url'],'api_json':raw.decode(),'api_sha256':response['sha256'],
                          'workplace_literal':site,'employer_literal':'En CMPC','application_label':'Apply Now',
                          'reviewed_at':verified,'date_precision':'day','deadline_policy':'start_of_local_date'}})
    return {'schema':'trabajo-cerca.ingestion.v1','generated_at':now.isoformat(),'published_count':0,'ready_count':len(records),'records':records}


def main():
    context={'repository':os.environ.get('GITHUB_REPOSITORY'),'repository_id':os.environ.get('RADAR_REPOSITORY_ID'),
             'ref':os.environ.get('GITHUB_REF'),'sha':os.environ.get('GITHUB_SHA'),'run_id':os.environ.get('GITHUB_RUN_ID')}
    if context['repository']!=laboratory_exchange.REPOSITORY or context['ref']!='refs/heads/'+laboratory_exchange.DOCUMENT_PRODUCER_BRANCH:
        raise ValueError('cmpc_handoff_repair_branch_required')
    output=Path('output/cmpc-reviewed-handoff')
    roots=[('cmpc-'+str(job),'https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/'+str(job)+'?c=cmpc') for job in ROLES]
    asyncio.run(render_sources(roots,output))
    manifest=json.loads((output/'manifest.json').read_text())
    queue=prepare(manifest,output/'objects')
    write_json(output/'reviewed-queue.json',queue)
    parent,checkpoint=restore_checkpoint()
    capture_commit=publish_evidence(output,checkpoint,parent,context['run_id']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
    data_parent=existing_data_parent(laboratory_exchange.DATA_BRANCH)
    if not data_parent:raise ValueError('existing_durable_history_required')
    body=laboratory_exchange.unsigned_body(queue,context)
    envelope=laboratory_exchange.signed_envelope(body,laboratory_exchange.request_proof(body))
    report={'schema':'trabajo-cerca.cmpc-reviewed-delivery.v1','capture_commit':capture_commit,'run_id':context['run_id'],
            'reviewed':len(queue['records']),'published':0,'paid_provider_calls':0,'original_date_precision':'day',
            'deadline_policy':'conservative_start_of_local_date','historical_sqlite_preserved':True}
    files={'exchange/latest.json':(json.dumps(envelope,separators=(',',':'))+'\n').encode(),
           'history/'+context['run_id']+'/cmpc-review.json':(json.dumps(queue,ensure_ascii=False)+'\n').encode(),
           'reports/cmpc-'+context['run_id']+'.json':(json.dumps(report,ensure_ascii=False)+'\n').encode()}
    exchange_commit=laboratory_exchange.publish_git_snapshot(files,context['run_id'],expected_parent=data_parent)
    report['exchange_commit']=exchange_commit
    write_json(output/'delivery.json',report)
    print('CMPC_REVIEWED_SENT '+json.dumps(report),flush=True)
    limit=time.monotonic()+1200
    while time.monotonic()<limit:
        observe_laboratory.main()
        proof=json.loads(Path('output/laboratory_observation_proof.json').read_text())
        confirmed=matching_publication(proof,context,queue['records'])
        if confirmed:
            report.update(published=len(queue['records']),confirmation=confirmed)
            write_json(output/'publication-confirmation.json',report)
            confirmation={'history/'+context['run_id']+'/cmpc-publication-confirmation.json':(json.dumps(report)+'\n').encode()}
            laboratory_exchange.publish_git_snapshot(confirmation,context['run_id'],expected_parent=exchange_commit)
            print('CMPC_REVIEWED_CONFIRMED '+json.dumps(report),flush=True)
            return
        print('CMPC_REVIEWED_WAIT '+json.dumps({'ingestion':proof.get('ingestion'),'published':0}),flush=True)
        time.sleep(45)
    raise RuntimeError('cmpc_publication_not_confirmed_within_bounded_window')


if __name__=='__main__':main()
