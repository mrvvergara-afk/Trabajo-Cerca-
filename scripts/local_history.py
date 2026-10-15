"""Free dated local history and media evidence. Verification never uses capture time."""
import datetime as dt
import hashlib
import json
import re
import urllib.parse
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    from .common import Budget, Links, MAX_SOURCE_AGE_DAYS, canonical_url, normalized, output_dir, parse_date, safe_error, utcnow, write_json
    from .local_source_audit import HIRING, MEDIA, NON_JOB, discover, evidence_fields, fetch_public, read_medium, same_publisher, source_error
    from .public_source_adapters import source_adapter
    from .radar import configured_sources
except ImportError:
    from common import Budget, Links, MAX_SOURCE_AGE_DAYS, canonical_url, normalized, output_dir, parse_date, safe_error, utcnow, write_json
    from local_source_audit import HIRING, MEDIA, NON_JOB, discover, evidence_fields, fetch_public, read_medium, same_publisher, source_error
    from public_source_adapters import source_adapter
    from radar import configured_sources

CHECKPOINT = 'local_document_history_v1'
DATE = r'(?:20\d{2}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2}|\d{1,2}\s+(?:de\s+)?[a-záéíóú]+\s+(?:de\s+)?20\d{2})'


def literal_date(value, end=False):
    text = normalized(value).strip()
    source = parse_date(text)
    if source and 't' in text:return source
    timed = re.fullmatch('('+DATE+r')\s+(?:a\s+las\s+)?(\d{1,2}):(\d{2})(?:\s*(?:hrs|horas))?',text)
    if timed:
        date = literal_date(timed[1])
        if date:
            try:return date.astimezone(ZoneInfo('America/Santiago')).replace(hour=int(timed[2]),minute=int(timed[3])).astimezone(dt.timezone.utc)
            except ValueError:return None
        return None
    match = re.fullmatch(r'(20\d{2})-(\d{2})-(\d{2})',text)
    if match:year,month,day = map(int,match.groups())
    else:
        match = re.fullmatch(r'(\d{1,2})[/-](\d{1,2})[/-](20\d{2})',text)
        if match:day,month,year = map(int,match.groups())
        else:
            match = re.fullmatch(r'(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+)?(20\d{2})',text)
            months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
            if not match or match[2] not in months:return None
            day,month,year = int(match[1]),months.index(match[2])+1,int(match[3])
    try:
        return dt.datetime(year,month,day,23 if end else 0,59 if end else 0,59 if end else 0,
                           999000 if end else 0,tzinfo=ZoneInfo('America/Santiago')).astimezone(dt.timezone.utc)
    except ValueError:return None


