"""Read public snapshots and distinguish producer provenance from corroboration."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
import unicodedata


def normalized(value):
    return ' '.join(re.findall(r'[a-z0-9]+', unicodedata.normalize('NFKD', str(value).lower()).encode('ascii', 'ignore').decode()))


def source_key(item):
    try:
        url = urlsplit(item.get('url_original') or item['url'])
        host = (url.hostname or '').removeprefix('www.')
    except (ValueError, KeyError):
        return None
    if not host or url.scheme != 'https':
        return None
    path = url.path.rstrip('/')
    if host in {'chiletrabajos.cl', 'portal.chiletrabajos.cl'}:
        identity = re.search(r'/trabajo/(?:[^/]*-)?(\d{5,12})$', path)
        if identity:
            return ('chiletrabajos.cl', identity.group(1))
    if host == 'trabajando.cl':
        identity = re.match(r'^/trabajo/(\d{5,})(?:-[^/]+)?$', path)
        if identity:
            return (host, identity.group(1))
    if not path or url.query:
        return None
    return (host, path)


def json_get(url):
    request = Request(url, headers={'User-Agent': 'TrabajoCercaAudit/1.0', 'Accept': 'application/json'})
    with urlopen(request, timeout=12) as response:
        if response.headers.get_content_type() != 'application/json':
            raise ValueError('El servidor no entregó JSON')
        return json.load(response)


def public_offers(base):
    cursor = None
    seen = set()
    version = None
    offers = []
    for _ in range(100):
        query = {'fresh': '1'}
        if cursor:
            query['cursor'] = cursor
        page = json_get(base + '/api/listings?' + urlencode(query))
        version = version or page.get('updatedAt')
        if page.get('updatedAt') != version or not version or page.get('degraded') or page.get('feedRebuilding'):
            raise ValueError('Manifiesto cambiante o degradado')
        offers.extend(item for item in page['items'] if item.get('kind') == 'job_offer' and item.get('verified') is True)
        cursor = page.get('nextCursor')
        if not cursor:
            if page.get('hasMore'):
                raise ValueError('Falta cursor')
            if len({item['id'] for item in offers}) != len(offers):
                raise ValueError('IDs duplicados')
            return version, offers
        if cursor in seen:
            raise ValueError('Cursor repetido')
        seen.add(cursor)
    raise ValueError('Paginación parcial')


def reconcile(offers, batches):
    by_id = {}
    by_source = defaultdict(set)
    for engine, batch_id, offer in batches:
        key = offer.get('id_fuente')
        if isinstance(key, str) and re.fullmatch(r'(?:cg|d)_[a-f0-9]{20}', key):
            by_id['chatgpt_' + key] = engine
        stamp = source_key(offer)
        title = normalized(offer.get('cargo', ''))
        company = normalized(offer.get('empresa', ''))
        if stamp and title and company:
            by_source[(stamp, title, company)].add(engine)
    summary = Counter()
    rows = []
    for offer in offers:
        stamp = source_key(offer)
        exact = by_id.get(offer['id'])
        corroborates = by_source.get((stamp, normalized(offer.get('title', '')), normalized(offer.get('company', ''))), set())
        engines = set(corroborates)
        if exact:
            engines.add(exact)
            summary['id_exacto_' + exact] += 1
        if len(engines) > 1:
            summary['corroboracion_multiple'] += 1
        if not engines:
            summary['sin_evidencia_publica'] += 1
            continue
        rows.append({'id_publico_sha256': hashlib.sha256(offer['id'].encode()).hexdigest(),
                     'motor_por_id': exact, 'motores_que_corroboran': sorted(engines)})
    return dict(summary), rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('api_base')
    parser.add_argument('github_checkout', type=Path)
    args = parser.parse_args()
    batches = []
    for engine, folder in [('CHATGPT', 'chatgpt_ready'), ('D', 'motor_d_ready')]:
        root = args.github_checkout / 'automation' / folder
        index = json.loads((root / 'index.json').read_text())
        for entry in index['batches']:
            path = root / entry['file']
            if not path.resolve().is_relative_to(root.resolve()) or not path.is_file():
                continue
            batch = json.loads(path.read_text())
            if batch.get('approval') == 'approved_for_publication':
                batches.extend((engine, entry['batch_id'], row) for row in batch.get('offers', []))
    version, offers = public_offers(args.api_base)
    counts, rows = reconcile(offers, batches)
    print(json.dumps({'updatedAt': version, 'ofertas_verificadas': len(offers), 'entradas_en_lotes': len(batches),
                      'resumen': counts, 'evidencias': rows}, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
