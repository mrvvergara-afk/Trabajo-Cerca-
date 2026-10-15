"""Isolated source -> original -> page/OCR -> evidence pilot. No AppDeploy writer."""
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
import urllib.parse
from pathlib import Path

from .common import Budget, canonical_url, decode_public_html, parse_date, utcnow, write_json
from .laboratory_exchange import git, REPOSITORY, PRODUCER_BRANCH
from .local_history import verify_notice
from .local_source_audit import Document, HIRING, MEDIA, discover, fetch_public, same_publisher, source_error, tesseract_text
from .public_source_adapters import source_adapter
from .radar_v2_store import PilotStore, restore
from .radar_v2_diagnostics import describe

DATA_BRANCH='radar-pilot-v2-state'
CONFIG=Path('config/radar-v2-pilot.json')
IMAGE_MIMES={'image/png','image/jpeg','image/webp'}
POSTER_HINT=re.compile(r'ofertas? laboral|vacantes?|se (?:busca|necesita|requiere)|buscamos|postulaci[oó]n|concurso|empleo|cargo|afiche',re.I)


def media_allowed(url,origin):
    try:
        target=urllib.parse.urlsplit(canonical_url(url))
        return target.scheme=='https' and (same_publisher(url,origin) or bool(re.search(r'\.fbcdn\.net$',target.hostname or '')))
    except (ValueError,AttributeError):return False


def original_date(payload,now):
    date=parse_date(payload.get('source_published_at'))
    if not date or date>now:return None
    if payload.get('profile'):
        proof=payload.get('date_proof') or {}
        if (proof.get('kind') not in ('facebook_story_creation_time','facebook_visible_datetime') or proof.get('post_url')!=payload.get('source_url')
                or not isinstance(proof.get('literal_epoch'),(int,float)) or date.timestamp()!=proof['literal_epoch']
                or not re.fullmatch('[a-f0-9]{64}',proof.get('source_sha256',''))):return None
        if proof['kind']=='facebook_visible_datetime' and (proof.get('timezone')!='America/Santiago' or not re.search(r'\b20\d{2}\b',proof.get('literal_label',''))):return None
    return date


def json_blob(store,value):
    return store.put((json.dumps(value,ensure_ascii=False,sort_keys=True)+'\n').encode(),'application/json')


