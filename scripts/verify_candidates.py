"""Verify supported individual public jobs against current source evidence.

Unreadable or incomplete pages remain pending; no paid fallback is invoked.
This module never publishes or calls AI, Apify Actors or AppDeploy.
"""
import collections
import datetime as dt
import html
import json
import re
import subprocess
import urllib.parse
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

try:
    from .common import MAX_SOURCE_AGE_DAYS, Links, canonical_url, communes, normalized, output_dir, parse_date, safe_error, utcnow, write_json
    from .state import choose_candidates
    from .public_source_adapters import source_adapter, same_job
except ImportError:
    from common import MAX_SOURCE_AGE_DAYS, Links, canonical_url, communes, normalized, output_dir, parse_date, safe_error, utcnow, write_json
    from state import choose_candidates
    from public_source_adapters import source_adapter, same_job

INPUT_FILES = ('report.json', 'backfill.json', 'chiletrabajos_direct.json', 'public_portals.json', 'apify_existing_results.json')
CLOSED = re.compile(r'oferta (?:expirada|finalizada|cerrada)|postulaci[oó]n(?:es)? (?:cerradas?|finalizadas?)|esta oferta ya no', re.I)
HIRING = re.compile(r'oferta laboral|postul|requisitos|descripci[oó]n del (?:empleo|trabajo)|jornada|vacante|empleo', re.I)


def supported_url(url):
    return source_adapter(url) is not None


def evaluate_public(item, raw, final_url, status, now):
    inputs = {'url':item['url'], 'raw':raw, 'final_url':final_url,
              'status':status, 'now':int(now.timestamp()*1000)}
    result = subprocess.run(['node','--disable-warning=ExperimentalWarning',
                              str(Path(__file__).with_name('verify_public_source.mjs'))],
                            input=json.dumps(inputs,ensure_ascii=False),capture_output=True,
                            text=True,timeout=8,check=True)
    return json.loads(result.stdout)


