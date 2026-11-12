"""Motor A: source-page review and durable handoff to Motor D.

Read-only review: search results alone never justify publication.
"""
import collections
import datetime as dt
import html
import json
import os
import re
import unicodedata
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from chiletrabajos_direct import PLACES

STATE_PATH=Path('automation/motor_a_review/state.json')
OUT=Path('output')
HIRING=re.compile(r'oferta laboral|postula|postulaci[oó]n|requisitos|descripci[oó]n del empleo|'
                  r'descripci[oó]n del trabajo|jornada|vacante|empleo',re.I)
CLOSED=re.compile(r'oferta (?:expirada|finalizada|cerrada)|postulaci[oó]n(?:es)? '
                  r'(?:cerrada|finalizada)|esta oferta ya no',re.I)
ALIASES={'mininco':'Collipulli','coihue':'Negrete','coigue':'Negrete'}


def normalized(s):
    return ''.join(ch for ch in unicodedata.normalize('NFKD',str(s).lower())
                   if not unicodedata.combining(ch))


def communes(text):
    flat=normalized(text)
    hits=[town for town in PLACES if re.search(r'\b'+re.escape(normalized(town))+r'\b',flat)]
    for loc,town in ALIASES.items():
        if re.search(r'\b'+loc+r'\b',flat) and town not in hits:
            hits.append(town)
    return hits


def jsonld_jobs(raw):
    rows=[]
    for match in re.finditer(
            r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            raw,re.I|re.S):
        try:
            data=json.loads(html.unescape(match.group(1)))
            stack=[data]
            while stack:
                value=stack.pop()
                if isinstance(value,list):
                    stack.extend(value)
                elif isinstance(value,dict):
                    kind=value.get('@type',[])
                    if isinstance(kind,str):kind=[kind]
                    if 'JobPosting' in kind:
                        sites=communes(json.dumps(value.get('jobLocation',[]),ensure_ascii=False))
                        rows.append({'locations':sites,
                                     'date_source':value.get('datePosted'),
                                     'deadline':value.get('validThrough')})
                    stack.extend(v for v in value.values() if isinstance(v,(list,dict)))
        except (ValueError,TypeError):
            continue
    return rows


