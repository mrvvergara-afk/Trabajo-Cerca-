"""Read the live SDK document queue and retain new evidence in an isolated data branch.

This worker does not sign offers or call an AppDeploy writer. Verified publication
still requires the existing evidence review and authorized signed receiver.
"""
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import tempfile
import urllib.parse
from html.parser import HTMLParser
from pathlib import Path

from .common import Budget, canonical_url, decode_public_html, parse_date, utcnow, write_json
from .document_cycle import read_app_work
from .document_reference_proof import prove
from .laboratory_exchange import REPOSITORY, DOCUMENT_PRODUCER_BRANCH
from .local_history import DATE, literal_date
from .local_source_audit import discover, public_medium_url, same_publisher, source_error
from .public_document_http import PublicCapture, public_url
from .public_source_adapters import source_adapter

DATA_BRANCH = 'radar-document-reader-state'
SCHEMA = 'trabajo-cerca.document-reader-state.v1'
CATALOGUES = {'municipalidadrenaico.cl':'https://municipalidadrenaico.cl/concursos-publicos/'}
EDITIONS = 'https://www.malleco7.cl/ediciones-digitales-malleco7/'


def identity(value):
    parts = urllib.parse.urlsplit(public_url(value))
    return urllib.parse.urlunsplit((parts.scheme,parts.netloc.removeprefix('www.'),parts.path.rstrip('/'),parts.query,''))


class LinkSections(HTMLParser):
    """Keep each catalogue attachment beside its own heading and reception text."""
    def __init__(self, origin):
        super().__init__(convert_charrefs=True)
        self.origin, self.blocks, self.skip = origin, [], []
        self.block = {'text':[], 'links':[]}
        self.blocks.append(self.block)

    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','nav','header','footer','aside'):
            self.skip.append(tag)
        if self.skip:
            return
        if re.fullmatch('h[1-6]', tag):
            self.block = {'text':[], 'links':[]}
            self.blocks.append(self.block)
        if tag == 'a':
            href = dict(attrs).get('href')
            try:
                target = public_url(urllib.parse.urljoin(self.origin, href or ''))
                if same_publisher(self.origin, target):
                    self.block['links'].append(identity(target))
            except ValueError:
                pass

    def handle_endtag(self, tag):
        if self.skip and self.skip[-1] == tag:
            self.skip.pop()

    def handle_data(self, text):
        if not self.skip:
            self.block['text'].append(text)

    def section(self, target):
        matches = [re.sub(r'\s+',' ',' '.join(block['text'])).strip()
                   for block in self.blocks if identity(target) in block['links']]
        return matches[0] if len(set(matches)) == 1 else None


def reception_status(text, now):
    """Only an explicit reception deadline in this attachment's section can close it."""
    pattern = r'(?:antecedentes|postulaciones)\s+(?:se\s+)?(?:recibir[aá]n|recepcionar[aá]n).{0,35}?hasta.{0,70}?('+DATE+r')'
    deadlines = [(literal_date(match[1], True),match[0]) for match in re.finditer(pattern,text,re.I)]
    dates = {date for date,_ in deadlines if date}
    if len(dates) == 1 and next(iter(dates)) < now:
        return {'status':'expired','reason':'catalogue_explicit_reception_closed',
                'deadline':next(iter(dates)).isoformat(),'literal':deadlines[0][1],
                'source_published_at':None,'historical_recentness':'not_confirmed',
                'verified':False,'active':False}
    return {'status':'requires_document_reading','reason':'catalogue_deadline_not_confirmed',
            'source_published_at':None,'verified':False,'active':False}


