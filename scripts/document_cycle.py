"""Free document verification and signed ingestion; never writes directly to AppDeploy."""
import datetime as dt
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import urllib.parse
from pathlib import Path

from . import curated_public_cycle, durable_backup, laboratory_exchange, local_history, observe_laboratory, publication_queue, public_sources_probe
from .common import Budget, canonical_url, parse_date, safe_error, utcnow, write_json
from .local_source_audit import MEDIA, discover, fetch_public, read_medium, same_publisher, source_error
from .public_source_adapters import source_adapter
from .state import State

REFS = {'refs/heads/' + laboratory_exchange.PRODUCER_BRANCH, 'refs/heads/main'}
CHECKPOINT = 'free_document_cycle_v1'


def context_from_environment():
    context = {'repository':os.environ.get('GITHUB_REPOSITORY'),
               'repository_id':os.environ.get('RADAR_REPOSITORY_ID'),
               'ref':os.environ.get('GITHUB_REF'), 'sha':os.environ.get('GITHUB_SHA'),
               'run_id':os.environ.get('GITHUB_RUN_ID')}
    if context['repository'] != laboratory_exchange.REPOSITORY or context['ref'] not in REFS:
        raise ValueError('Document producer is restricted to the authorized repository and branches')
    return context


def read_app_work(output):
    """The frontend SDK performs the read; there is no invented HTTP writer or token."""
    browser = shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not browser: raise RuntimeError('readonly_browser_unavailable')
    with tempfile.TemporaryDirectory() as directory:
        environment = {k:v for k,v in os.environ.items() if k not in ('GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')}
        result = subprocess.run([browser,'--headless','--disable-gpu','--no-first-run',
          '--disable-background-networking','--user-data-dir='+directory,'--virtual-time-budget=20000',
          '--dump-dom','https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?radar-public-proof=1#operacion'],
          capture_output=True,text=True,timeout=90,env=environment,check=True)
    parser = observe_laboratory.ProofElement('radar-public-check'); parser.feed(result.stdout)
    if not parser.parts: raise RuntimeError('document_work_read_unavailable')
    proof = json.loads(''.join(parser.parts))
    state = proof.get('state') or {}
    work = state.get('documentWork') or {}
    if (state.get('readOnly') is not True or state.get('providerCalls') != 0 or
        work.get('schema') != 'trabajo-cerca.document-work.v1' or work.get('read_only') is not True or
        work.get('paid_provider_calls') != 0 or not isinstance(work.get('items'),list) or len(work['items']) > 100):
        raise ValueError('Untrusted or incomplete document-work read')
    write_json(output / 'app-document-work.json',work)
    return work


def merge_history(store, path):
    """Union both existing histories atomically, retaining every audit row and checkpoint."""
    source = sqlite3.connect('file:'+urllib.parse.quote(str(Path(path).resolve()))+'?mode=ro',uri=True)
    source.row_factory = sqlite3.Row
    target = store.connection
    try:
        with target:
            for row in source.execute('SELECT * FROM candidates'):
                old = target.execute('SELECT * FROM candidates WHERE id=? OR url=?',(row['id'],row['url'])).fetchone()
                if not old:
                    columns = list(row.keys())
                    target.execute('INSERT INTO candidates('+','.join(columns)+') VALUES('+','.join('?' for _ in columns)+')',tuple(row))
                    continue
                if old['id'] != row['id'] or old['url'] != row['url']: raise ValueError('History identity conflict')
                payload = {**json.loads(row['payload']),**json.loads(old['payload'])}
                payload['commune_queries'] = sorted(set(json.loads(row['payload']).get('commune_queries',[])) |
                                                    set(json.loads(old['payload']).get('commune_queries',[])))
                newer = (parse_date(row['last_attempt_at']) or dt.datetime.min.replace(tzinfo=dt.timezone.utc)) > \
                        (parse_date(old['last_attempt_at']) or dt.datetime.min.replace(tzinfo=dt.timezone.utc))
                selected = row if newer else old
                target.execute('UPDATE candidates SET payload=?,first_seen_at=?,last_seen_at=?,status=?,result=?,last_attempt_at=? WHERE id=?',
                  (json.dumps(payload,ensure_ascii=False),min(old['first_seen_at'],row['first_seen_at']),
                   max(old['last_seen_at'],row['last_seen_at']),selected['status'],selected['result'],selected['last_attempt_at'],row['id']))
            for table,columns in [('observations',('candidate_id','seen_at','payload')),
                                  ('attempts',('candidate_id','checked_at','result')),
                                  ('runs',('completed_at','summary'))]:
                names = ','.join(columns)
                existing = {tuple(r) for r in target.execute('SELECT '+names+' FROM '+table)}
                for row in source.execute('SELECT '+names+' FROM '+table):
                    values = tuple(row)
                    if values not in existing:
                        target.execute('INSERT INTO '+table+'('+names+') VALUES('+','.join('?' for _ in columns)+')',values)
                        existing.add(values)
            for row in source.execute('SELECT * FROM checkpoints'):
                old = target.execute('SELECT * FROM checkpoints WHERE source=?',(row['source'],)).fetchone()
                if not old or row['updated_at'] > old['updated_at']:
                    target.execute('INSERT OR REPLACE INTO checkpoints(source,updated_at,payload) VALUES(?,?,?)',tuple(row))
            columns = ('candidate_id','published_id','feed_manifest','observed_at','payload')
            for row in source.execute('SELECT '+','.join(columns)+' FROM publication_receipts'):
                target.execute('INSERT OR IGNORE INTO publication_receipts('+','.join(columns)+') VALUES(?,?,?,?,?)',tuple(row))
    finally: source.close()