def verify_notice(text, source_url, published_at, *, sha256, complete=True, now=None):
    now = now or utcnow()
    source_url = canonical_url(source_url)
    fields = evidence_fields(text,published_at)
    adapter = source_adapter(source_url)
    result = {**fields,'url':source_url,'status':'pending','reason':'local_notice_requires_review'}
    if not adapter or adapter['family']!='local':return result
    if re.search(r'postulaciones? (?:cerradas?|finalizadas?)|oferta (?:cerrada|expirada|finalizada)|concurso desierto',text,re.I):
        return {**result,'status':'rejected','reason':'closed_notice'}
    published = parse_date(published_at)
    explicit = re.findall(r'(?:publicad[oa]|fecha de publicaci[oó]n|publicaci[oó]n)\s*(?:el|:)?\s*('+DATE+')',text,re.I)
    dates = {date for value in explicit if (date:=literal_date(value))}
    if len(dates)>1 or published and dates and abs(published-next(iter(dates)))>=dt.timedelta(days=1):
        return {**result,'reason':'source_date_conflict'}
    if not published:
        published = next(iter(dates)) if len(dates)==1 else None
    elif dates:
        published = min(published,next(iter(dates)))
    if not published or published>now:return {**result,'reason':'source_date_missing_or_future'}
    result['source_published_at'] = published.isoformat()
    fields['missing'] = [field for field in fields['missing'] if field!='fecha_original']
    result['missing'] = fields['missing']
    if now-published>dt.timedelta(days=MAX_SOURCE_AGE_DAYS):return {**result,'reason':'source_older_than_45_days'}
    values = re.findall(r'(?:postulaciones?\s+hasta|plazo de postulaci[oó]n\s*:?|fecha l[ií]mite\s*:?|cierre\s*:?|recepci[oó]n de antecedentes\s+hasta)\s*(?:el\s+)?('+DATE+r'(?:\s+(?:a\s+las\s+)?\d{1,2}:\d{2}(?:\s*(?:hrs|horas))?)?)',text,re.I)
    deadlines = {date for value in values if (date:=literal_date(value,True))}
    deadline = next(iter(deadlines)) if len(deadlines)==1 else None
    if deadline and deadline<=now:return {**result,'status':'rejected','reason':'expired_deadline'}
    if not complete:return {**result,'reason':'document_partial_or_truncated'}
    roles = {value.strip() for value in re.findall(r'(?:^|\n)\s*(?:cargo|puesto|vacante)\s*[:\-]\s*([^\n]+)',text,re.I)}
    companies = {value.strip() for value in re.findall(r'(?:^|\n)\s*(?:empresa|empleador)\s*[:\-]\s*([^\n]+)',text,re.I)}
    places = fields['work_communes']
    if re.search(r'argentina|australia|canad[aá]|estados unidos|m[eé]xico|colombia|per[uú]',fields['workplace_evidence'] or '',re.I):
        return {**result,'reason':'workplace_outside_target_territory'}
    if set(places)=={'Mininco','Collipulli'}:places=['Mininco']
    if len(roles)>1 or len(companies)>1:return {**result,'reason':'multiple_notices_require_separation'}
    if NON_JOB.search(text) or not HIRING.search(text):return {**result,'reason':'job_notice_unconfirmed'}
    blockers = list(fields['missing'])
    if len(places)!=1:blockers.append('lugar_unico_sin_confirmar')
    if not deadline:blockers.append('plazo_explicito_sin_confirmar')
    if not re.fullmatch('[a-f0-9]{64}',sha256):blockers.append('original_sin_hash_valido')
    if blockers:return {**result,'review_blockers':blockers}
    email = fields['emails'][0] if fields['emails'] else None
    phones = {re.sub(r'\D','',value) for value in fields['phones']}
    phones = {'56'+value if len(value)==9 else value for value in phones}
    phone = next(iter(phones)) if len(phones)==1 else None
    if not email and (not phone or not re.fullmatch(r'56(?:9\d{8}|(?:43|45)\d{7})',phone)):
        return {**result,'reason':'application_contact_requires_review'}
    return {**result,'status':'verified','reason':'live_dated_local_notice_with_deadline_and_application',
            'title':fields['role'],'company':fields['company'],'work_commune':places[0],'work_location_verified':True,
            'source':adapter['name'],'valid_through':deadline.isoformat(),'application':'mailto:'+email if email else 'tel:+'+phone,
            'verification_method':adapter['name']+' individual notice + local document text',
            'source_evidence':{'sha256':sha256,'source_url':source_url,'complete_document':True,'text':text[:18000]}}