def recover_parent(item, capture, budget, cache, now):
    url = public_url(item['url'])
    parent = public_url(item.get('publisher_page') or url)
    if not same_publisher(url,parent):
        raise ValueError('publisher_page_mismatch')
    if identity(parent) == identity(url) and public_medium_url(url):
        parent = CATALOGUES.get(urllib.parse.urlsplit(url).hostname.removeprefix('www.'))
        if not parent:
            return {'url':url,'status':'provenance_missing','reason':'primary_editorial_page_required'}
    if parent not in cache:
        raw, final, mime, _ = capture(parent,budget)
        if mime not in ('text/html','application/xhtml+xml'):
            raise ValueError('primary_page_not_html')
        parser = LinkSections(final)
        parser.feed(decode_public_html(raw))
        cache[parent] = (raw,final,parser)
    raw, final, parser = cache[parent]
    result = {'url':url,'publisher_page':final,'parent_html_sha256':hashlib.sha256(raw).hexdigest(),
              'source_published_at':None,'verified':False,'active':False}
    if public_medium_url(url):
        section = parser.section(url)
        if not section:
            return {**result,'status':'provenance_missing','reason':'attachment_link_not_found_in_primary_page'}
        return {**result,**reception_status(section,now),'section':section[:5000]}
    page = discover(decode_public_html(raw),final)
    published = parse_date(page['source_published_at'])
    if published and now-published > dt.timedelta(days=45):
        return {**result,'status':'older_than_45_days','reason':'original_editorial_date_outside_window',
                'source_published_at':published.isoformat()}
    return {**result,'status':'requires_document_reading','reason':'primary_page_recovered',
            'source_published_at':page['source_published_at']}


def recent_editions(raw, now):
    # Use literal link labels, never a WordPress upload directory or capture time.
    from .local_source_audit import Document
    page = Document()
    page.feed(raw)
    result = {}
    for href,label in page.links:
        try:
            target = public_url(urllib.parse.urljoin(EDITIONS,href))
        except ValueError:
            continue
        if not same_publisher(target,EDITIONS) or not re.fullmatch(r'/edicion-[a-z0-9-]+/',urllib.parse.urlsplit(target).path):
            continue
        match = re.search(DATE,label,re.I)
        date = literal_date(match[0]) if match else None
        if date and now-dt.timedelta(days=45) <= date <= now:
            result[target] = {'url':target,'publisher_page':target,'source':'Malleco 7 · edición digital',
                              'edition_label':label,'edition_date':date.isoformat()}
    return sorted(result.values(),key=lambda item:item['edition_date'],reverse=True)[:4]


def reviewed_references():
    previous = json.loads(Path('docs/evidence/ampliacion-avisos-dificiles-2026-10-18.json').read_text())
    result = {}
    for reference in previous['references']:
        url = reference['url']
        request = next((row for row in reference.get('source_requests',[]) if row.get('url') == url and row.get('status') == 200),None)
        if request:
            documents = {identity(row['url']) for row in reference.get('documents',[])
                         if '.pdf' in urllib.parse.urlsplit(row['url']).path.lower() or 'phocadownload' in row['url']}
            result[identity(url)] = {'sha256':request['sha256'],'documents':documents}
    return result


def prior_reference_same_documents(parent, raw, known):
    previous = known.get(identity(parent))
    if not previous:
        return False
    if hashlib.sha256(raw).hexdigest() == previous['sha256']:
        return True
    page = discover(decode_public_html(raw),parent)
    documents = {identity(row['url']) for row in page['candidates']
                 if '.pdf' in urllib.parse.urlsplit(row['url']).path.lower() or 'phocadownload' in row['url']}
    # Changing a nonce or navigation cannot justify repeating the four old OCR runs.
    # Unchanged URLs do not prove unchanged bytes; this status is a reuse decision,
    # not a renewed verification of the document or its date.
    return documents == previous['documents']


