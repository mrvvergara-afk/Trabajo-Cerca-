#!/usr/bin/env python3
"""Trabajo Cerca · radar gratuito 3 turnos diarios · solo lectura.
No publica ofertas, no escribe en AppDeploy y no realiza scraping de FB/IG.
"""
from __future__ import annotations
import argparse
import collections
import datetime as dt
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from trabajo_cerca_lector_documental import read_one
from descubrir_ofertas_municipales import discover

FEED = 'https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro/api/listings'
UA = 'TrabajoCercaDailyRadar/1.0 (public, read-only)'
LOCAL_TIMEZONE = ZoneInfo('America/Santiago')
REVIEW_STATES = frozenset({'candidato_para_revision', 'candidato_fecha_pendiente',
                           'documento_parcial_revision_obligatoria'})
EXCLUSION_STATES = frozenset({'plazo_vencido_no_publicar',
                              'documento_antiguo_no_publicar', 'fecha_original_futura_no_publicar'})


def canonical(url: str) -> str:
    try:
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname:
            return ''
        if parsed.username or parsed.password or parsed.port is not None:
            return ''
        host = parsed.hostname.lower().removeprefix('www.')
        path = parsed.path.rstrip('/') or '/'
        params = [(key, value) for key, value in parse_qsl(parsed.query)
                  if key.lower() in ('p', 'id', 'page_id', 'job_id', 'vacancy_id') and len(value) <= 64]
        return 'https://' + host + path + ('?' + urlencode(sorted(params)) if params else '')
    except (ValueError, TypeError):
        return ''


def read_feed(max_pages=12):
    """If feed paging fails, refuse to assert a candidate is absent from the catalog."""
    records = []
    cursor = None
    visited = set()
    for page_number in range(max_pages):
        params = {'fresh': '1'}
        if cursor:
            params['cursor'] = cursor
        url = FEED + '?' + urlencode(params)
        obj = None
        for trial in range(3):
            try:
                with urlopen(Request(url, headers={'Accept': 'application/json',
                                                   'User-Agent': UA}), timeout=12) as response:
                    if response.headers.get_content_type() != 'application/json':
                        return set(), False, len(records), 'feed_not_json'
                    obj = json.loads(response.read(900_000).decode('utf-8'))
                    break
            except HTTPError as error:
                if error.code not in (429, 502, 503, 504) or trial == 2:
                    return set(), False, len(records), 'feed_http_' + str(error.code)
            except (URLError, TimeoutError, OSError, ValueError) as error:
                if trial == 2:
                    return set(), False, len(records), 'feed_' + type(error).__name__
            time.sleep(2)
        if not isinstance(obj, dict) or not isinstance(obj.get('items'), list):
            return set(), False, len(records), 'feed_invalid'
        records += [row for row in obj['items'] if isinstance(row, dict)]
        nxt = obj.get('nextCursor')
        if not nxt:
            keys = set()
            for row in records:
                for field in ('url', 'sourceUrl', 'originalPosterUrl', 'applyUrl', 'applicationUrl'):
                    if isinstance(row.get(field), str):
                        normalized = canonical(row[field])
                        if normalized:
                            keys.add(normalized)
            return keys, True, len(records), None
        if nxt in visited:
            return set(), False, len(records), 'feed_cursor_loop'
        visited.add(nxt)
        cursor = nxt
    return set(), False, len(records), 'feed_page_limit'


def batch_for_time(now=None):
    now = now or dt.datetime.now(LOCAL_TIMEZONE)
    return 0 if now.hour < 10 else (1 if now.hour < 16 else 2)


