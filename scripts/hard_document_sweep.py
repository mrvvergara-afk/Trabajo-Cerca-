"""Reproduce public document reads; archive evidence without publishing or providers.

The edition URLs were discovered in the publisher's current digital-edition index.
They are references for this bounded trial, not a claim of exhaustive coverage.
"""
import json
import re
from pathlib import Path

from .common import Budget, utcnow, write_json
from .document_reference_proof import prove
from .radar_v2_store import PilotStore


REFERENCES = [
    ('lumaco', 'https://www.munilumaco.cl/index.php/afiches-municipales/811-llamados-a-concurso-publico', False),
    ('malleco7-13-oct', 'https://www.malleco7.cl/edicion-martes-13-de-octubre-de-2026/', True),
    ('malleco7-08-oct', 'https://www.malleco7.cl/edicion-jueves-08-de-octubre-de-2026/', True),
    ('malleco7-06-oct', 'https://www.malleco7.cl/edicion-martes-06-de-octubre-de-2026/', True),
]
HIRING_LINE = re.compile(r'oferta\s+laboral|se\s+(?:necesita|requiere|busca)|vacantes?|envi[ae]r?\s+(?:cv|curr)|'
                         r'concurso\s+p[uú]blico|recepci[oó]n\s+de\s+(?:antecedentes|postulaciones)', re.I)


def reading_hits(store):
    hits = []
    for row in store.results():
        if row['kind'] != 'page' or row['status'] != 'done':
            continue
        value = json.loads(store.object(row['result']['archive']).read_text())
        readings = [('primary', value)] + [
            ('alternate_readings:' + str(i), item)
            for i, item in enumerate(value.get('alternate_readings', []))
        ]
        for name, reading in readings:
            lines = reading.get('text', '').splitlines()
            for position, line in enumerate(lines):
                if not HIRING_LINE.search(line):
                    continue
                hits.append({
                    'document_url': row['payload'].get('media_url'),
                    'source_url': row['payload']['source_url'],
                    'document_sha256': row['payload']['object_sha256'],
                    'page': row['payload']['page'], 'reading': name,
                    'text_object_sha256': row['result']['archive'],
                    'excerpt': '\n'.join(lines[max(0, position-1):position+4])[:700],
                    'review_required': True, 'verified': False,
                })
                if len(hits) >= 60:
                    return hits
    return hits


def main():
    output = Path('output/hard-document-sweep')
    output.mkdir(parents=True, exist_ok=False)
    outcomes = []
    for key, url, optical in REFERENCES:
        try:
            proof = prove(url, output/key, budget=Budget(360), max_work=40,
                          ocr_all_pdf_pages=optical)
            store = PilotStore(output/key/'state')
            try:
                hits = reading_hits(store)
                pending = [
                    {'kind': row['kind'], 'status': row['status'], 'reason': (row['result'] or {}).get('reason')}
                    for row in store.results() if row['status'] != 'done'
                ]
            finally:
                store.close()
            outcome = {
                'reference': key, 'url': url, 'documents': proof['documents'],
                'source_requests': proof['requests'], 'unprocessed_or_failed': pending,
                'reading_hits': hits, 'persistence_check': proof['persistence_check'],
                'paid_provider_calls': 0, 'published': 0, 'coverage_complete': False,
            }
        except Exception as exc:
            outcome = {'reference': key, 'url': url, 'error': type(exc).__name__,
                       'paid_provider_calls': 0, 'published': 0, 'coverage_complete': False}
        outcomes.append(outcome)
        # Text evidence is a review aid. A matching phrase never means an eligible job.
        print('HARD_DOCUMENT_REFERENCE ' + json.dumps(outcome, ensure_ascii=False), flush=True)
        write_json(output/'summary.json', {
            'schema': 'trabajo-cerca.hard-document-sweep.v1',
            'checked_at': utcnow().isoformat(), 'references': outcomes,
            'paid_provider_calls': 0, 'published': 0, 'production_modified': False,
        })


if __name__ == '__main__':
    main()
