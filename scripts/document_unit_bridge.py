"""Reviewed page evidence -> distinct local publication units. No remote writer."""
import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
from pathlib import Path
from zoneinfo import ZoneInfo

from .common import COMMUNES,canonical_url,decode_public_html,normalized,parse_date,utcnow,write_json
from .document_review import review_document
from .local_history import DATE,literal_date
from .local_source_audit import discover,same_publisher
from .public_source_adapters import offer_identity,source_adapter
from .radar_v2_pilot import listing_is_closed
from .radar_v2_publish import fresh_time
from .radar_v2_store import PilotStore
from .state import State
from . import publication_queue

METHOD=' individual notice + page-bound document review'
FIELD_NAMES={'title','company','workplace','deadline','deadline_time','application','scope'}


def flat(value):return re.sub(r'\s+',' ',normalized(value)).strip()


def title_key(title):return hashlib.sha256(flat(title).encode()).hexdigest()


def context(store,manifest,now):
    url=canonical_url(manifest['source_url']);document=canonical_url(manifest['document_url'])
    adapter=source_adapter(url)
    if not adapter or adapter['family']!='local' or not same_publisher(url,document):raise ValueError('local_document_origin_required')
    digest=manifest['document_sha256'];original=store.object(digest)
    if not original.read_bytes().startswith(b'%PDF-'):raise ValueError('original_pdf_required')
    rows=store.results()
    media=[r for r in rows if r['kind']=='media' and r['status']=='done' and r['result'].get('archive')==digest
           and r['payload']['source_url']==url and r['payload'].get('media_url')==document]
    if not media:raise ValueError('original_document_download_missing')
    medium=max(media,key=lambda r:r['completed_at']);payload=medium['payload']
    if payload.get('contribution_requires_review'):raise ValueError('contribution_origin_requires_confirmation')
    if listing_is_closed(store,payload):raise ValueError('listing_marks_notice_closed')
    captured=fresh_time(medium['completed_at'],now)
    html=payload['html_object_sha256']
    captures=[r for r in rows if r['kind']=='web' and r['status']=='done' and r['result'].get('html_object_sha256')==html
              and r['result'].get('source_url')==url and r['result'].get('page_type')=='notice']
    if not captures:raise ValueError('original_html_capture_missing')
    if any(listing_is_closed(store,r['payload']) for r in captures):raise ValueError('listing_marks_notice_closed')
    captured=min(captured,*(fresh_time(r['result'].get('captured_at'),now) for r in captures))
    reviewed=fresh_time(manifest.get('reviewed_at'),now)
    if reviewed<captured:raise ValueError('review_precedes_capture')
    page=discover(decode_public_html(store.object(html).read_bytes()),url)
    published=parse_date(page['source_published_at'])
    if not published or published>now or now-published>dt.timedelta(days=45):raise ValueError('source_date_missing_future_or_old')
    info=subprocess.run(['pdfinfo',str(original)],capture_output=True,text=True,timeout=8,check=True)
    match=re.search(r'^Pages:\s*(\d+)',info.stdout,re.M);count=int(match[1]) if match else 0
    if not 1<=count<=40:raise ValueError('document_page_budget_exceeded')
    pages=[r for r in rows if r['kind']=='page' and r['payload'].get('object_sha256')==digest
           and r['payload']['source_url']==url and r['payload'].get('capture_slot')==payload.get('capture_slot')]
    if (len(pages)!=count or any(r['status']!='done' for r in pages)
            or sorted(r['payload']['page'] for r in pages)!=list(range(1,count+1))):raise ValueError('document_pages_incomplete')
    values={}
    for row in pages:
        value=json.loads(store.object(row['result']['archive']).read_text())
        if (not value['text'].strip() or value['textTruncated'] or value.get('engine')=='tesseract-local'
                and (value.get('mean_confidence') or 0)<70):raise ValueError('document_page_requires_review')
        values[row['payload']['page']]={**value,'page':row['payload']['page'],'text_object_sha256':row['result']['archive']}
    proposals=review_document([values[k] for k in sorted(values)],source_url=url,document_url=document,
        document_sha256=digest,published_at=published.isoformat(),now=now)
    return {'url':url,'document':document,'digest':digest,'adapter':adapter,'html':html,'pages':values,
            'published':published,'captured':captured,'reviewed':reviewed,'proposals':proposals['records']}


def field(context,reference):
    if type(reference.get('page')) is not int:raise ValueError('field_page_hash_mismatch')
    page=context['pages'].get(reference.get('page'))
    if not page or reference.get('text_object_sha256')!=page['text_object_sha256']:raise ValueError('field_page_hash_mismatch')
    reading=reference.get('reading','primary');value=page
    if reading!='primary':
        match=re.fullmatch(r'alternate_readings:(\d+)',reading)
        if not match or int(match[1])>=len(page.get('alternate_readings',[])):raise ValueError('field_reading_missing')
        value=page['alternate_readings'][int(match[1])]
    quote=reference.get('literal')
    if not isinstance(quote,str) or not 1<=len(quote)<=4000 or quote not in value['text']:raise ValueError('field_literal_mismatch')
    if value.get('textTruncated') or value.get('engine')=='tesseract-local' and (value.get('mean_confidence') or 0)<70:
        raise ValueError('field_ocr_requires_review')
    return quote