def strip_result(row: dict) -> dict:
    """Public report: never publish unvalidated OCR preview, email, phone or PII."""
    return {key: row.get(key) for key in
            ('url', 'source', 'kind', 'decision', 'extractor',
             'deadline', 'publication_date_evidence', 'source_date_evidence',
             'original_classification', 'http', 'error', 'failure_reason')
            if key in row}


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default=str(Path(__file__).with_name('fuentes_diarias.json')))
    parser.add_argument('--batch', default='auto', choices=('auto', '0', '1', '2'))
    parser.add_argument('--output', default='salidas_radar')
    parser.add_argument('--max-items', type=int, default=30)
    args = parser.parse_args(argv)
    if not 1 <= args.max_items <= 35:
        parser.error('max-items permitido: 1 a 35')
    config = json.loads(Path(args.config).read_text(encoding='utf8'))
    if len(config.get('territories', [])) != 14 or len(config.get('seed_urls', [])) != 40 or len(config.get('social_reference', [])) != 25:
        raise ValueError('Inventario territorial incompleto')
    batch = batch_for_time() if args.batch == 'auto' else int(args.batch)
    sources = [(record, 'semilla') for record in config['seed_urls']]
    sources += [(record, 'fuente_web') for record in config['discovery']]
    selected = [(record, mode) for index, (record, mode) in enumerate(sources)
                if index % 3 == batch][:args.max_items]
    feed_links, feed_complete, feed_count, feed_error = read_feed()
    status = []
    candidates = {}
    visited = set()
    counts = collections.Counter()
    local_counts = collections.Counter()
    today = dt.datetime.now(LOCAL_TIMEZONE).date()

    def accept(row: dict, source_id: str, origin: str, territories):
        if not isinstance(row, dict):
            return
        item = strip_result(row)
        url = canonical(str(item.get('url') or ''))
        if not url or url in visited:
            return
        visited.add(url)
        decision = item.get('decision') or 'sin_clasificar'
        if decision in EXCLUSION_STATES:
            state = 'descartado_por_fecha'
        elif feed_complete and url in feed_links:
            state = 'duplicado_confirmado_url'
        elif decision in REVIEW_STATES:
            state = 'revision_obligatoria' if feed_complete else 'revision_y_catalogo_no_disponible'
        else:
            state = 'sin_evidencia_suficiente'
        record = {
            'candidate_key': hashlib.sha256(url.encode()).hexdigest()[:22],
            'url': url, 'source_id': source_id, 'origin': origin,
            'reported_territories': list(territories),
            'status': state, 'reader_status': decision,
            'published_date_evidence': item.get('publication_date_evidence'),
            'deadline_evidence': item.get('deadline'),
            'work_location_verified': False,
            'original_employer_date_verified': False,
            'approved': False,
            'published': False,
        }
        counts[state] += 1
        for place in record['reported_territories']:
            local_counts[str(place)] += 1
        status.append(record)
        if state.startswith('revision'):
            candidates[url] = record

    for source, mode in selected:
        url = source['url']
        source_id = source['id']
        places = source.get('work_cities') or [source.get('territory', 'Sin comuna')]
        if mode == 'semilla' and feed_complete and canonical(url) in feed_links:
            status.append({'source_id': source_id, 'url': canonical(url),
                           'status': 'duplicado_confirmado_url'})
            counts['duplicado_confirmado_url'] += 1
            continue
        try:
            if mode == 'semilla':
                record = read_one({'url': url, 'source': source_id,
                                   'kind': 'local_page', 'publisher_page': url}, today)
                accept(record, source_id, 'semilla_2026_10_25', places)
            else:
                # Bounded lookup: index plus no more than two individual article links.
                data = discover({'url': url, 'source': source_id}, max_links=2)
                if data.get('status') != 'index_read':
                    counts['fuente_'+str(data.get('status'))] += 1
                    status.append({'source_id': source_id, 'url': canonical(url),
                                   'status': str(data.get('status')), 'checked_links': 0})
                for record in data.get('checked', [])[:4]:
                    accept(record, source_id, 'fuente_web_publica', places)
        except Exception as exc:
            status.append({'source_id': source_id, 'url': canonical(url),
                           'status': 'error_lector', 'error_type': type(exc).__name__})
            counts['error_lector'] += 1

    report = {
        'schema': 'trabajo-cerca.daily-radar-report.v1',
        'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'local_date': today.isoformat(),
        'batch': batch, 'source_records_checked': len(selected),
        'territories_configured': len(config['territories']),
        'seed_urls_configured': len(config['seed_urls']),
        'web_sources_configured': len(config['discovery']),
        'social_profiles_inventoried': len(config['social_reference']),
        'social_profiles_scraped': 0,
        'social_source_status': 'requiere_acceso_publico_autorizado_o_aporte',
        'feed_rows_read': feed_count, 'feed_complete': feed_complete,
        'feed_error': feed_error,
        'candidates_to_review': len(candidates),
        'published_by_this_job': 0,
        'paid_api_calls': 0,
        'writes_to_app': 0,
        'counts_by_status': dict(counts),
        'observations_by_reported_territory': dict(local_counts),
        'limits': 'Máximo 2 vínculos individuales por índice; sin lectura de redes privadas',
    }
    folder = Path(args.output)
    folder.mkdir(parents=True, exist_ok=True)
    (folder/'resumen.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    (folder/'fuentes_auditadas.json').write_text(json.dumps(status, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    (folder/'candidatos_revision.json').write_text(json.dumps(list(candidates.values()), ensure_ascii=False, indent=2)+'\n', encoding='utf8')
    note = (f"## Trabajo Cerca · radar diario · lote {batch}\n\n"
            f"- Localidades: **{len(config['territories'])}**; fuentes web: **{len(config['discovery'])}**; referencias de avisos: **40**.\n"
            f"- Fuentes de este lote: **{len(selected)}**; catálogo público: **{feed_count}** registros, lectura completa: **{feed_complete}**.\n"
            f"- Candidatos nuevos o pendientes de comprobar: **{len(candidates)}** (NO publicados).\n"
            f"- Estado por fuente: **{dict(counts)}**.\n"
            f"- Facebook/Instagram: **25 fuentes registradas**, sin extracción no autorizada.\n"
            f"- Costo de proveedores externos: **$0**. Escrituras: **0**.\n")
    (folder/'resumen.md').write_text(note, encoding='utf8')
    print(note)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
