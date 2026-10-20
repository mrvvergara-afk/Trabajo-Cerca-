"""Bounded free portal discovery with persistent rotation and pagination."""
import json
import re
import urllib.parse
from pathlib import Path

try:
    from .common import COMMUNES, Links, canonical_url, normalized, output_dir, safe_error, utcnow, write_json, Budget
    from .local_source_audit import fetch_public
    from .public_source_adapters import source_adapter
except ImportError:
    from common import COMMUNES, Links, canonical_url, normalized, output_dir, safe_error, utcnow, write_json, Budget
    from local_source_audit import fetch_public
    from public_source_adapters import source_adapter

CONFIG = Path(__file__).resolve().parents[1]/'config/portal-source-priorities.json'
CHECKPOINT = 'public_portal_history_v1'


class PortalLinks(Links):
    def __init__(self):
        super().__init__()
        self.next_links = []

    def handle_starttag(self, tag, attrs):
        super().handle_starttag(tag,attrs)
        values = dict(attrs)
        if tag=='a' and values.get('href') and 'next' in values.get('rel','').split():
            self.next_links.append(values['href'])


def plans(places=None):
    config = json.loads(CONFIG.read_text(encoding='utf-8'))
    result = []
    for place in (COMMUNES if places is None else places):
        for source in config['sources']:
            url = source['search'].format(place=urllib.parse.quote(place),slug=normalized(place).replace(' ','-'))
            result.append({'key':source['key']+':'+place,'source':source['name'],'commune_query':place,'url':url})
    return result


def run(*, output=None, places=None, checkpoints=None, budget=None, fetcher=None, max_requests=10, now=None):
    now, output = now or utcnow(), output or output_dir()
    budget=budget or Budget(180)
    if fetcher is None:
        from .public_document_http import PublicCapture
        fetcher=PublicCapture(output/'public-capture')
    searches = plans(places)
    checkpoint = (checkpoints or {}).get(CHECKPOINT,{})
    queues = {key:list(value) for key,value in checkpoint.get('queues',{}).items()}
    position = int(checkpoint.get('position',0))%max(1,len(searches))
    candidates, diagnostics = {}, []
    requests = 0
    while searches and requests<min(max_requests,len(searches)) and (not budget or budget.remaining()>0):
        plan = searches[position]
        pending = queues.get(plan['key']) or [plan['url']]
        current = pending[0]
        record = {**plan,'request_url':current,'coverage_complete':False,'historical_coverage_verified':False,
                  'candidates':0,'status':'ok','lookback_days':45}
        try:
            raw, final, mime, status = fetcher(current,budget)
            text = raw.decode('utf-8','replace') if isinstance(raw,bytes) else raw
            if status!=200:raise ValueError('HTTP '+str(status))
            if re.search(r'verify you are human|access denied|unusual traffic|challenge-platform',text,re.I):
                raise ValueError('public_access_challenge')
            parser = PortalLinks();parser.feed(text)
            for href, title in parser.links:
                try:url = canonical_url(urllib.parse.urljoin(final,href))
                except ValueError:continue
                adapter = source_adapter(url)
                if not adapter:continue
                candidates.setdefault(url,{'url':url,'source':adapter['name'],'title_hint':title[:200],
                  'commune_query':plan['commune_query'],'work_location_verified':False,'discovered_at':now.isoformat(),
                  'state':'pending_verification'})
                record['candidates'] += 1
            next_pages = []
            for href in parser.next_links:
                try:target = canonical_url(urllib.parse.urljoin(final,href))
                except ValueError:continue
                if urllib.parse.urlsplit(target).hostname.removeprefix('www.')==urllib.parse.urlsplit(final).hostname.removeprefix('www.') and target!=current:
                    next_pages.append(target)
            queues[plan['key']] = list(dict.fromkeys(pending[1:]+next_pages))[:20]
            record['next_pages'] = len(queues[plan['key']])
            if not record['candidates']:record['status']='limited'
        except Exception as exc:
            from .public_document_http import public_error
            record.update(status='error',error=public_error(exc))
            queues[plan['key']] = pending
        diagnostics.append(record)
        requests += 1
        position = (position+1)%len(searches)
    report = {'generated_at':now.isoformat(),'lookback_days':45,'candidates':list(candidates.values()),
              'candidate_count':len(candidates),'diagnostics':diagnostics,'requests':requests,'published_count':0,
              'paid_provider_calls':0,'checkpoints':{CHECKPOINT:{'position':position,'queues':queues}},
              'coverage_complete':False,'note':'Individual source pages require verification; pagination and blocked sources remain pending.'}
    write_json(output/'public_portals.json',report)
    return report
