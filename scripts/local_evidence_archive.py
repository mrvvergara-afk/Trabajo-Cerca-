"""Append public audit evidence and a cursor to a separate branch; never writes app data."""
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

BRANCH='radar-local-evidence'
REPAIR='refs/heads/repair/radar-audit-2026-10-11'
FILES=('social-checkpoint.json','existing-social-evidence.json','existing-posters-ocr.json','local-source-audit.json')


def git(*args, data=None, env=None):
    return subprocess.check_output(['git',*args],input=data,env=env)


def restore_checkpoint():
    # An unavailable remote must fail, rather than resetting the cursor or replacing its history.
    advertised=git('ls-remote','--heads','origin','refs/heads/'+BRANCH).decode().strip()
    if not advertised:return None
    git('fetch','--no-tags','--depth=1','origin','refs/heads/'+BRANCH+':refs/remotes/origin/'+BRANCH)
    parent=git('rev-parse','refs/remotes/origin/'+BRANCH).decode().strip()
    raw=git('show',parent+':latest/social-checkpoint.json')
    value=json.loads(raw)
    if value.get('schema')!='trabajo-cerca.local-evidence-checkpoint.v1':raise ValueError('Invalid archive checkpoint')
    cursor=value.get('nextCursor')
    if cursor is not None and (not isinstance(cursor,str) or len(cursor)>4096):raise ValueError('Invalid archive cursor')
    Path('state').mkdir(exist_ok=True)
    Path('state/local-social-checkpoint.json').write_bytes(raw)
    return parent


def archive(output, run_id, *, parent=None):
    if not re.fullmatch(r'\d+',run_id):raise ValueError('Invalid audit run id')
    values={}
    for name in FILES:
        path=Path(output)/name
        if not path.is_file():raise ValueError('Incomplete evidence archive: '+name)
        raw=path.read_bytes()
        if len(raw)>1024*1024:raise ValueError('Audit file exceeds archive byte budget')
        json.loads(raw)
        values[name]=raw
    with tempfile.TemporaryDirectory() as temporary:
        environment={**os.environ,'GIT_INDEX_FILE':str(Path(temporary)/'evidence-index'),
          'GIT_AUTHOR_NAME':'Trabajo Cerca local audit','GIT_AUTHOR_EMAIL':'radar@users.noreply.github.com',
          'GIT_COMMITTER_NAME':'Trabajo Cerca local audit','GIT_COMMITTER_EMAIL':'radar@users.noreply.github.com'}
        git('read-tree',parent if parent else '--empty',env=environment)
        for name,raw in values.items():
            blob=git('hash-object','-w','--stdin',data=raw,env=environment).decode().strip()
            for path in ('latest/'+name,'history/'+run_id+'/'+name):
                git('update-index','--add','--cacheinfo','100644,'+blob+','+path,env=environment)
        tree=git('write-tree',env=environment).decode().strip()
        commit=git('commit-tree',tree,*(['-p',parent] if parent else []),data=('Unpaid local-source evidence '+run_id+'\n').encode(),env=environment).decode().strip()
        git('push','origin',commit+':refs/heads/'+BRANCH,env=environment)
        return commit


def main():
    if os.environ.get('GITHUB_REF')!=REPAIR:raise ValueError('Local archive is restricted to the repair branch')
    operation=os.environ.get('LOCAL_AUDIT_ARCHIVE_OPERATION')
    if operation=='restore':
        parent=restore_checkpoint()
        Path('state').mkdir(exist_ok=True)
        Path('state/local-evidence-parent').write_text(parent or '')
        print('LOCAL_EVIDENCE_CHECKPOINT '+json.dumps({'resumed':bool(parent)}))
    elif operation=='save':
        parent_path=Path('state/local-evidence-parent')
        if not parent_path.exists():raise ValueError('Missing archive parent checkpoint')
        commit=archive('output/local-source-audit',os.environ['GITHUB_RUN_ID'],parent=parent_path.read_text() or None)
        print('LOCAL_EVIDENCE_ARCHIVE '+json.dumps({'commit':commit,'branch':BRANCH,'app_writes':0,'published':0}))
    else:raise ValueError('Unknown archive operation')


if __name__=='__main__':main()
