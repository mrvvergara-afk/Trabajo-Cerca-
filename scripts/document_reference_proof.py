"""Bounded public reference -> archived original -> OCR -> local verification.

This command never signs a batch, pushes state or calls an app writer.
"""
import argparse
import hashlib
import html
import json
import urllib.error
import urllib.parse
import urllib.robotparser
from pathlib import Path
from zoneinfo import ZoneInfo

from .common import Budget, canonical_url, parse_date, utcnow, write_json
from .local_source_audit import fetch_public, source_error, Document, public_medium_url, discover, same_publisher
from .public_source_adapters import source_adapter, LOCAL_PUBLISHERS
from .public_document_http import public_url
from .radar_v2_pilot import run
from .radar_v2_publish import prepare
from .radar_v2_store import PilotStore,restore
from .state import State


def write_preview(output,reviews):
    cards=[]
    for document in reviews:
        for record in document['records']:
            text=html.escape
            window=record.get('original_application_window') or {}
            deadline=parse_date(window.get('end'))
            closing=deadline.astimezone(ZoneInfo('America/Santiago')).strftime('%d/%m/%Y') if deadline else 'Sin confirmar'
            status={'not_expired':'Plazo no vencido; revisión pendiente','expired':'Plazo vencido',
                    'not_confirmed':'Plazo sin confirmar'}[record['original_deadline_status']]
            cards.append('<article><h2>'+text(record['title'])+'</h2><p>'+text(status)+'</p><p>'+
                text(record.get('employer') or 'Empleador por revisar')+'</p><p>Fecha de cierre: '+
                text(closing)+' · Horario: consultar las bases</p><p>Revisión local · No publicado</p><p><a href="'+
                text(record['source_url'],quote=True)+'">Publicación municipal</a> · <a href="'+
                text(record['document_url'],quote=True)+'">Bases originales</a></p><details><summary>Datos y evidencia</summary><pre>'+
                text(json.dumps(record,ensure_ascii=False,indent=2))+'</pre></details></article>')
    (Path(output)/'review-preview.html').write_text('<!doctype html><html lang="es"><meta charset="utf-8">'+
        '<title>Trabajo Cerca · revisión documental local</title><style>body{font:18px system-ui;max-width:960px;'+
        'margin:40px auto;padding:20px;background:#f5f8f6;color:#102d24}article{background:white;padding:24px;'+
        'margin:20px 0;border:1px solid #ccd8d0;border-radius:16px}a{color:#146749}pre{white-space:pre-wrap;'+
        'overflow-wrap:anywhere;font-size:13px}</style><h1>Revisión documental local</h1><p>Las fichas conservan '+
        'su estado pendiente. Esta vista no publica en la app.</p>'+(''.join(cards) or '<p>Sin fichas extraídas.</p>')+'</html>')


def verify_persistence(store,output,reviews):
    output=Path(output)
    snapshot=store.snapshot(output/'backup')
    restore(output/'backup/pilot.sqlite3.gz',output/'backup/manifest.json',output/'restored-state',
            lambda digest:store.object(digest).read_bytes())
    recovered=PilotStore(output/'restored-state')
    try:
        if recovered.counts()!=store.counts():raise ValueError('reference_restore_counts_mismatch')
        for digest in reviews:
            if recovered.object(digest).read_bytes()!=store.object(digest).read_bytes():
                raise ValueError('reference_restored_review_mismatch')
    finally:recovered.close()
    return {'snapshot_restored':True,'counts_preserved':True,'review_objects_preserved':len(reviews),
        'archive_original_bytes':sum(v['bytes'] for v in snapshot['objects'].values()),
        'sqlite_sha256':snapshot['sqlite_sha256']}