def run(*, output=None, checkpoints=None, fetcher=fetch_public, reader=read_medium, budget=None, max_pages=13, now=None):
    now, output = now or utcnow(), Path(output or output_dir())
    budget = budget or Budget(180)
    sources = configured_sources()
    prior = (checkpoints or {}).get(CHECKPOINT,{})
    queues = {key:list(value) for key,value in prior.get('queues',{}).items()}
    seen = {key:set(value) for key,value in prior.get('seen',{}).items()}
    position = int(prior.get('position',0))%max(1,len(sources))
    records, candidates, diagnostics, channels = [],{},[],[]
    pages, media_read = 0,0
    while sources and pages<max_pages and budget.remaining()>0:
        name, root = sources[position]
        queue = queues.get(name)
        if not queue:
            queue = [{'url':root,'published_at':None}]
            seen[name] = set()
        pending = queue[0];url = pending['url']
        diagnostic = {'source':name,'url':url,'status':'ok','lookback_days':45,'coverage_complete':False}
        try:
            raw,final,mime,status = fetcher(url,budget)
            if status!=200:raise ValueError('HTTP '+str(status))
            if mime not in ('text/html','application/xhtml+xml'):raise ValueError('not_html_source_page')
            page = discover(raw.decode('utf-8','replace'),final)
            channels.extend({'channel':channel,'discovered_from':final,'publisher':name,
                             'scope':'linked_by_primary_publisher; dedicated_OMIL_identity_not_assumed'}
                            for channel in page['public_social_links'])
            seen.setdefault(name,set()).add(url)
            published = page['source_published_at']
            source_sha = hashlib.sha256(raw).hexdigest()
            hiring_page = bool(HIRING.search(page['text']+' '+page['title']))
            if hiring_page:
                result = verify_notice(page['text'],final,published,sha256=source_sha,complete=len(page['text'])<14000,now=now)
                records.append(result)
                if source_adapter(final):candidates[final]={'url':final,'source':name,'commune_hint':None,'text':page['text'],
                  'source_published_at':published,'state':'pending_verification','work_location_verified':False}
            additions=[]
            media_candidates = list(page['candidates'])
            if hiring_page and source_adapter(final):
                for image in page['images']:
                    if not re.search(r'logo|banner|icon|slider|cropped|avatar|favicon',image,re.I):
                        media_candidates.append({'url':image,'kind':'document','title':'Imagen de la publicación laboral'})
            processed_media = set()
            for candidate in media_candidates:
                if candidate['kind']=='page':additions.append({'url':candidate['url'],'published_at':None})
                elif candidate['url'] not in processed_media and media_read<3 and budget.remaining()>0:
                    processed_media.add(candidate['url'])
                    medium=reader(candidate['url'],final,budget);media_read+=1
                    result=verify_notice(medium['text'],candidate['url'],published,sha256=medium['sha256'],
                      complete=medium.get('complete_document') is True and not medium.get('textTruncated') and
                        (medium.get('engine')=='pdftotext-local' or (medium.get('mean_confidence') or 0)>=70),now=now)
                    records.append({**result,'media_url':candidate['url'],'publisher_page':final,'engine':medium['engine']})
            parser=Links();parser.feed(raw.decode('utf-8','replace'))
            for href,label in parser.links:
                try:target=canonical_url(urllib.parse.urljoin(final,href)) if href.startswith(('http','/','?')) else None
                except ValueError:continue
                if target and same_publisher(root,target) and re.search(r'/page/\d+|[?&](?:page|paged)=\d+',target) and target!=url:
                    additions.append({'url':target,'published_at':None})
            combined=queue[1:]+additions
            queues[name]=list({item['url']:item for item in combined if item['url'] not in seen[name]}.values())[:80]
            diagnostic.update(page_date=published,next_pages=len(queues[name]),media_read=media_read)
        except Exception as exc:
            diagnostic.update(status='error',error=source_error(exc));queues[name]=queue
        diagnostics.append(diagnostic);pages+=1;position=(position+1)%len(sources)
    for notice in records:
        if source_adapter(notice['url']):
            candidates.setdefault(notice['url'],{'url':notice['url'],'source':notice.get('source') or 'Fuente local',
              'title_hint':notice.get('title') or notice.get('role'),'state':'pending_verification','work_location_verified':False})
    report={'schema':'trabajo-cerca.local-history.v1','generated_at':now.isoformat(),'lookback_days':45,'candidates':list(candidates.values()),
      'candidate_count':len(candidates),'notice_evidence':records,'verified_notices':sum(row['status']=='verified' for row in records),
      'diagnostics':diagnostics,'discovered_channels':channels,'published_count':0,'paid_provider_calls':0,'coverage_complete':False,
      'checkpoints':{CHECKPOINT:{'position':position,'queues':queues,'seen':{key:sorted(value)[-200:] for key,value in seen.items()}}}}
    write_json(output/'local_history.json',report)
    return report