class Extract(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.title, self.scripts = [], '', []
        self.intitle = False
        self.skip = []
        self.ld = False
        self.script = []

    def handle_starttag(self, tag, attrs):
        if tag == 'title':
            self.intitle = True
        if tag == 'script':
            self.ld = dict(attrs).get('type', '').lower() == 'application/ld+json'
            self.script = []
        if tag in ('script', 'style', 'nav', 'footer', 'header', 'aside'):
            self.skip.append(tag)

    def handle_endtag(self, tag):
        if tag == 'title':
            self.intitle = False
        if tag == 'script' and self.ld:
            self.scripts.append(''.join(self.script))
            self.ld = False
        if self.skip and self.skip[-1] == tag:
            self.skip.pop()

    def handle_data(self, data):
        if self.intitle:
            self.title += data
        if self.ld:
            self.script.append(data)
        if not self.skip and not self.intitle:
            self.parts.append(data)


def job_postings(parser):
    postings = []
    for script in parser.scripts:
        try:
            stack = [json.loads(script)]
        except (ValueError, TypeError):
            continue
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(node)
            elif isinstance(node, dict):
                typ = node.get('@type', [])
                typ = [typ] if isinstance(typ, str) else typ
                if isinstance(typ, list) and 'JobPosting' in typ:
                    postings.append(node)
                stack.extend(value for value in node.values() if isinstance(value, (dict, list)))
    return postings


def work_locations(job):
    locations = job.get('jobLocation', [])
    locations = locations if isinstance(locations, list) else [locations]
    found = []
    for location in locations:
        address = location.get('address', {}) if isinstance(location, dict) else {}
        if not isinstance(address, dict):
            return []
        country = address.get('addressCountry')
        if isinstance(country, dict):
            country = country.get('name') or country.get('identifier')
        if country and normalized(country) not in ('cl', 'chile'):
            return []
        locality = address.get('addressLocality', '')
        for place in communes(locality):
            if place not in found:
                found.append(place)
        # Do not collapse a multi-location job by discarding non-target cities.
        if not communes(locality):
            return []
    return found


def application_method(raw, url):
    parser = Links()
    parser.feed(raw)
    for href, label in parser.links:
        if not re.search(r'postul|envi.{0,20}(?:cv|curr[ií]culum)', label, re.I):
            continue
        target = urllib.parse.urljoin(url, href)
        if target.lower().startswith('mailto:') and re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', target[7:].split('?')[0]):
            return target
        try:
            return canonical_url(target)
        except ValueError:
            continue
    return None


def original_source_links(raw, url):
    parser = Links()
    parser.feed(raw)
    originals = set()
    for href, label in parser.links:
        if not re.search(r'postul|aplicar|apply|ver (?:la )?oferta|fuente original', label, re.I):
            continue
        try:
            target = canonical_url(urllib.parse.urljoin(url,href))
        except ValueError:
            continue
        adapter = source_adapter(target)
        if adapter and adapter['family'] != 'aggregator':
            originals.add(target)
    return sorted(originals)


def evaluate(item, raw, final_url, *, status=200, now=None):
    now = now or utcnow()
    adapter = source_adapter(item['url'])
    if adapter and adapter['name'] != 'Chiletrabajos':
        return evaluate_public(item, raw, final_url, status, now)
    if status in (404, 410):
        return {'status': 'rejected', 'reason': 'source_removed'}
    if status != 200:
        return {'status': 'pending', 'reason': f'HTTP {status}'}
    if not supported_url(final_url):
        return {'status': 'rejected', 'reason': 'redirected_outside_job'}
    if not same_job(item['url'], final_url):
        return {'status': 'pending', 'reason': 'redirected_to_other_job'}
    parser = Extract()
    parser.feed(raw)
    body = re.sub(r'\s+', ' ', html.unescape(' '.join(parser.parts)))
    if CLOSED.search(body):
        return {'status': 'rejected', 'reason': 'closed_notice'}
    postings = job_postings(parser)
    matched = []
    for job in postings:
        entity = job.get('mainEntityOfPage')
        urls = [job.get('url'), entity.get('@id') if isinstance(entity, dict) else entity]
        for url in urls:
            try:
                if url and canonical_url(url) == canonical_url(final_url):
                    matched.append(job)
                    break
            except (ValueError, TypeError):
                continue
    if len(matched) == 1:
        job = matched[0]
    elif (not matched and len(postings) == 1 and not postings[0].get('url')
          and not postings[0].get('mainEntityOfPage') and postings[0].get('title')
          and normalized(str(postings[0]['title'])).strip() in normalized(parser.title)):
        job = postings[0]
    else:
        return {'status': 'pending', 'reason': 'ambiguous_jobposting' if postings else 'structured_jobposting_missing',
                'title': parser.title[:200]}
    title = job.get('title')
    locations = work_locations(job)
    if not isinstance(title, str) or not title.strip():
        return {'status': 'pending', 'reason': 'job_title_missing'}
    if len(locations) != 1:
        return {'status': 'pending', 'reason': 'worksite_missing_or_multiple', 'locations_seen': locations}
    employer = job.get('hiringOrganization', {})
    employer = employer.get('name', '') if isinstance(employer, dict) else ''
    base = {'title': title.strip(), 'company': employer, 'work_commune': locations[0],
            'work_location_verified': True, 'url': canonical_url(final_url),
            'source': item.get('source') or 'Chiletrabajos'}
    date_posted, deadline = parse_date(job.get('datePosted')), parse_date(job.get('validThrough'))
    if deadline and deadline <= now:
        return {**base, 'status': 'rejected', 'reason': 'expired_deadline'}
    if not date_posted or date_posted > now:
        return {**base, 'status': 'pending', 'reason': 'source_date_missing_or_future'}
    base['source_published_at'] = date_posted.isoformat()
    if now - date_posted > dt.timedelta(days=MAX_SOURCE_AGE_DAYS):
        return {**base, 'status': 'pending', 'reason': 'source_older_than_45_days'}
    application = application_method(raw, final_url)
    if not HIRING.search(body):
        return {**base, 'status': 'pending', 'reason': 'hiring_text_missing'}
    if not employer or not application or not deadline:
        return {**base, 'status': 'review_ready', 'reason': 'date_application_or_employer_requires_review'}
    return {**base, 'status': 'verified', 'reason': 'live_jobposting_with_deadline_and_application',
            'valid_through': deadline.isoformat(), 'application': application,
            'verification_method': 'Chiletrabajos individual page + matching JobPosting'}


class JobRedirectGuard(urllib.request.HTTPRedirectHandler):
    def __init__(self, original=None):
        super().__init__()
        self.original = original

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not supported_url(newurl) or (self.original and not same_job(self.original,newurl)):
            raise ValueError('redirected_outside_job')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def check(item, *, opener=None, budget=None, now=None):
    if not supported_url(item['url']):
        return {'status': 'pending', 'reason': 'source_adapter_not_implemented'}
    timeout = min(12, budget.remaining()) if budget else 12
    if timeout <= 0:
        return {'status': 'pending', 'reason': 'stage_budget_exhausted'}
    opener = opener or urllib.request.build_opener(JobRedirectGuard(item['url'])).open
    request = urllib.request.Request(canonical_url(item['url']), headers={
        'User-Agent': 'Mozilla/5.0 (compatible; TrabajoCerca/1.1)'})
    try:
        with opener(request, timeout=timeout) as response:
            data = response.read(600001)
            if len(data)>600000:
                return {'status':'pending','reason':'source_byte_budget_exceeded'}
            raw = data.decode('utf-8', 'replace')
            if source_adapter(item['url'])['family'] == 'aggregator' and response.status == 200:
                originals = original_source_links(raw,response.geturl())
                if len(originals) != 1:
                    return {'status':'pending','reason':'aggregator_requires_unambiguous_original_source',
                            'original_candidates':originals[:5]}
                original = originals[0]
                result = check({**item,'url':original},budget=budget,now=now)
                return {**result,'discovery_source':item['url'],'origin_resolution':'individual_original_source'}
            return evaluate(item, raw, response.geturl(), status=response.status, now=now)
    except urllib.error.HTTPError as exc:
        return evaluate(item, '', item['url'], status=exc.code, now=now)
    except ValueError as exc:
        if str(exc) == 'redirected_outside_job':
            return {'status': 'rejected', 'reason': 'redirected_outside_job'}
        raise


def run(*, candidates=None, state=None, limit=30, output=None, checker=check, budget=None, now=None):
    now, output = now or utcnow(), output or output_dir()
    if not 0 <= limit <= 60:
        raise ValueError('VERIFY_LIMIT must be between 0 and 60')
    if state is not None:
        candidates = state.inventory()
        chosen = state.choose(limit, now)
    else:
        if candidates is None:
            candidates = []
            for filename in INPUT_FILES:
                path = output / filename
                if path.exists():
                    candidates.extend(json.loads(path.read_text(encoding='utf-8')).get('candidates', []))
        unique = {canonical_url(item['url']): item for item in candidates}
        candidates = list(unique.values())
        chosen = choose_candidates(candidates, limit)
    report = {'checked_at': now.isoformat(), 'source_candidates': len(candidates),
              'checked': 0, 'review_ready': 0, 'verified': 0, 'published': 0,
              'errors': 0, 'results': [],
              'unsupported_candidates': sum(not supported_url(c['url']) for c in candidates)}
    for item in chosen:
        if budget and budget.remaining() <= 0:
            break
        try:
            result = checker(item, now=now, budget=budget)
        except Exception as exc:
            result = {'status': 'error', 'reason': safe_error(exc)}
        if state is not None:
            state.record_result(item, result, now)
        report['results'].append({'candidate_url': item['url'],
                                  'commune_query': item.get('commune_query'), **result})
    report['checked'] = len(report['results'])
    for field in ('review_ready', 'verified'):
        report[field] = sum(r['status'] == field for r in report['results'])
    report['errors'] = sum(r['status'] == 'error' for r in report['results'])
    report['reasons'] = dict(collections.Counter(r.get('reason', 'unknown') for r in report['results']))
    report['statuses'] = dict(collections.Counter(r['status'] for r in report['results']))
    write_json(output / 'verification_stage.json', report)
    return report


if __name__ == '__main__':
    import os
    run_limit = int(os.environ.get('VERIFY_LIMIT', '30'))
    result = run(limit=run_limit)
    print('VERIFY_STAGE ' + json.dumps({k: v for k, v in result.items() if k != 'results'}, ensure_ascii=False))