def read_queue(work, output, checkpoint, *, capture=None, now=None, proof=prove):
    now = now or utcnow()
    output = Path(output)
    output.mkdir(parents=True,exist_ok=True)
    capture = capture or PublicCapture(output)
    overall = Budget(650)
    cache, results, selected = {}, [], {}
    known = reviewed_references()
    checkpoint.setdefault('items',{})
    incoming = list(work['items'])
    rendered_path = output/'rendered/manifest.json'
    rendered_sources = []
    if rendered_path.exists():
        rendered_sources = json.loads(rendered_path.read_text()).get('sources',[])
        for rendered in rendered_sources:
            if rendered.get('access') != 'rendered':
                continue
            for candidate in rendered.get('candidates',[])[:6]:
                if candidate.get('kind') == 'page':
                    incoming.append({'url':candidate['url'],'publisher_page':candidate['url'],
                                     'source':'Rendered municipal index','discovered_from':rendered['url']})
    for position,item in enumerate(incoming):
        if overall.remaining()<12:
            results.extend({'url':row.get('url'),'status':'deferred','reason':'reader_run_budget_exhausted'} for row in incoming[position:])
            break
        try:
            public_url(item['url'])
            if item.get('kind') == 'rendered_page':
                continue
            outcome = recover_parent(item,capture,overall,cache,now)
            if outcome['status'] == 'requires_document_reading':
                parent = outcome['publisher_page']
                old = checkpoint['items'].get(identity(parent),{})
                parent_bytes = next(value[0] for value in cache.values() if identity(value[1]) == identity(parent))
                if prior_reference_same_documents(parent,parent_bytes,known):
                    outcome.update(status='previously_reviewed_not_repeated',reason='no_changed_document_reference_proven')
                elif old.get('parent_html_sha256') == outcome['parent_html_sha256'] and old.get('reading_complete') is True:
                    outcome.update(status='previously_read_unchanged',reason='durable_reading_reused')
                elif (source_adapter(parent) or {}).get('family') == 'local':
                    selected.setdefault(identity(parent),outcome)
            results.append(outcome)
        except Exception as exc:
            results.append({'url':item.get('url'),'status':'blocked_or_unavailable','reason':source_error(exc)})
    try:
        raw, _, _, _ = capture(EDITIONS,Budget(35))
        for item in recent_editions(decode_public_html(raw),now):
            parent = item['url']
            raw, final, _, _ = capture(parent,Budget(30))
            digest = hashlib.sha256(raw).hexdigest()
            outcome = {**item,'parent_html_sha256':digest,'status':'requires_document_reading'}
            if prior_reference_same_documents(parent,raw,known):
                outcome.update(status='previously_reviewed_not_repeated',reason='no_changed_document_reference_proven')
            elif checkpoint['items'].get(identity(parent),{}).get('parent_html_sha256') == digest and checkpoint['items'][identity(parent)].get('reading_complete') is True:
                outcome.update(status='previously_read_unchanged',reason='durable_reading_reused')
            else:
                selected.setdefault(identity(parent),{**outcome,'publisher_page':final})
            results.append(outcome)
    except Exception as exc:
        results.append({'url':EDITIONS,'status':'blocked_or_unavailable','reason':source_error(exc)})
    readings = []
    # No fixed four-reference rerun: these choices originate in today's SDK queue/index.
    choices = sorted(selected.items(),key=lambda row:(
        not bool(row[1].get('source_published_at') or row[1].get('edition_date')),
        -(parse_date(row[1].get('source_published_at') or row[1].get('edition_date')) or dt.datetime(1970,1,1,tzinfo=dt.timezone.utc)).timestamp()))[:3]
    for key,item in choices:
        root = output/'references'/hashlib.sha256(key.encode()).hexdigest()[:16]
        try:
            if overall.remaining()<15:
                readings.append({'url':item['publisher_page'],'reading_saved':False,'reason':'reader_run_budget_exhausted'})
                continue
            report = proof(item['publisher_page'],root,budget=Budget(min(220,overall.remaining())),max_work=40,
                           fetcher=capture,now=now,ocr_all_pdf_pages='malleco7.cl' in key)
            complete = not any(status != 'done' for status in report['counts']['statuses']) and all(
                row['status']=='done' for document in report['documents'] for row in document['pages'])
            reading = {'url':item['publisher_page'],'documents':report['documents'],
                       'document_reviews':report['document_reviews'],'evaluations':report['evaluations'],
                       'persistence_check':report['persistence_check'],'reading_complete':complete,
                       'source_published_at':item.get('source_published_at'),
                       'parent_html_sha256':item['parent_html_sha256'],'reading_saved':True,
                       'verified':False,'published':0}
            readings.append(reading)
            checkpoint['items'][key] = {**item,'reading_saved':True,'reading_complete':complete,'checked_at':now.isoformat()}
        except Exception as exc:
            readings.append({'url':item['publisher_page'],'reading_saved':False,'reason':source_error(exc)})
    for row in results:
        if row.get('parent_html_sha256'):
            key = identity(row['url'])
            checkpoint['items'][key] = {**checkpoint['items'].get(key,{}),**row,'checked_at':now.isoformat()}
    summary = {'schema':'trabajo-cerca.document-queue-read.v1','checked_at':now.isoformat(),
               'sdk_queue_items':len(work['items']),'classified':results,'readings':readings,
               'read_candidates':len(selected),'read_references':len(readings),
               'new_offers_confirmed':0,'published':0,'paid_provider_calls':0,
               'coverage_complete':False,'publication_bridge_invoked':False,'requests':capture.requests}
    summary['rendered_sources'] = rendered_sources
    write_json(output/'reader-summary.json',summary)
    return summary


