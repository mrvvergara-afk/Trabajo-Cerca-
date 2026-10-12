"""Public municipal and RSS discovery; records still require verification."""
import re
import urllib.parse
import xml.etree.ElementTree as ET
try:
    from .common import COMMUNES, Links, canonical_url, communes, fetch_text, output_dir, safe_error, utcnow, write_json
except ImportError:
    from common import COMMUNES, Links, canonical_url, communes, fetch_text, output_dir, safe_error, utcnow, write_json

SOURCES = [
    ('OMIL Mulchén', 'https://www.munimulchen.cl/'),
    ('OMIL Mulchén - Jefe de Terreno', 'https://www.munimulchen.cl/oferta-laboral-jefe-de-terreno/'),
    ('OMIL Nacimiento - publicaciones', 'https://www.govern1.com/CL/Nacimiento/102913642090515/OMIL-Municipalidad-de-Nacimiento'),
    ('Renaico - concursos', 'https://municipalidadrenaico.cl/concursos-publicos/'),
    ('Municipalidad de Angol', 'https://www.angol.cl/'),
    ('Municipalidad de Nacimiento', 'https://www.nacimiento.cl/'),
    ('Municipalidad de Collipulli', 'https://www.municipalidadcollipulli.cl/'),
]
KEYWORDS = re.compile(r'empleo|trabajo|vacante|postulaci[oó]n|oferta.laboral|se.busca|omil|convocatoria', re.I)
HIRING = re.compile(r'ofertas? laborales?|vacantes?|se (?:busca|requiere|necesita)|contrataci[oó]n|postulaciones|omil', re.I)
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

    for name, origin_url in (SOURCES if sources is None else sources):
        previous = (checkpoints or {}).get(name, {})
        queue = [tuple(pair) for pair in previous.get('queue', [])] or [(origin_url, 0)]
        visited = set(previous.get('visited', [])) if previous.get('queue') else set()
        attempts = succeeded = found = 0
        errors, retry = [], []
        host = urllib.parse.urlsplit(origin_url).hostname.lower().removeprefix('www.')
        while queue and attempts < max_pages and (not budget or budget.remaining() > 0):
            current, depth = queue.pop(0)
            if current in visited:
                continue
            attempts += 1
            try:
                page = fetcher(current, budget=budget)
                succeeded += 1
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
                    if KEYWORDS.search(link):
                        found += add(name, link, title)
                    if depth < 3 and not BINARY.search(link) and ARCHIVE.search(link):
                        if link not in visited and all(pair[0] != link for pair in queue):
                            queue.append((link, depth + 1))
                if KEYWORDS.search(current):
                    found += add(name, current)
            except Exception as exc:
                errors.append({'url': current, 'reason': safe_error(exc)})
                retry.append((current, depth))
        queue.extend(retry)
        status = 'error' if errors and not succeeded else 'partial' if errors or queue else 'ok'
        diagnostics.append({'source': name, 'status': status, 'pages_scanned': attempts,
                            'pages_succeeded': succeeded, 'candidate_links': found,
                            'coverage_complete': not queue, 'pages_pending': len(queue),
                            'errors': errors})
        saved[name] = {'queue': queue, 'visited': sorted(visited) if queue else [],
                       'coverage_complete': not queue}

    for place in (COMMUNES if places is None else places):
        if budget and budget.remaining() <= 0:
            diagnostics.append({'source': 'Google News RSS ' + place, 'status': 'deferred',
                                'reason': 'stage_budget_exhausted'})
            continue
        query = f'"{place}" ("oferta laboral" OR "se necesita" OR "se busca" OR "vacantes" OR OMIL) when:60d'
        url = 'https://news.google.com/rss/search?q=' + urllib.parse.quote(query) + '&hl=es-419&gl=CL&ceid=CL:es-419'
        try:
            root = ET.fromstring(fetcher(url, budget=budget))
            found = 0
            for item in root.findall('./channel/item')[:40]:
                title, link = item.findtext('title', '').strip(), item.findtext('link', '').strip()
                if link and HIRING.search(title) and not EXCLUDE.search(title) and place in communes(title):
                    found += add('Google News RSS', link, title, place)
            diagnostics.append({'source': 'Google News RSS ' + place, 'status': 'ok',
                                'candidate_links': found, 'coverage_complete': False})
        except Exception as exc:
            diagnostics.append({'source': 'Google News RSS ' + place, 'status': 'error',
                                'reason': safe_error(exc)})
    report = {'run_at': now.isoformat(), 'candidates': list(records.values()),
              'candidate_count': len(records), 'diagnostics': diagnostics,
              'checkpoints': saved, 'published': 0,
              'note': 'Discovery only. RSS coverage is limited to indexed content.'}
    write_json((output or output_dir()) / 'report.json', report)
    return report


if __name__ == '__main__':
    import json
    result = run()
    print(json.dumps({'candidate_links': result['candidate_count'],
                      'diagnostics': result['diagnostics']}, ensure_ascii=False))