class Extract(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts=[];self.title='';self.in_title=False

    def handle_starttag(self,tag,attrs):
        if tag=='title':self.in_title=True

    def handle_endtag(self,tag):
        if tag=='title':self.in_title=False

    def handle_data(self,data):
        self.parts.append(data)
        if self.in_title:self.title+=data


def check(item,reader=None):
    url=item['url']
    if reader is None:
        def reader(value):
            req=urllib.request.Request(value,headers={
                'User-Agent':'Mozilla/5.0 (compatible; TrabajoCerca/1.0)'})
            with urllib.request.urlopen(req,timeout=12) as response:
                return response.geturl(),response.status,response.read(600000).decode('utf-8','replace')
    final,status,raw=reader(url)
    if status!=200:
        return {'status':'pending','reason':'source_http_'+str(status)}
    parsed=urllib.parse.urlparse(final)
    if parsed.scheme!='https' or parsed.hostname not in ('chiletrabajos.cl','www.chiletrabajos.cl') or not re.fullmatch(r'/trabajo/[^/?#]+/?',parsed.path):
        return {'status':'rejected','reason':'redirected_outside_original_job'}
    doc=Extract();doc.feed(raw)
    body=re.sub(r'\s+',' ',html.unescape(' '.join(doc.parts)))
    if CLOSED.search(body[:10000]):
        return {'status':'rejected','reason':'closed_notice'}
    if not HIRING.search(body):
        return {'status':'pending','reason':'hiring_text_missing'}
    jobs=jsonld_jobs(raw)
    locations=list(dict.fromkeys(t for j in jobs for t in j['locations']))
    if len(locations)==1:
        job=next((j for j in jobs if locations[0] in j['locations']),{})
        return {'status':'review_ready','reason':'jobposting_structured_location',
                'title':doc.title[:200], 'work_commune':locations[0],
                'locations_seen':locations,'date_source_hint':job.get('date_source'),
                'deadline_hint':job.get('deadline'),'url':final,
                'note':'Primary worksite confirmed by JobPosting; source date and application still need D verification.'}
    if len(locations)>1:
        return {'status':'pending','reason':'multiple_structured_locations',
                'locations_seen':locations,'title':doc.title[:180]}
    explicit=re.search(r'(?:lugar de trabajo|ubicaci[oó]n laboral|comuna de ejecuci[oó]n)\s*:\s*([^.;]{3,90})',
                       normalized(body),re.I)
    work=communes(explicit.group(1)) if explicit else []
    if len(work)==1:
        return {'status':'review_ready','reason':'explicit_labeled_worksite',
                'title':doc.title[:180],'work_commune':work[0],
                'locations_seen':work,'url':final,
                'note':'Explicit worksite label; D must verify original date and postulation.'}
    return {'status':'pending','reason':'worksite_not_individually_confirmed',
            'title':doc.title[:180],'locations_seen':communes(body),
            'url':final}


def choose(candidates,previous,limit):
    """Oldest verified first, then round-robin all twelve search communes."""
    buckets={k:[] for k in PLACES}
    for row in candidates:
        names=[name for name in row.get('commune_queries',[row.get('commune_query')])
               if name in PLACES]
        # A cross-listed URL belongs to exactly one source work queue for this
        # run; indexing it in many buckets must NOT consume slots repeatedly.
        chosen=names[0] if names else PLACES[0]
        buckets[chosen].append(row)
    for rows in buckets.values():
        rows.sort(key=lambda item:(previous.get(item['url'],''),item['url']))
    selected=[]
    while len(selected)<limit and any(buckets.values()):
        for town in PLACES:
            if buckets[town] and len(selected)<limit:
                selected.append(buckets[town].pop(0))
    return selected


def verify(source,previous=None,limit=60,checker=check):
    previous=previous or {}
    candidates=source.get('candidates',[])
    selection=choose(candidates,previous,limit)
    at=dt.datetime.now(dt.timezone.utc).isoformat()
    report={'checked_at':at,'source_candidates':len(candidates),
            'checked':0,'review_ready':0,'verified':0,'published':0,'errors':0,
            'communes_queried':list(PLACES),'results':[]}
    for row in selection:
        try:
            found=checker(row)
        except Exception as exc:
            found={'status':'error','reason':str(exc)[:140]}
            report['errors']+=1
        report['results'].append({'candidate_url':row['url'],
                                  'commune_queries':row.get('commune_queries',[row.get('commune_query')]),
                                  **found})
        report['checked']+=1
        if found['status']=='review_ready':report['review_ready']+=1
        previous[row['url']]=at
    report['reasons']=dict(collections.Counter(
        x.get('reason','unknown') for x in report['results']))
    report['statuses']=dict(collections.Counter(
        x.get('status','unknown') for x in report['results']))
    return report,previous


def main():
    OUT.mkdir(exist_ok=True)
    source_path=OUT/'chiletrabajos_direct.json'
    source=json.loads(source_path.read_text(encoding='utf-8')) if source_path.exists() else {'candidates':[]}
    state=json.loads(STATE_PATH.read_text(encoding='utf-8')) if STATE_PATH.exists() else {}
    last=state.get('last_checks',{})
    if not isinstance(last,dict):raise ValueError('Invalid Motor A verification state')
    report,checks=verify(source,last,limit=min(120,max(1,int(os.getenv('VERIFY_LIMIT','60')))))
    # Bounded histories are a review aid, never proof of current availability.
    checks=dict(sorted(checks.items(),key=lambda p:p[1],reverse=True)[:4500])
    (OUT/'verification_stage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'motor_a_checks.json').write_text(json.dumps({
        'schema_version':1,'checked_at':report['checked_at'],
        'last_checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
    print('VERIFY_STAGE '+json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False))


if __name__=='__main__':
    main()