def verify_work_item(item, *, fetcher=fetch_public, reader=read_medium, budget=None, now=None):
    now, budget = now or utcnow(), budget or Budget(90)
    url = canonical_url(item['url']); adapter = source_adapter(url)
    if not adapter or adapter['family'] != 'local': return {'url':url,'status':'pending','reason':'unsupported_document_publisher'}
    publisher = canonical_url(item.get('publisher_page') or url)
    if not same_publisher(url,publisher): return {'url':url,'status':'pending','reason':'media_publisher_not_allowed'}
    if MEDIA.search(url):
        original_date = None
        if publisher != url and source_adapter(publisher):
            raw,final,mime,status = fetcher(publisher,budget)
            if status != 200 or not same_publisher(publisher,final) or mime not in ('text/html','application/xhtml+xml'):
                return {'url':url,'status':'pending','reason':'publisher_page_unavailable'}
            page = discover(raw.decode('utf-8','replace'),final)
            linked = set(page['images']) | {row['url'] for row in page['candidates']}
            if url not in linked: return {'url':url,'status':'pending','reason':'media_not_linked_by_publisher'}
            original_date = page['source_published_at']
        medium = reader(url,publisher,budget)
        result = local_history.verify_notice(medium['text'],url,original_date,sha256=medium['sha256'],now=now,
          complete=medium.get('complete_document') is True and not medium.get('textTruncated') and
          (medium.get('engine') == 'pdftotext-local' or (medium.get('mean_confidence') or 0) >= 70))
        return {**result,'engine':medium['engine'],'publisher_page':publisher,
                'complete_document':medium.get('complete_document') is True,
                'mean_confidence':medium.get('mean_confidence'),'page_count':medium.get('page_count')}
    raw,final,mime,status = fetcher(url,budget)
    if status != 200 or not same_publisher(url,final) or mime not in ('text/html','application/xhtml+xml'):
        return {'url':url,'status':'pending','reason':'publisher_page_unavailable'}
    page = discover(raw.decode('utf-8','replace'),final)
    result = local_history.verify_notice(page['text'],final,page['source_published_at'],
      sha256=hashlib.sha256(raw).hexdigest(),complete=len(page['text']) < 14000,now=now)
    return {**result,'engine':'html-literal'}


