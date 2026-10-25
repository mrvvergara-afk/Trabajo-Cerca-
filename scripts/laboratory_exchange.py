"""Small free-source pilot and GitHub-signed laboratory exchange. No AppDeploy writer."""
import base64
import hashlib
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from . import chiletrabajos_direct, durable_backup, publication_queue, verify_candidates
    from .common import Budget, parse_date, safe_error, utcnow, write_json
    from .state import State
except ImportError:
    import chiletrabajos_direct, durable_backup, publication_queue, verify_candidates
    from common import Budget, parse_date, safe_error, utcnow, write_json
    from state import State

REPOSITORY = 'mrvvergara-afk/Trabajo-Cerca-'
REPOSITORY_ID = '1411752840'
PRODUCER_BRANCH = 'repair/radar-audit-2026-10-11'
DOCUMENT_PRODUCER_BRANCH = 'repair/mulchen-captura-2026-10-17'
DATA_BRANCH = 'radar-state-laboratorio'
AUDIENCE = 'urn:trabajo-cerca:lab:1411752840:'


def git(*args, data=None, env=None):
    return subprocess.check_output(['git', *args], input=data, env=env)


def restore_from_git(state_path, reference='refs/remotes/origin/radar-state-laboratorio'):
    if Path(state_path).exists():
        raise ValueError('Refuse to replace an existing local history database')
    commit = git('rev-parse', '--verify', reference).decode().strip()
    import tempfile
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        (root / 'state.gz').write_bytes(git('show', commit + ':state/radar.sqlite3.gz'))
        (root / 'manifest.json').write_bytes(git('show', commit + ':state/manifest.json'))
        durable_backup.restore(root / 'state.gz', root / 'manifest.json', state_path)
    return commit


def pilot(state_path, output, *, now=None, collector=None, checker=verify_candidates.check):
    now, output = now or utcnow(), Path(output)
    output.mkdir(parents=True, exist_ok=True)
    store = State(state_path)
    budget = Budget(100)
    try:
        if collector is None:
            collected = chiletrabajos_direct.run(output=output, places=['Angol'], budget=budget, now=now)
        else:
            collected = collector()
        store.ingest(collected.get('candidates', []), now)
        verified = verify_candidates.run(state=store, output=output, checker=checker,
                                         budget=budget, limit=3, now=now)
        queue = publication_queue.prepare(store, output=output, now=now)
        reasons = {}
        for row in store.inventory():
            reason = (row.get('verification') or {}).get('reason', 'not_checked_in_bounded_pilot')
            reasons[reason] = reasons.get(reason, 0) + 1
        summary = {'mode':'laboratory', 'detected':len(collected.get('candidates', [])),
                   'checked':verified['checked'], 'ready':queue['ready_count'], 'published_count':0,
                   'publication_confirmed':False, 'verification_reasons':reasons,
                   'collector_diagnostics':collected.get('diagnostics', []), 'paid_provider_calls':0}
        errors = [entry for entry in summary['collector_diagnostics'] if entry.get('status') == 'error']
        summary['status'] = ('source_blocked' if errors and len(errors) == len(summary['collector_diagnostics'])
                             else 'ready_for_lab_ingestion' if queue['ready_count'] else 'no_verified_offers')
        store.record_run(summary, now)
        write_json(output / 'laboratory_pilot.json', summary)
        return queue, summary
    finally:
        store.close()


def unsigned_body(queue, context, *, now=None):
    now = now or utcnow()
    reviewed_refs = {'refs/heads/' + PRODUCER_BRANCH, 'refs/heads/' + DOCUMENT_PRODUCER_BRANCH}
    if context.get('repository') != REPOSITORY or context.get('repository_id') != REPOSITORY_ID or context.get('ref') not in reviewed_refs:
        raise ValueError('Producer must be the authorized laboratory repository and branch')
    if not re.fullmatch('[a-f0-9]{40}', context.get('sha', '')) or not re.fullmatch('[0-9]+', context.get('run_id', '')):
        raise ValueError('Invalid producer SHA or run ID')
    if queue.get('schema') != 'trabajo-cerca.ingestion.v1' or queue.get('published_count') != 0:
        raise ValueError('Expected a verified local queue without publication claims')
    generated = parse_date(queue.get('generated_at'))
    if not generated or generated > now or (now - generated).total_seconds() > 3600:
        raise ValueError('Queue requires a fresh preparation')
    # The pilot remains deliberately small; other ready records stay in durable SQLite.
    body = {'schema':'trabajo-cerca.exchange.v1', 'environment':'laboratory',
            **context, 'generated_at':now.isoformat(), 'records':queue.get('records', [])[:3]}
    raw = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    if len(raw) > 128 * 1024:
        raise ValueError('Batch exceeds laboratory byte budget')
    return raw


