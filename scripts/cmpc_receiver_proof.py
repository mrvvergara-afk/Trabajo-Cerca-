"""Resume observation of the existing signed lot. Never re-sign or re-capture it."""
import json
import os
import time
from pathlib import Path
from . import laboratory_exchange,observe_laboratory
from .common import write_json
from .radar_v2_publish import matching_publication
from .reviewed_document_handoff import existing_data_parent

DELIVERY_RUN='39342961738'


def main():
    if os.environ.get('GITHUB_REPOSITORY')!=laboratory_exchange.REPOSITORY or os.environ.get('GITHUB_REF')!='refs/heads/'+laboratory_exchange.DOCUMENT_PRODUCER_BRANCH:
        raise ValueError('cmpc_observation_repair_branch_required')
    parent=existing_data_parent(laboratory_exchange.DATA_BRANCH)
    report=json.loads(laboratory_exchange.git('show',parent+':reports/cmpc-'+DELIVERY_RUN+'.json'))
    queue=json.loads(laboratory_exchange.git('show',parent+':history/'+DELIVERY_RUN+'/cmpc-review.json'))
    if report['run_id']!=DELIVERY_RUN or queue['ready_count']!=2:raise ValueError('existing_cmpc_delivery_not_found')
    context={'run_id':DELIVERY_RUN}
    output=Path('output/cmpc-reviewed-handoff');output.mkdir(parents=True,exist_ok=True)
    deadline=time.monotonic()+1200
    while time.monotonic()<deadline:
        try:
            observe_laboratory.main()
            proof=json.loads(Path('output/laboratory_observation_proof.json').read_text())
            confirmed=matching_publication(proof,context,queue['records'])
            if confirmed:
                report.update(published=2,confirmation=confirmed,observation_run_id=os.environ['GITHUB_RUN_ID'],signed_batch_reused=True)
                write_json(output/'publication-confirmation.json',report)
                files={'history/'+DELIVERY_RUN+'/cmpc-publication-confirmation.json':(json.dumps(report)+'\n').encode()}
                commit=laboratory_exchange.publish_git_snapshot(files,os.environ['GITHUB_RUN_ID'],expected_parent=parent)
                print('CMPC_REVIEWED_CONFIRMED '+json.dumps({**report,'confirmation_data_commit':commit}),flush=True)
                return
            ingestion=proof.get('ingestion') or {}
            if ingestion.get('runId')==DELIVERY_RUN and ingestion.get('rejection'):raise ValueError('current_cmpc_receiver_rejected:'+str(ingestion['rejection']))
            print('CMPC_RECEIVER_WAIT '+json.dumps({'runId':ingestion.get('runId'),'status':ingestion.get('status'),'published':ingestion.get('published')}),flush=True)
        except Exception as exc:
            if str(exc).startswith('current_cmpc_receiver_rejected:'):raise
            print('CMPC_OBSERVATION_UNAVAILABLE '+type(exc).__name__,flush=True)
        time.sleep(45)
    raise RuntimeError('existing_cmpc_lot_not_confirmed_in_bounded_window')


if __name__=='__main__':main()