def prove(url,output,*,budget=None,fetcher=fetch_public,now=None,max_work=35,ocr_all_pdf_pages=False,attachment_url=None):
    url=canonical_url(url);adapter=source_adapter(url)
    directory = not adapter
    if attachment_url:
        url=public_url(url);attachment_url=public_url(attachment_url)
        if not public_medium_url(attachment_url) or not same_publisher(url,attachment_url):
            raise ValueError('local_attachment_reference_required')
        if directory:
            name=LOCAL_PUBLISHERS.get(urllib.parse.urlsplit(url).hostname.removeprefix('www.'))
            if name:adapter={'family':'local','name':name}
    if not adapter or adapter['family']!='local':raise ValueError('local_primary_reference_required')
    if type(max_work) is not int or not 1<=max_work<=40:raise ValueError('reference_work_limit_invalid')
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    budget=budget or Budget(400);now=now or utcnow()
    robots={};requests=[]

    def capture(target,request_budget,**kwargs):
        target=canonical_url(target);parts=urllib.parse.urlsplit(target)
        origin=parts.scheme+'://'+parts.netloc
        if origin not in robots:
            address=origin+'/robots.txt';parser=urllib.robotparser.RobotFileParser()
            try:
                raw,final,mime,status=fetcher(address,request_budget,max_bytes=50000)
                if status!=200:raise ValueError('robots_policy_unavailable')
                parser.parse(raw.decode('utf-8','replace').splitlines())
                name='robots-'+hashlib.sha256(origin.encode()).hexdigest()[:12]+'.txt'
                (output/name).write_bytes(raw)
                requests.append({'url':address,'status':status,'file':name,'sha256':hashlib.sha256(raw).hexdigest()})
            except urllib.error.HTTPError as exc:
                if exc.code!=404:raise
                parser.parse([]);requests.append({'url':address,'status':404})
            robots[origin]=parser
        if not robots[origin].can_fetch('TrabajoCercaLocalAudit',target):raise ValueError('public_source_robots_disallowed')
        try:
            raw,final,mime,status=fetcher(target,request_budget,**kwargs)
            requests.append({'url':target,'final_url':final,'status':status,'mime':mime,
                'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
            return raw,final,mime,status
        except Exception as exc:
            requests.append({'url':target,'error':source_error(exc)})
            raise

    source={'key':'document-reference','url':url,'kind':'web','family':'municipal','name':adapter['name'],
            'ocr_all_pdf_pages':ocr_all_pdf_pages}
    config={'sources':[],'territories':json.loads(Path('config/radar-v2-pilot.json').read_text())['territories'],
            'paid_providers_enabled':False,'publish_enabled':False}
    store=PilotStore(output/'state');history=State(output/'history.sqlite3')
    try:
        # A catalogue attachment must be literally linked. Its catalogue timestamp
        # cannot become the original publication date of each individual contest.
        if attachment_url:
            raw,final,mime,status=capture(url,budget)
            if mime not in ('text/html','application/xhtml+xml') or not same_publisher(url,final):
                raise ValueError('attachment_primary_page_unavailable')
            parser=Document();parser.feed(raw.decode('utf-8','replace'))
            def match_target(value):
                try:
                    target=urllib.parse.urlsplit(canonical_url(urllib.parse.urljoin(final,value)))
                    return (target.hostname.removeprefix('www.'),target.path,target.query)
                except ValueError:return None
            linked=[href for href,_ in parser.links]+parser.images
            if not any(match_target(value)==match_target(attachment_url) for value in linked):
                raise ValueError('attachment_not_linked_by_primary_page')
            original=store.put(raw,mime)
            page=discover(raw.decode('utf-8','replace'),final)
            store.seed('media',url+':'+attachment_url,{
                'source_url':url,'media_url':attachment_url,'source':'document-reference','source_family':'municipal',
                'html_object_sha256':original,'source_published_at':None if directory else page['source_published_at'],
                'capture_slot':int(now.timestamp()//14400),'ocr_all_pdf_pages':ocr_all_pdf_pages},now)
        else:
            # Follow document embeds from this reference only; do not crawl related notices.
            store.seed('web',url,{'url':url,'source':source,'depth':1,'page_type':'notice'},now)
        result=run(store,config,{'captures':[]},now=now,budget=budget,limit=max_work,fetcher=capture)
        queue,handoff=prepare(store,history,output,now=now,territories=config['territories'])
        documents=[]
        rows=store.results()
        reviews={row['payload']['document_review_sha256'] for row in rows
                 if row['payload'].get('document_review_sha256')}
        document_reviews=[json.loads(store.object(digest).read_text()) for digest in sorted(reviews)]
        write_json(output/'document-review.json',document_reviews)
        # Exercise the same backup/restore path as the durable pilot, locally.
        persistence=verify_persistence(store,output,reviews)
        write_preview(output,document_reviews)
        for medium in [r for r in rows if r['kind']=='media' and r['status']=='done']:
            digest=medium['result']['archive'];pages=[]
            for page in sorted([p for p in rows if p['kind']=='page' and p['payload']['object_sha256']==digest],key=lambda p:p['payload']['page']):
                value=json.loads(store.object(page['result']['archive']).read_text()) if page['status']=='done' else {}
                pages.append({'page':page['payload']['page'],'status':page['status'],'engine':value.get('engine'),
                    'language':value.get('language'),
                    'confidence':value.get('mean_confidence'),'characters':len(value.get('text','')),
                    'text_object_sha256':(page['result'] or {}).get('archive'),
                    'alternate_readings':[{'engine':item.get('engine'),'characters':len(item.get('text','')),
                        'confidence':item.get('mean_confidence')} for item in value.get('alternate_readings',[])]})
            documents.append({'url':medium['payload'].get('media_url'),'sha256':digest,
                'status':medium['result'].get('status'),'reason':medium['result'].get('reason'),
                'bytes':medium['result'].get('bytes'),'page_count':medium['result'].get('page_count'),'pages':pages})
        report={'schema':'trabajo-cerca.public-document-reference-proof.v1','checked_at':now.isoformat(),
            'source_url':url,'source_name':adapter['name'],'requests':requests,'documents':documents,
            'counts':store.counts(),'evaluations':[r['result'] for r in rows if r['kind']=='evaluate' and r['status']=='done'],
            'document_reviews':document_reviews,
            'persistence_check':persistence,'review_preview':'review-preview.html',
            'review_queue':result['review_queue'],'local_handoff_ready':queue['ready_count'],'handoff':handoff,
            'max_work':max_work,'coverage_complete':False,'publication_confirmed':False,
            'production_modified':False,'paid_provider_calls':0,'published':0}
        write_json(output/'reference-proof.json',report)
        return report
    finally:store.close();history.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url');parser.add_argument('--output',required=True)
    parser.add_argument('--max-work',type=int,default=35,help='Maximum queued steps, 1..40 (includes every PDF page)')
    parser.add_argument('--ocr-all-pdf-pages',action='store_true',help='Also OCR text-bearing pages to read image-only advertisements')
    args=parser.parse_args()
    report=prove(args.url,args.output,max_work=args.max_work,ocr_all_pdf_pages=args.ocr_all_pdf_pages)
    print(json.dumps({key:report[key] for key in ('source_url','counts','documents','local_handoff_ready','published','production_modified')},ensure_ascii=False))


if __name__=='__main__':main()