def signed_envelope(body, token):
    parts = token.split('.')
    if len(parts) != 3 or any(not re.fullmatch('[A-Za-z0-9_-]+', part) for part in parts):
        raise ValueError('Malformed GitHub proof')
    return {'schema':'trabajo-cerca.signed-exchange.v1', 'body_base64':base64.b64encode(body).decode(),
            'proof':{'header':parts[0], 'claims':parts[1], 'signature':parts[2]}}


def request_proof(body):
    request_url = os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']
    # This is the runner's injected OIDC request URL, not an app-chosen credential or endpoint.
    delimiter = '&' if '?' in request_url else '?'
    audience = AUDIENCE + hashlib.sha256(body).hexdigest()
    request = urllib.request.Request(request_url + delimiter + urllib.parse.urlencode({'audience':audience}),
                                     headers={'Authorization':'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    with urllib.request.urlopen(request, timeout=12) as response:
        data = json.loads(response.read(32000))
    return data['value']


def publish_git_snapshot(files, run_id, *, expected_parent=None):
    """Use a separate index and an ordinary fast-forward push to the data branch only."""
    if not re.fullmatch('[0-9]+', str(run_id)):
        raise ValueError('Invalid run ID')
    import tempfile
    with tempfile.TemporaryDirectory() as temporary:
        env = {**os.environ, 'GIT_INDEX_FILE':str(Path(temporary) / 'data-index'),
               'GIT_AUTHOR_NAME':'Trabajo Cerca radar', 'GIT_AUTHOR_EMAIL':'radar@users.noreply.github.com',
               'GIT_COMMITTER_NAME':'Trabajo Cerca radar', 'GIT_COMMITTER_EMAIL':'radar@users.noreply.github.com'}
        if expected_parent:
            git('read-tree', expected_parent, env=env)
        else:
            git('read-tree', '--empty', env=env)
        for path, value in files.items():
            if not re.fullmatch(r'(state|exchange|reports|history)/[A-Za-z0-9_./-]+', path) or '..' in path.split('/'):
                raise ValueError('Unexpected data snapshot path')
            if len(value) > durable_backup.MAX_BACKUP_BYTES:
                raise ValueError('Snapshot file exceeds storage budget')
            sha = git('hash-object', '-w', '--stdin', data=value, env=env).decode().strip()
            git('update-index', '--add', '--cacheinfo', '100644,' + sha + ',' + path, env=env)
        tree = git('write-tree', env=env).decode().strip()
        parents = ['-p', expected_parent] if expected_parent else []
        commit = git('commit-tree', tree, *parents, data=('Laboratory durable radar snapshot ' + str(run_id) + '\n').encode(), env=env).decode().strip()
        # No force, no checkout of main, no deletion of old snapshots or source files.
        git('push', 'origin', commit + ':refs/heads/' + DATA_BRANCH, env=env)
    return commit


def main():
    context = {'repository':os.environ.get('GITHUB_REPOSITORY'),
               'repository_id':os.environ.get('RADAR_REPOSITORY_ID'), 'ref':os.environ.get('GITHUB_REF'),
               'sha':os.environ.get('GITHUB_SHA'), 'run_id':os.environ.get('GITHUB_RUN_ID')}
    if context['repository'] != REPOSITORY or context['ref'] != 'refs/heads/' + PRODUCER_BRANCH:
        raise ValueError('Laboratory producer is disabled outside the repair branch')
    state_path, output = Path('state/radar.sqlite3'), Path('output')
    queue, report = pilot(state_path, output)
    backup = durable_backup.snapshot(state_path, 'durable_snapshot')
    body = unsigned_body(queue, context)
    envelope = signed_envelope(body, request_proof(body))
    snapshot_root = Path('durable_snapshot')
    files = {'state/radar.sqlite3.gz':(snapshot_root / 'radar.sqlite3.gz').read_bytes(),
             'state/manifest.json':(snapshot_root / 'manifest.json').read_bytes(),
             'history/' + context['run_id'] + '/radar.sqlite3.gz':(snapshot_root / 'radar.sqlite3.gz').read_bytes(),
             'history/' + context['run_id'] + '/manifest.json':(snapshot_root / 'manifest.json').read_bytes(),
             'exchange/latest.json':(json.dumps(envelope, separators=(',', ':')) + '\n').encode(),
             'reports/latest.json':(json.dumps(report, ensure_ascii=False) + '\n').encode()}
    parent = os.environ.get('RADAR_DATA_PARENT') or None
    commit = publish_git_snapshot(files, context['run_id'], expected_parent=parent)
    print(json.dumps({'data_commit':commit, 'backup_counts':backup['counts'], **report}, ensure_ascii=False))
    if report['status'] == 'source_blocked':
        raise SystemExit(2)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Never print injected OIDC tokens, request headers or response bodies.
        print('LABORATORY_EXCHANGE_FAILED ' + safe_error(exc))
        raise SystemExit(1)
