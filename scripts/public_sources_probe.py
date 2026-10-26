"""Public-source evidence with append-only Git backup, no paid provider calls."""
import json
import os
import re
import tempfile
from pathlib import Path

from . import durable_backup, laboratory_exchange, local_history, observe_laboratory, public_portals, publication_queue, verify_candidates
from .common import Budget, canonical_url, utcnow, write_json
from .state import State

BRANCH='radar-public-evidence'
REPAIR='refs/heads/repair/radar-audit-2026-10-11'
git=laboratory_exchange.git


def restore(path):
    advertised=git('ls-remote','--heads','origin','refs/heads/'+BRANCH).decode().strip()
    branch=BRANCH if advertised else laboratory_exchange.DATA_BRANCH
    git('fetch','--no-tags','--depth=1','origin','refs/heads/'+branch+':refs/remotes/origin/'+branch)
    parent=git('rev-parse','refs/remotes/origin/'+branch).decode().strip()
    with tempfile.TemporaryDirectory() as folder:
        root=Path(folder)
        (root/'state.gz').write_bytes(git('show',parent+':state/radar.sqlite3.gz'))
        (root/'manifest.json').write_bytes(git('show',parent+':state/manifest.json'))
        durable_backup.restore(root/'state.gz',root/'manifest.json',path)
    return parent if advertised else None


def archive(files,run_id,parent):
    if not re.fullmatch(r'\d+',run_id):raise ValueError('Invalid run id')
    with tempfile.TemporaryDirectory() as folder:
        env={**os.environ,'GIT_INDEX_FILE':str(Path(folder)/'evidence-index'),
             'GIT_AUTHOR_NAME':'Trabajo Cerca public sources','GIT_AUTHOR_EMAIL':'radar@users.noreply.github.com',
             'GIT_COMMITTER_NAME':'Trabajo Cerca public sources','GIT_COMMITTER_EMAIL':'radar@users.noreply.github.com'}
        git('read-tree',parent if parent else '--empty',env=env)
        for name,raw in files.items():
            if not re.fullmatch(r'[A-Za-z0-9_.-]+',name):raise ValueError('Invalid evidence filename')
            if len(raw)>durable_backup.MAX_BACKUP_BYTES:raise ValueError('Evidence exceeds budget')
            blob=git('hash-object','-w','--stdin',data=raw,env=env).decode().strip()
            destinations=['latest/'+name,'history/'+run_id+'/'+name]
            if name in ('radar.sqlite3.gz','manifest.json'):destinations.append('state/'+name)
            for destination in destinations:git('update-index','--add','--cacheinfo','100644,'+blob+','+destination,env=env)
        tree=git('write-tree',env=env).decode().strip()
        commit=git('commit-tree',tree,*(['-p',parent] if parent else []),data=('Public source evidence '+run_id+'\n').encode(),env=env).decode().strip()
        git('push','origin',commit+':refs/heads/'+BRANCH,env=env)
        return commit


def main():
    if os.environ.get('GITHUB_REF')!=REPAIR or os.environ.get('GITHUB_REPOSITORY')!=laboratory_exchange.REPOSITORY:
        raise ValueError('Public evidence is restricted to the authorized repair branch')
    output=Path('output/public-sources');output.mkdir(parents=True,exist_ok=True)
    path=Path('state/public-sources.sqlite3');parent=restore(path)
    now=utcnow();store=State(path)
    try:
        checkpoints=store.checkpoints()
        portals=public_portals.run(output=output,places=['Angol','Collipulli'],checkpoints=checkpoints,budget=Budget(90),max_requests=10,now=now)
        local=local_history.run(output=output,checkpoints=checkpoints,budget=Budget(180),max_pages=13,now=now)
        store.ingest(portals['candidates']+local['candidates'],now)
        inventory={item['url']:item for item in store.inventory()}
        for row in local['notice_evidence']:
            if row.get('status')=='verified' and row['url'] in inventory:store.record_result(inventory[row['url']],row,now)
        for report in (portals,local):
            for source,value in report['checkpoints'].items():store.checkpoint(source,value,now)
        latest_urls={item['url'] for item in portals['candidates']}
        latest=[item for item in store.inventory() if item['url'] in latest_urls]
        verification=verify_candidates.run(candidates=latest,output=output,limit=10,budget=Budget(120),now=now)
        for row in verification['results']:
            original=canonical_url(row['candidate_url'])
            store.record_result(inventory[original],row,now)
        queue=publication_queue.prepare(store,output=output,now=now)
        summary={'checked_at':now.isoformat(),'portal_candidates':portals['candidate_count'],'local_candidates':local['candidate_count'],
                 'local_notices_verified':local['verified_notices'],'portal_verified':verification['verified'],
                 'ready':queue['ready_count'],'published':0,'publication_confirmed':False,'paid_provider_calls':0,
                 'historical_coverage_complete':False,'inventory_count':len(store.inventory()),
                 'portal_diagnostics':portals['diagnostics'],'local_diagnostics':local['diagnostics']}
        store.record_run(summary,now)
        write_json(output/'probe-summary.json',summary)
    finally:store.close()
    durable_backup.snapshot(path,output/'backup')
    files={file.name:file.read_bytes() for file in output.glob('*.json')}
    for name in ('radar.sqlite3.gz','manifest.json'):files[name]=(output/'backup'/name).read_bytes()
    commit=archive(files,os.environ['GITHUB_RUN_ID'],parent)
    print('PUBLIC_SOURCE_PROBE '+json.dumps({**summary,'evidence_branch':BRANCH,'evidence_commit':commit},ensure_ascii=False))


if __name__=='__main__':main()