def social_children(capture,now):
    children=[]
    for post in capture.get('posts',[])[:12]:
        value={**post,'source_url':post['url'],'source':capture.get('key'), 'source_family':'social',
               'capture_slot':int(now.timestamp()//14400)}
        date=original_date(value,now)
        if date and now-date>dt.timedelta(days=45):continue
        suffix=':'+str(value['capture_slot'])+':v4'
        children.append(('evaluate',post['url']+':caption'+suffix,value))
        for medium in post.get('media',[])[:3]:
            if media_allowed(medium,post['url']):children.append(('media',post['url']+':'+medium+suffix,{**value,'media_url':medium}))
    return children


def web_work(store,payload,budget,fetcher=fetch_public,now=None):
    now=now or utcnow();url=payload['url']
    control = payload['source'].get('scope') == 'publication_control'
    if control:
        adapter = source_adapter(url)
        if not adapter or adapter['name'] != 'Bolsa Nacional de Empleo' or payload.get('page_type') != 'notice':
            raise ValueError('unsupported_official_control')
    raw,final,mime,status=fetcher(url,budget)
    if status!=200 or mime not in ('text/html','application/xhtml+xml') or not same_publisher(url,final):raise ValueError('publisher_page_unavailable')
    if control:
        from .verify_candidates import evaluate
        archive = store.put(raw, mime)
        result = evaluate({'url':url}, decode_public_html(raw), final, status=status, now=now)
        return {**result, 'archive':archive, 'source_url':url, 'source_family':'official_control',
                'captured_at':now.isoformat(), 'coverage_complete':False}, []
    original=store.put(raw,mime)
    page=discover(decode_public_html(raw),final)
    directory=payload.get('page_type')=='directory'
    value={'source_url':canonical_url(final),'source':payload['source']['key'],'source_family':payload['source']['family'],
      'source_published_at':None if directory else page['source_published_at'],'text':page['text'] if HIRING.search(page['title']+' '+page['text']) else '',
      'complete':len(page['text'])<14000,'sha256':original,'html_object_sha256':original,
      'capture_slot':int(now.timestamp()//14400),'title':page['title']}
    archive=json_blob(store,{**value,'page_last_published_at':page['source_published_at'],'page_type':'directory' if directory else 'notice'})
    children=[];date=parse_date(page['source_published_at'])
    old=date and now-date>dt.timedelta(days=45)
    suffix=':'+str(value['capture_slot'])+':v4'
    if value['text'] and not directory:children.append(('evaluate',value['source_url']+':'+value['sha256']+suffix,value))
    if directory or not old:
        parser=Document();parser.feed(decode_public_html(raw))
        candidates=list(page['candidates'])
        for href,label in parser.links:
            try:target=canonical_url(urllib.parse.urljoin(final,href))
            except ValueError:continue
            if same_publisher(target,final) and MEDIA.search(target) and re.search(r'\bbases?\b|decreto|concurso|convocatoria',label,re.I):
                candidates.append({'url':target,'kind':'document'})
        candidates=list({row['url']:row for row in candidates}.values())
        for candidate in candidates[:6]:
            target=canonical_url(candidate['url'])
            if MEDIA.search(target) and media_allowed(target,final):children.append(('media',value['source_url']+':'+target+suffix,{**value,'media_url':target}))
            elif same_publisher(target,final) and payload.get('depth',0)<1:
                children.append(('web',target+suffix,{'url':target,'source':payload['source'],'depth':1,'page_type':'notice'}))
        images=[]
        for target in page['images']:
            hint=bool(POSTER_HINT.search(target+' '+page['image_labels'].get(target,'')))
            relevant=hint or not directory and bool(POSTER_HINT.search(page['title']))
            if relevant and media_allowed(target,final) and not re.search(r'logo|avatar|icon|banner|favicon|slider|\.(?:svg|gif|ico)(?:\?|$)',target,re.I):
                images.append((not hint,target))
        for _,target in sorted(images)[:3]:
            children.append(('media',value['source_url']+':'+target+suffix,{**value,'media_url':target}))
    return {'status':'captured','source_url':final,'archive':archive,'html_object_sha256':original,
            'captured_at':now.isoformat(),'capture_slot':value['capture_slot'],'source_published_at':value['source_published_at'],
            'page_last_published_at':page['source_published_at'],'page_type':'directory' if directory else 'notice',
            'discovered':len(children),'old_source':bool(old),'coverage_complete':False},children


def media_work(store,payload,budget,fetcher=fetch_public):
    origin=payload['source_url']
    if payload.get('local_object_sha256'):
        raw=store.object(payload['local_object_sha256']).read_bytes();mime=payload['mime']
    else:
        url=payload['media_url']
        if not media_allowed(url,origin):raise ValueError('media_publisher_not_allowed')
        raw,final,mime,status=fetcher(url,budget,max_bytes=8*1024*1024)
        if status!=200 or not media_allowed(final,origin):raise ValueError('media_source_unavailable')
    if mime not in IMAGE_MIMES and mime!='application/pdf':raise ValueError('unsupported_media_type')
    digest=store.put(raw,mime);base={**payload,'object_sha256':digest,'mime':mime}
    if not payload.get('local_object_sha256') and source_adapter(final) and source_adapter(final)['family']=='local':
        base['verification_source_url']=canonical_url(final)
    if mime=='application/pdf':
        value=subprocess.run(['pdfinfo',str(store.object(digest))],capture_output=True,text=True,timeout=8,check=True)
        count=re.search(r'^Pages:\s*(\d+)',value.stdout,re.M);pages=int(count[1]) if count else 0
        if not 1<=pages<=40:return {'status':'pending','reason':'document_page_budget_exceeded','archive':digest},[]
    else:pages=1
    children=[('page',origin+':'+digest+':'+str(page)+':'+str(payload.get('capture_slot','legacy')),
               {**base,'page':page,'pages':pages}) for page in range(1,pages+1)]
    return {'status':'downloaded','archive':digest,'bytes':len(raw),'page_count':pages},children


def page_work(store,payload,budget):
    path=store.object(payload['object_sha256']);page=payload['page'];value={}
    if payload['mime']=='application/pdf':
        text=subprocess.run(['pdftotext','-f',str(page),'-l',str(page),'-layout',str(path),'-'],capture_output=True,text=True,timeout=min(15,max(1,budget.remaining())),check=True).stdout
        value={'text':text[:18000],'textTruncated':len(text)>18000,'engine':'pdftotext-local','mean_confidence':None}
        if len(text.strip())<100:
            with tempfile.TemporaryDirectory() as directory:
                prefix=Path(directory)/'page'
                subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-singlefile','-scale-to','1800','-png',str(path),str(prefix)],capture_output=True,timeout=min(20,max(1,budget.remaining())),check=True)
                value=tesseract_text(prefix.with_suffix('.png'),budget)
    else:value=tesseract_text(path,budget)
    artifact=json_blob(store,value)
    return {'status':'extracted','archive':artifact,'document_sha256':payload['object_sha256'],'page':page,
            'page_count':payload['pages'],'engine':value['engine'],'text_truncated':value['textTruncated'],
            'mean_confidence':value.get('mean_confidence')},[]


def evaluate_work(store,payload,now):
    text=payload.get('text','');date=original_date(payload,now)
    complete=payload.get('complete',not payload.get('text_truncated',False));digest=payload.get('sha256')
    if not digest:digest=json_blob(store,{'text':text,'date_proof':payload.get('date_proof')})
    adapter=source_adapter(payload['source_url'])
    if not adapter or adapter['family']!='local':
        # Capture evidence now, but the pilot never expands the production source allowlist.
        from .local_source_audit import evidence_fields
        fields=evidence_fields(text,date.isoformat() if date else None)
        return {'status':'pending','reason':'social_or_employer_publication_bridge_not_validated','fields':fields,'archive':digest},[]
    if not HIRING.search(text):return {'status':'pending','reason':'job_notice_unconfirmed','archive':digest},[]
    result=verify_notice(text,payload['source_url'],date.isoformat() if date else None,sha256=digest,complete=complete,now=now)
    if payload.get('contribution_requires_review'):
        return {'status':'pending','reason':'contribution_origin_requires_confirmation','content_check_status':result['status'],
                'content_check_reason':result['reason'],'archive':digest},[]
    return {**result,'archive':digest},[]


def assemble_documents(store,now):
    documents={}
    for row in store.results():
        if row['kind']!='page':continue
        payload=row['payload'];group=documents.setdefault((payload['source_url'],payload['object_sha256'],payload.get('capture_slot')),{'payload':payload,'pages':[]})
        group['pages'].append(row)
    for (_,digest,slot),group in documents.items():
        payload=group['payload'];pages=group['pages']
        if len(pages)!=payload['pages'] or any(row['status']!='done' for row in pages):continue
        values=[json.loads(store.object(row['result']['archive']).read_text()) for row in sorted(pages,key=lambda row:row['payload']['page'])]
        text='\n'.join(value['text'] for value in values)
        complete=len(text)<=18000 and not any(value['textTruncated'] or value.get('engine')=='tesseract-local' and (value.get('mean_confidence') or 0)<70 for value in values)
        verification_url=payload.get('verification_source_url')
        if not verification_url and payload.get('media_url') and source_adapter(payload['media_url']) and source_adapter(payload['media_url'])['family']=='local':verification_url=canonical_url(payload['media_url'])
        verification_url=verification_url or payload['source_url']
        store.seed('evaluate',verification_url+':'+digest+':'+str(slot)+':v3',{**payload,'publisher_page':payload['source_url'],'source_url':verification_url,'text':text[:18000],'complete':complete,'sha256':digest,'original_page_count':payload['pages']},now)


def run(store,config,social,*,now=None,budget=None,limit=18,fetcher=fetch_public,work_kinds=None):
    frozen=now is not None
    now=now or utcnow();budget=budget or Budget(400)
    if config.get('paid_providers_enabled') is not False or config.get('publish_enabled') is not False:raise ValueError('Pilot must remain isolated and free')
    slot=int(now.timestamp()//14400)
    for source in config['sources']:
        if source['kind']=='web':store.seed('web',source['key']+':'+str(slot)+':v4',{'url':source['url'],'source':source,'depth':0,'page_type':source.get('page_type','notice')},now)
    for capture in social.get('captures',[]):
        digest=json_blob(store,capture)
        store.seed('social',capture['key']+':'+str(slot)+':'+digest,{'source_key':capture['key'],'archive':digest},now)
    processed=0
    while processed<limit and budget.remaining()>5:
        assemble_documents(store,now)
        step_now=now if frozen else utcnow()
        job=store.claim(step_now,kinds=work_kinds)
        if not job:break
        try:
            if job['kind']=='web':result,children=web_work(store,job['payload'],budget,fetcher,now)
            elif job['kind']=='social':
                capture=job['payload'].get('capture') or json.loads(store.object(job['payload']['archive']).read_text())
                result,children={'status':'captured','archive':job['payload']['archive'],
                    'access':capture.get('access'),'dated_posts':capture.get('dated_posts',0),
                    'media_count':sum(len(post.get('media',[])) for post in capture.get('posts',[])),
                    'posts':len(capture.get('posts',[]))},social_children(capture,now)
            elif job['kind']=='media':result,children=media_work(store,job['payload'],budget,fetcher)
            elif job['kind']=='page':result,children=page_work(store,job['payload'],budget)
            else:result,children=evaluate_work(store,job['payload'],now)
            store.finish(job,result,children,now if frozen else utcnow())
        except Exception as exc:store.fail(job,source_error(exc),now if frozen else utcnow())
        processed+=1
    assemble_documents(store,now)
    evaluations=[row['result'] for row in store.results() if row['status']=='done' and
                 (row['kind']=='evaluate' or row['kind']=='web' and row['result'].get('source_family')=='official_control')]
    diagnostics=describe(store.results(),config,now)
    report={'schema':'trabajo-cerca.radar-v2-pilot-result.v1','checked_at':now.isoformat(),'processed':processed,
      'counts':store.counts(),'eligible_local_notices':diagnostics['eligible_hard_source_notices'],
      **diagnostics,'evaluated':len(evaluations),'evaluations':evaluations,
      'paid_provider_calls':0,'published':0,'publication_confirmed':False,'production_modified':False,
      'coverage_complete':False,'independent_reference_count':len(config.get('independent_reference',[])),
      'recall_measured':False,'seven_day_observation_complete':False}
    with store.connection:
        cursor=store.connection.execute('INSERT INTO runs(completed_at,summary) VALUES(?,?)',(now.isoformat(),json.dumps(report,ensure_ascii=False)))
        report['counts']=store.counts()
        store.connection.execute('UPDATE runs SET summary=? WHERE id=?',(json.dumps(report,ensure_ascii=False),cursor.lastrowid))
    return report


def restore_git(root):
    reference='refs/remotes/origin/'+DATA_BRANCH
    available=subprocess.run(['git','ls-remote','--exit-code','--heads','origin',DATA_BRANCH],capture_output=True,check=False)
    if available.returncode==2:return None
    if available.returncode!=0:raise RuntimeError('Pilot backup availability could not be checked')
    git('fetch','origin','refs/heads/'+DATA_BRANCH+':'+reference)
    parent=git('rev-parse',reference).decode().strip()
    Path(root).parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        folder=Path(directory)
        (folder/'archive.gz').write_bytes(git('show',parent+':state/pilot.sqlite3.gz'))
        (folder/'manifest.json').write_bytes(git('show',parent+':state/manifest.json'))
        restore(folder/'archive.gz',folder/'manifest.json',root,lambda digest:git('show',parent+':state/objects/'+digest))
    return parent


def push_snapshot(store,manifest,folder,run_id,parent,reports):
    if not re.fullmatch('[0-9]+',run_id):raise ValueError('Invalid pilot run identity')
    files={'state/pilot.sqlite3.gz':(folder/'pilot.sqlite3.gz').read_bytes(),
      'state/manifest.json':(folder/'manifest.json').read_bytes(),
      'history/'+run_id+'/pilot.sqlite3.gz':(folder/'pilot.sqlite3.gz').read_bytes(),
      'history/'+run_id+'/manifest.json':(folder/'manifest.json').read_bytes()}
    for digest in manifest['objects']:files['state/objects/'+digest]=store.object(digest).read_bytes()
    for name,value in reports.items():files['history/'+run_id+'/'+name]=(json.dumps(value,ensure_ascii=False)+'\n').encode()
    with tempfile.TemporaryDirectory() as directory:
        env={**os.environ,'GIT_INDEX_FILE':str(Path(directory)/'index'),'GIT_AUTHOR_NAME':'Trabajo Cerca pilot',
          'GIT_AUTHOR_EMAIL':'radar@users.noreply.github.com','GIT_COMMITTER_NAME':'Trabajo Cerca pilot','GIT_COMMITTER_EMAIL':'radar@users.noreply.github.com'}
        git('read-tree',parent,env=env) if parent else git('read-tree','--empty',env=env)
        for path,value in files.items():
            digest=git('hash-object','-w','--stdin',data=value,env=env).decode().strip()
            git('update-index','--add','--cacheinfo','100644,'+digest+','+path,env=env)
        tree=git('write-tree',env=env).decode().strip()
        commit=git('commit-tree',tree,*(['-p',parent] if parent else []),data=('Isolated pilot snapshot '+run_id+'\n').encode(),env=env).decode().strip()
        git('push','origin',commit+':refs/heads/'+DATA_BRANCH,env=env)
    return commit


def main():
    if os.environ.get('GITHUB_REPOSITORY')!=REPOSITORY or os.environ.get('GITHUB_REF')!='refs/heads/'+PRODUCER_BRANCH:raise ValueError('Pilot restricted to reviewed repair branch')
    output=Path('output/radar-v2');output.mkdir(parents=True,exist_ok=True)
    root=Path('state/radar-v2');parent=restore_git(root);store=PilotStore(root)
    try:
        config=json.loads(CONFIG.read_text());reports={}
        drain_only=os.environ.get('RADAR_V2_DRAIN_ONLY')=='true'
        if not drain_only:
            social=json.loads((output/'social-observation.json').read_text())
            reports['first-pass.json']=run(store,config,social,budget=Budget(180))
            reports['second-pass.json']=run(store,config,social,limit=18,budget=Budget(180))
        # An empty seed catalog does not prevent old queued downloads. Filter work kinds too.
        drain=run(store,{**config,'sources':[]},{'captures':[]},limit=180,budget=Budget(300),work_kinds=('page','evaluate'))
        reports['drain-pass.json']=drain
        for name,value in reports.items():write_json(output/name,value)
        # Drain intentionally has no seed sources, but the final diagnostics must keep the catalog.
        diagnostics=describe(store.results(),config,utcnow())
        write_json(output/'source-diagnostics.json',diagnostics)
        write_json(output/'review-queue.json',diagnostics['review_queue'])
        write_json(output/'work-inventory.json',{'jobs':store.results()})
        manifest=store.snapshot(output/'backup')
        commit=push_snapshot(store,manifest,output/'backup',os.environ['GITHUB_RUN_ID'],parent,{**reports,'source-diagnostics.json':diagnostics})
        print('RADAR_V2_PILOT '+json.dumps({'data_commit':commit,'drain_only':drain_only,'passes':{
            name:{key:value for key,value in report.items() if key not in ('evaluations','review_queue','source_diagnostics')}
            for name,report in reports.items()}},ensure_ascii=False))
    finally:store.close()


if __name__=='__main__':main()