def git(*args, cwd=None, data=None, env=None):
    return subprocess.check_output(['git',*args],cwd=cwd,input=data,env=env)


def restore_checkpoint(repository=None):
    refs = git('ls-remote','--heads','origin','refs/heads/'+DATA_BRANCH,cwd=repository).decode().strip()
    if not refs:
        return None, {'schema':SCHEMA,'items':{}}
    parent = refs.split()[0]
    git('fetch','origin',parent,cwd=repository)
    raw = git('show',parent+':state/index.json',cwd=repository)
    if len(raw) > 2*1024*1024:
        raise ValueError('reader_checkpoint_budget_exceeded')
    state = json.loads(raw)
    if state.get('schema') != SCHEMA or not isinstance(state.get('items'),dict):
        raise ValueError('reader_checkpoint_invalid_preserve_prior')
    return parent,state


def publish_evidence(output, checkpoint, parent, run_id, *, repository=None):
    if not re.fullmatch(r'\d+(?:-\d+)?',str(run_id)) or len(checkpoint.get('items',{})) > 3000:
        raise ValueError('reader_history_budget_exceeded')
    output = Path(output)
    files = {'state/index.json':(json.dumps(checkpoint,ensure_ascii=False,sort_keys=True)+'\n').encode()}
    for path in output.rglob('*'):
        if not path.is_file() or 'restored-state' in path.parts:
            continue
        if path.parent.name == 'objects' and re.fullmatch('[a-f0-9]{64}',path.name):
            data = path.read_bytes()
            if hashlib.sha256(data).hexdigest() != path.name:
                raise ValueError('reader_evidence_hash_mismatch')
            files['objects/'+path.name] = data
        elif path.suffix in ('.json','.gz','.html'):
            files['history/'+str(run_id)+'/'+path.relative_to(output).as_posix()] = path.read_bytes()
    with tempfile.TemporaryDirectory() as directory:
        env = {**os.environ,'GIT_INDEX_FILE':str(Path(directory)/'index'),
               'GIT_AUTHOR_NAME':'Trabajo Cerca reader','GIT_COMMITTER_NAME':'Trabajo Cerca reader',
               'GIT_AUTHOR_EMAIL':'radar@users.noreply.github.com','GIT_COMMITTER_EMAIL':'radar@users.noreply.github.com'}
        git('read-tree',parent,env=env,cwd=repository) if parent else git('read-tree','--empty',env=env,cwd=repository)
        if sum(len(value) for value in files.values()) > 100*1024*1024:
            raise ValueError('reader_evidence_run_budget_exceeded')
        for path,value in files.items():
            digest = git('hash-object','-w','--stdin',data=value,env=env,cwd=repository).decode().strip()
            git('update-index','--add','--cacheinfo','100644,'+digest+','+path,env=env,cwd=repository)
        tree = git('write-tree',env=env,cwd=repository).decode().strip()
        commit = git('commit-tree',tree,*(['-p',parent] if parent else []),
                     data=('Preserve live document reader evidence '+str(run_id)+'\n').encode(),env=env,cwd=repository).decode().strip()
        git('push','origin',commit+':refs/heads/'+DATA_BRANCH,env=env,cwd=repository)
    return commit


def main():
    if os.environ.get('GITHUB_REPOSITORY') != REPOSITORY or os.environ.get('GITHUB_REF') != 'refs/heads/'+DOCUMENT_PRODUCER_BRANCH:
        raise ValueError('document_reader_restricted_to_authorized_branch')
    output = Path('output/document-reader')
    output.mkdir(parents=True,exist_ok=True)
    parent, checkpoint = restore_checkpoint()
    work = read_app_work(output)
    summary = read_queue(work,output,checkpoint)
    run_id = os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT','1')
    commit = publish_evidence(output,checkpoint,parent,run_id)
    receipt = {'data_branch':DATA_BRANCH,'data_commit':commit,'sdk_queue_items':summary['sdk_queue_items'],
               'classified_count':len(summary['classified']),'classifications':summary['classified'],
               'read_references':summary['read_references'],'readings':summary['readings'],
               'new_offers_confirmed':0,'published':0,'paid_provider_calls':0}
    write_json(output/'durable-receipt.json',receipt)
    print('DOCUMENT_QUEUE_READER '+json.dumps(receipt,ensure_ascii=False),flush=True)


if __name__ == '__main__':
    main()
