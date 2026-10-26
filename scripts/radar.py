"""Public municipal and RSS discovery; records still require verification."""
import re
import datetime as dt
import email.utils
import json
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
try:
    from .common import COMMUNES, MAX_SOURCE_AGE_DAYS, Links, canonical_url, communes, fetch_text, output_dir, safe_error, utcnow, write_json
except ImportError:
    from common import COMMUNES, MAX_SOURCE_AGE_DAYS, Links, canonical_url, communes, fetch_text, output_dir, safe_error, utcnow, write_json

SOURCE_CONFIG = Path(__file__).resolve().parents[1] / 'config' / 'local-source-priorities.json'
ROTATION_CHECKPOINT = '__public_source_rotation__'


def configured_sources(path=SOURCE_CONFIG):
    """Use the reviewed public websites; social profiles need their own collector."""
    config = json.loads(Path(path).read_text(encoding='utf-8'))
    sources = []
    for source in config['sources']:
        if source.get('family') not in ('municipal', 'media', 'employer', 'official') or source.get('identity_requires_check'):
            continue
        entry = (source['name'], canonical_url(source['url']))
        if entry not in sources:
            sources.append(entry)
    return sources


KEYWORDS = re.compile(r'empleo|trabaj[oa]|vacante|postulaci[oó]n|oferta.laboral|se.busca|omil|convocatoria|career|join.our.team', re.I)
HIRING = re.compile(r'ofertas? laboral(?:es)?|vacantes?|se (?:busca|requiere|necesita)|contrataci[oó]n|postulaciones|omil', re.I)
EXCLUDE = re.compile(r'subsidio|inversi[oó]n|exportaciones|inteligencia artificial|dossier art[ií]stico|pymes|villarruel|argentina|tamaulipas|rancahuaso', re.I)
ARCHIVE = re.compile(r'page/\d+|[?&](?:paged|page)=\d+|/category/|/categoria/|/tag/|/ofertas?|/empleo|/trabajo|/omil|/convocatoria|/concursos?', re.I)
OLD_ARCHIVE = re.compile(r'/20(?:0\d|1\d|2[0-4])/')
BINARY = re.compile(r'\.(?:pdf|jpe?g|png|docx?|xlsx?)(?:\?|$)', re.I)