def verify_unit(ctx,unit,now):
    refs=unit['fields']
    if set(refs)!=FIELD_NAMES:raise ValueError('unit_field_evidence_incomplete')
    quotes={key:field(ctx,value) for key,value in refs.items()}
    if sum(len(q) for q in quotes.values())>18000:raise ValueError('unit_evidence_byte_budget')
    title=unit['title'];company=unit['company'];place=unit['work_commune']
    proposal=next((r for r in ctx['proposals'] if flat(r['title'])==flat(title)),None)
    if not proposal or flat(proposal['employer'])!=flat(company):raise ValueError('role_or_employer_not_in_document')
    if flat(title) not in flat(quotes['title']) or flat(company) not in flat(quotes['company']):raise ValueError('unit_value_not_in_literal')
    if (place not in COMMUNES or not re.search(r'\b'+re.escape(flat(place))+r'\b',flat(quotes['workplace']))
            or not re.search(r'lugar de trabajo|establecimiento|departamento de salud|red de salud|\bDSM\b',quotes['workplace'],re.I)):
        raise ValueError('workplace_not_proven')
    scope=re.search(r'(\d+)\s+CARGOS',quotes['scope'],re.I)
    if not scope or int(scope[1])!=len(ctx['proposals']):raise ValueError('shared_calendar_scope_unconfirmed')
    close=re.search(r'Cierre\s+de\s+per[ií]odo\s+de\s+recepci[oó]n\s+de\s+postulaciones\s*\|?\s*('+DATE+')',quotes['deadline'],re.I)
    clock=re.search(r'a\s+las\s+(\d{1,2})(?::(\d{2}))?\s*(?:hrs|horas)',quotes['deadline_time'],re.I)
    if not close or not clock:raise ValueError('explicit_deadline_and_time_required')
    deadline=literal_date(close[1]+' a las '+clock[1]+':'+(clock[2] or '00'))
    window=proposal['original_application_window']
    if (not deadline or not window or deadline<=ctx['published'] or
            deadline.astimezone(ZoneInfo('America/Santiago')).date()!=parse_date(window['end']).astimezone(ZoneInfo('America/Santiago')).date()):
        raise ValueError('deadline_conflicts_with_document')
    instructions=quotes['application']
    if not (re.search(r'Oficina[\s\S]{0,30}de Partes',instructions,re.I)
            and re.search(r'ubicad[oa] en|\bcalle\b',instructions,re.I) and re.search(r'#?\d{2,5}',instructions)
            and re.search(r'postulante|postulaci[oó]n|sobre',instructions,re.I)):
        raise ValueError('in_person_application_not_proven')
    key=title_key(title)
    proof={'schema':'trabajo-cerca.document-unit.v1','key':key,'publisher_url':ctx['url'],
        'html_sha256':ctx['html'],'document_url':ctx['document'],'document_sha256':ctx['digest'],
        'page_count':len(ctx['pages']),'pages':[{'page':p,'text_object_sha256':v['text_object_sha256']} for p,v in sorted(ctx['pages'].items())],
        'fields':refs,'review_method':'page_bound_review','reviewed_at':ctx['reviewed'].isoformat()}
    expired=deadline<=now
    return {'status':'rejected' if expired else 'verified','reason':'expired_deadline' if expired else 'reviewed_page_bound_document_unit',
        'url':ctx['url'],'title':title,'company':company,'work_commune':place,'work_location_verified':True,
        'source':ctx['adapter']['name'],'source_published_at':ctx['published'].isoformat(),
        'valid_through':deadline.isoformat(),'application':ctx['document']+'#page='+str(refs['application']['page']),
        'application_details':{'method':'in_person','instructions':instructions},
        'verification_method':ctx['adapter']['name']+METHOD,'document_unit':proof}


def prepare_reviewed_units(pilot,history,manifest,output,*,now=None):
    now=now or utcnow();output=Path(output);output.mkdir(parents=True,exist_ok=True)
    if manifest.get('schema')!='trabajo-cerca.document-unit-review.v1' or not isinstance(manifest.get('units'),list) or not 1<=len(manifest['units'])<=12:
        raise ValueError('document_review_manifest_invalid')
    try:ctx=context(pilot,manifest,now)
    except (OSError,subprocess.SubprocessError) as exc:raise ValueError('document_evidence_unavailable') from exc
    # Validate the whole reviewed set before writing any unit.
    results=[verify_unit(ctx,unit,now) for unit in manifest['units']]
    if len({r['document_unit']['key'] for r in results})!=len(results):raise ValueError('duplicate_document_unit')
    identities=[history.record_document_result(result,ctx['captured']) for result in results]
    queue=publication_queue.prepare(history,output=output,now=now)
    queue['records']=[r for r in queue['records'] if r['candidate_id'] in identities][:3]
    queue['ready_count']=len(queue['records']);write_json(output/'publication_queue.json',queue)
    report={'schema':'trabajo-cerca.document-unit-handoff.v1','reviewed_units':len(results),'local_ready_count':queue['ready_count'],
        'candidate_ids':identities,'source_url':ctx['url'],'original_page_count':len(ctx['pages']),
        'rejected':[{'title':r['title'],'reason':r['reason']} for r in results if r['status']!='verified'],
        'requires_reviewed_input':True,'signed_batch_created':False,'production_modified':False,'paid_provider_calls':0,'published':0}
    write_json(output/'document-unit-handoff.json',report)
    raw=json.dumps(manifest,ensure_ascii=False,sort_keys=True).encode()
    write_json(output/('review-input-'+hashlib.sha256(raw).hexdigest()+'.json'),manifest)
    return queue,report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pilot',required=True);parser.add_argument('--history',required=True)
    parser.add_argument('--manifest',required=True);parser.add_argument('--output',required=True)
    args=parser.parse_args()
    if not (Path(args.pilot)/'pilot.sqlite3').exists():raise ValueError('existing_capture_required')
    pilot=PilotStore(args.pilot);history=State(args.history)
    try:
        _,report=prepare_reviewed_units(pilot,history,json.loads(Path(args.manifest).read_text()),args.output)
        print(json.dumps(report,ensure_ascii=False))
    finally:pilot.close();history.close()


if __name__=='__main__':main()
