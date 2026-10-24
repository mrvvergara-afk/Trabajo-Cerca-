"""Read only newly discovered original portal notices, never manufacture dates from lists."""
import asyncio
import json
import os
from pathlib import Path
from .common import utcnow,write_json
from .document_queue_reader import publish_evidence,restore_checkpoint
from .render_public_documents import main as render_public
from .verify_candidates import evaluate


def main():
    if os.environ.get('GITHUB_REF')!='refs/heads/repair/mulchen-captura-2026-10-17':raise ValueError('repair_branch_required')
    config=json.loads(Path('config/portal-individual-review-2026-10-20.json').read_text())
    output=Path('output/portal-individual-review')
    asyncio.run(render_public(roots=[(page['key'],page['url']) for page in config['pages']],destination=output))
    manifest=json.loads((output/'manifest.json').read_text());rows=[]
    for page in manifest['sources']:
        if page.get('access')!='rendered':rows.append({'url':page['url'],'status':'pending','reason':page.get('error')});continue
        raw=Path(page['html_file']).read_text()
        row=evaluate({'url':page['url']},raw,page['final_url'],status=page['http'],now=utcnow())
        rows.append({**row,'source_url':page['url'],'rendered_html_sha256':page['rendered_html_sha256'],'captured_at':utcnow().isoformat()})
    report={'schema':'trabajo-cerca.portal-individual-review.v1','rows':rows,'published':0,'paid_provider_calls':0,'list_dates_used_as_original':False}
    write_json(output/'review.json',report)
    parent,checkpoint=restore_checkpoint();commit=publish_evidence(output,checkpoint,parent,os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1'))
    print('PORTAL_INDIVIDUAL_REVIEW '+json.dumps({**report,'data_commit':commit},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