def run(*, fetcher=fetch_text, output=None, sources=None, places=None,
        max_pages=35, budget=None, checkpoints=None, now=None):
    now = now or utcnow()
    records, diagnostics, saved = {}, [], {}

    def add(source, url, title='', commune=None):
        try:
            url = canonical_url(url)
        except ValueError:
            return False
        if OLD_ARCHIVE.search(url) or url in records:
            return False
        records[url] = {'source': source, 'url': url, 'title': title,
                        'commune_hint': commune, 'state': 'pending_verification',
                        'discovered_at': now.isoformat(), 'work_location_verified': False}
        return True

    sources = list(configured_sources() if sources is None else sources)
    work = []
    for name, origin_url in sources:
        previous = (checkpoints or {}).get(name, {})
        queue = [tuple(pair) for pair in previous.get('queue', [])] or [(origin_url, 0)]
        visited = set(previous.get('visited', [])) if previous.get('queue') else set()
        work.append({'name':name, 'origin':origin_url, 'queue':queue, 'visited':visited,
                     'attempts':0, 'succeeded':0, 'found':0, 'errors':[], 'retry':[]})
    start = (checkpoints or {}).get(ROTATION_CHECKPOINT, {}).get('next_source')
    names = [source['name'] for source in work]
    start_index = names.index(start) if start in names else 0
    order = list(range(start_index, len(work))) + list(range(start_index))
    last_served = None
    # One page per source in each round. A slow archive cannot consume all quotas.
    while any(source['queue'] and source['attempts'] < max_pages for source in work):
        if budget and budget.remaining() <= 0:
            break
        for index in order:
            source = work[index]
            queue, visited = source['queue'], source['visited']
            if not queue or source['attempts'] >= max_pages:
                continue
            if budget and budget.remaining() <= 0:
                break
            current, depth = queue.pop(0)
            if current in visited:
                continue
            source['attempts'] += 1
            last_served = index
            host = urllib.parse.urlsplit(source['origin']).hostname.lower().removeprefix('www.')
            try:
                page = fetcher(current, budget=budget)
                source['succeeded'] += 1
                visited.add(current)
                parser = Links()
                parser.feed(page)
                for href, title in parser.links:
                    try:
                        link = canonical_url(urllib.parse.urljoin(current, href))
                    except ValueError:
                        continue
                    parsed = urllib.parse.urlsplit(link)
                    if parsed.hostname.lower().removeprefix('www.') != host or OLD_ARCHIVE.search(link):
                        continue
                    if KEYWORDS.search(link + ' ' + title):
                        source['found'] += add(source['name'], link, title)
                    if depth < 3 and not BINARY.search(link) and ARCHIVE.search(link):
                        if link not in visited and all(pair[0] != link for pair in queue):
                            queue.append((link, depth + 1))
                if KEYWORDS.search(current):
                    source['found'] += add(source['name'], current)
            except Exception as exc:
                source['errors'].append({'url': current, 'reason': safe_error(exc)})
                source['retry'].append((current, depth))
    for source in work:
        name = source['name']
        queue, visited = source['queue'], source['visited']
        attempts, succeeded, found = source['attempts'], source['succeeded'], source['found']
        errors, retry = source['errors'], source['retry']
        queue.extend(retry)
        status = 'deferred' if not attempts and queue else 'error' if errors and not succeeded else 'partial' if errors or queue else 'ok'
        diagnostics.append({'source': name, 'status': status, 'pages_scanned': attempts,
                            'pages_succeeded': succeeded, 'candidate_links': found,
                            'coverage_complete': False, 'crawl_queue_complete': not queue,
                            'historical_coverage_verified': False, 'pages_pending': len(queue),
                            'errors': errors})
        saved[name] = {'queue': queue, 'visited': sorted(visited) if queue else [],
                       'coverage_complete': not queue}
    if work:
        next_index = (last_served + 1) % len(work) if last_served is not None else start_index
        saved[ROTATION_CHECKPOINT] = {'next_source':names[next_index]}

    for place in (COMMUNES if places is None else places):
        if budget and budget.remaining() <= 0:
            diagnostics.append({'source': 'Google News RSS ' + place, 'status': 'deferred',
                                'reason': 'stage_budget_exhausted'})
            continue
        query = f'"{place}" ("oferta laboral" OR "se necesita" OR "se busca" OR "vacantes" OR OMIL) when:{MAX_SOURCE_AGE_DAYS}d'
        url = 'https://news.google.com/rss/search?q=' + urllib.parse.quote(query) + '&hl=es-419&gl=CL&ceid=CL:es-419'
        try:
            root = ET.fromstring(fetcher(url, budget=budget))
            found = 0
            for item in root.findall('./channel/item')[:40]:
                title, link = item.findtext('title', '').strip(), item.findtext('link', '').strip()
                try:
                    when = email.utils.parsedate_to_datetime(item.findtext('pubDate', ''))
                    when = when.replace(tzinfo=when.tzinfo or dt.timezone.utc).astimezone(dt.timezone.utc)
                except (ValueError, TypeError, OverflowError):
                    when = None
                if when and (when > now or now - when > dt.timedelta(days=MAX_SOURCE_AGE_DAYS)):
                    continue
                if link and HIRING.search(title) and not EXCLUDE.search(title) and place in communes(title):
                    found += add('Google News RSS', link, title, place)
            diagnostics.append({'source': 'Google News RSS ' + place, 'status': 'ok',
                                'candidate_links': found, 'coverage_complete': False})
        except Exception as exc:
            diagnostics.append({'source': 'Google News RSS ' + place, 'status': 'error',
                                'reason': safe_error(exc)})
    report = {'run_at': now.isoformat(), 'candidates': list(records.values()),
              'candidate_count': len(records), 'diagnostics': diagnostics,
              'checkpoints': saved, 'published': 0, 'lookback_days':MAX_SOURCE_AGE_DAYS,
              'note': 'Discovery only. Website queue exhaustion does not prove 45-day coverage. RSS is indexed news, not a complete job archive; unknown dates remain pending.'}
    write_json((output or output_dir()) / 'report.json', report)
    return report


if __name__ == '__main__':
    import json
    result = run()
    print(json.dumps({'candidate_links': result['candidate_count'],
                      'diagnostics': result['diagnostics']}, ensure_ascii=False))