def run(store, output, work, *, reader=verify_work_item, collector=local_history.run, now=None, budget=None, record_run=True):
    now, output, budget = now or utcnow(),Path(output),budget or Budget(420)
    prior = store.checkpoints().get(CHECKPOINT,{})
    incoming = []
    for item in work.get('items',[]):
        adapter = source_adapter(item.get('url'))
        if adapter and adapter['family'] == 'local': incoming.append({**item,'url':canonical_url(item['url'])})
    store.ingest(incoming,now)
    inventory = store.inventory()
    def due(row):
        adapter = source_adapter(row['url']); checked = parse_date(row.get('last_attempt_at'))
        wait = dt.timedelta(hours=18 if row.get('state') == 'verified' else 4)
        path = urllib.parse.unquote(urllib.parse.urlsplit(row['url']).path).lower()
        literary_contest = 'concurso' in path and 'microcuento' in path and not any(label in path for label in ('cargo','puesto','vacante','empleo'))
        return adapter and adapter['family'] == 'local' and not literary_contest and (not checked or now-checked >= wait)
    choices = sorted((row for row in inventory if due(row)),key=lambda row:(row.get('state') != 'verified',bool(row.get('last_attempt_at')),
        not bool(MEDIA.search(row['url'])),row.get('last_attempt_at') or '',row['id']))[:3]
    reviewed = []
    for row in choices:
        if budget.remaining() < 5: break
        try: result = reader(row,budget=budget,now=now)
        except Exception as exc: result = {'url':row['url'],'status':'pending','reason':source_error(exc)}
        store.record_result(row,result,now)
        reviewed.append({k:result.get(k) for k in ('url','status','reason','engine','source_published_at','valid_through','complete_document','page_count','mean_confidence')})
    local = collector(output=output,checkpoints=store.checkpoints(),budget=Budget(min(180,budget.remaining())),max_pages=9,now=now)
    store.ingest(local['candidates'],now)
    current = {row['url']:row for row in store.inventory()}
    for notice in local['notice_evidence']:
        if notice.get('status') == 'verified' and notice.get('url') in current: store.record_result(current[notice['url']],notice,now)
    for name,value in local['checkpoints'].items(): store.checkpoint(name,value,now)
    channels = {row['channel']:row for row in prior.get('channels',[])}
    for row in local.get('discovered_channels',[]): channels[row['channel']] = row
    store.checkpoint(CHECKPOINT,{'channels':list(channels.values()),'last_run_at':now.isoformat()},now)
    queue = publication_queue.prepare(store,output=output,now=now)
    documents = [row for row in queue['records'] if row.get('source_evidence')]
    summary = {'schema':'trabajo-cerca.document-cycle.v1','checked_at':now.isoformat(),
      'work_items_received':len(incoming),'checked':len(reviewed),'reviewed':reviewed,
      'local_verified':local['verified_notices'],'documents_ready':len(documents),'batch_records':min(3,len(documents)),
      'discovered_channels':list(channels.values()),'local_diagnostics':local['diagnostics'],
      'inventory_count':len(store.inventory()),'paid_provider_calls':0,'published':0,'publication_confirmed':False,
      'coverage_complete':False}
    if record_run: store.record_run(summary,now)
    write_json(output/'document-cycle.json',summary)
    return {**queue,'records':documents[:3],'ready_count':min(3,len(documents))},summary


def exchange_body(queue, context, now=None):
    # Reuse the same signed schema and byte/time validation for both reviewed execution paths.
    checked = dict(context)
    if checked.get('ref') not in REFS: raise ValueError('Untrusted document producer branch')
    checked['ref'] = 'refs/heads/' + laboratory_exchange.PRODUCER_BRANCH
    raw = laboratory_exchange.unsigned_body(queue,checked,now=now)
    body = json.loads(raw); body['ref'] = context['ref']
    return json.dumps(body,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()


def main():
    context = context_from_environment()
    output = Path('output/documents'); output.mkdir(parents=True,exist_ok=True)
    path = Path('state/document-cycle.sqlite3')
    parent = laboratory_exchange.restore_from_git(path)
    public_path = Path('state/public-history.sqlite3'); public_sources_probe.restore(public_path)
    store = State(path)
    try:
        merge_history(store,public_path)
        work = read_app_work(output)
        queue,summary = run(store,output,work,record_run=False)
        portals,portal_summary = curated_public_cycle.run(store,output,budget=Budget(60))
        queue = curated_public_cycle.merge_batch(queue,portals)
        summary.update(curated_portals=portal_summary,batch_records=len(queue['records']),inventory_count=len(store.inventory()))
        store.record_run(summary)
        write_json(output/'document-cycle.json',summary)
    finally: store.close()
    backup = output/'backup'; manifest = durable_backup.snapshot(path,backup)
    files = {'state/radar.sqlite3.gz':(backup/'radar.sqlite3.gz').read_bytes(),
             'state/manifest.json':(backup/'manifest.json').read_bytes(),
             'history/'+context['run_id']+'/radar.sqlite3.gz':(backup/'radar.sqlite3.gz').read_bytes(),
             'history/'+context['run_id']+'/manifest.json':(backup/'manifest.json').read_bytes(),
             'history/'+context['run_id']+'/document-cycle.json':(output/'document-cycle.json').read_bytes(),
             'history/'+context['run_id']+'/curated-public-cycle.json':(output/'curated-public-cycle.json').read_bytes(),
             'reports/document-cycle.json':(output/'document-cycle.json').read_bytes()}
    if queue['records']:
        body = exchange_body(queue,context)
        envelope = laboratory_exchange.signed_envelope(body,laboratory_exchange.request_proof(body))
        files['exchange/latest.json'] = (json.dumps(envelope,separators=(',',':'))+'\n').encode()
    commit = laboratory_exchange.publish_git_snapshot(files,context['run_id'],expected_parent=parent)
    print('DOCUMENT_CYCLE '+json.dumps({**summary,'data_commit':commit,'backup_counts':manifest['counts'],
      'signed_batch_created':bool(queue['records']),'previous_exchange_preserved':not bool(queue['records'])},ensure_ascii=False))


if __name__ == '__main__':
    try: main()
    except Exception as exc:
        print('DOCUMENT_CYCLE_FAILED '+safe_error(exc)); raise SystemExit(1)
