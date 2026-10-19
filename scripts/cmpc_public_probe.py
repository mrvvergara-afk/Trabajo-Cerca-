"""One public career portal probe, respecting robots and without login or publication."""
import asyncio
import json
import os
from pathlib import Path

from .common import write_json
from .document_queue_reader import publish_evidence,restore_checkpoint
from .render_public_documents import main as render_sources


def main():
    output=Path('output/cmpc-public')
    roots=[('cmpc','https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc')]
    if os.environ.get('CMPC_INDIVIDUAL_PROOF')=='1':
        roots=[('cmpc-'+str(job),'https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/'+str(job)+'?c=cmpc') for job in (18859,18943)]
    asyncio.run(render_sources(roots,output))
    parent,checkpoint=restore_checkpoint()
    quality=Path('output/feed-quality/comparison.json')
    if quality.exists():(output/'feed-quality-comparison.json').write_bytes(quality.read_bytes())
    run=os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
    commit=publish_evidence(output,checkpoint,parent,run)
    print('CMPC_PUBLIC_PROBE '+json.dumps({'data_commit':commit,'sources':json.loads((output/'manifest.json').read_text())['sources'],'published':0,'paid_provider_calls':0},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
