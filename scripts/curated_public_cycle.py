"""Recheck reviewed individual official offers without consuming document slots."""
import datetime as dt
import json
from pathlib import Path

from . import publication_queue, verify_candidates
from .common import Budget, canonical_url, parse_date, safe_error, utcnow, write_json
from .public_source_adapters import source_adapter, offer_identity
from .radar import SOURCE_CONFIG


def reviewed_offers(path=SOURCE_CONFIG):
    offers = {}
    for row in json.loads(Path(path).read_text(encoding='utf-8'))['sources']:
        if (row.get('family') != 'official' or row.get('identity_requires_check') or
                row.get('scope') != 'curated_real_pilot' or not row.get('identity_evidence')):
            continue
        adapter = source_adapter(row.get('url'))
        if not adapter or adapter['family'] != 'portal': continue
        identity = adapter['identityUrl']
        offers[identity] = {'url':canonical_url(identity), 'source':adapter['name'],
                            'discovered_from':row['url'], 'catalog_key':row['key']}
    return list(offers.values())


def run(store, output, *, path=SOURCE_CONFIG, checker=verify_candidates.check,
        limit=3, now=None, budget=None):
    if not 0 <= limit <= 3: raise ValueError('Curated verification limit must be between 0 and 3')
    now, output, budget = now or utcnow(), Path(output), budget or Budget(60)
    offers = reviewed_offers(path)
    store.ingest(offers, now)
    identities = {row['url'] for row in offers}
    due = []
    for row in store.inventory():
        adapter = source_adapter(row['url'])
        if not adapter or adapter['identityUrl'] not in identities: continue
        checked = parse_date(row.get('last_attempt_at'))
        wait = dt.timedelta(hours=18 if row['state'] == 'verified' else 4)
        if not checked or now - checked >= wait: due.append(row)
    due.sort(key=lambda row:(bool(row.get('last_attempt_at')),row.get('last_attempt_at') or '',row['id']))
    reviewed, checked_ids = [], set()
    for row in due[:limit]:
        if budget.remaining() < 1: break
        try: result = checker(row, now=now, budget=budget)
        except Exception as exc: result = {'status':'pending','reason':safe_error(exc)}
        store.record_result(row, result, now)
        checked_ids.add(row['id'])
        reviewed.append({'candidate_url':row['url'], **{key:result.get(key) for key in
          ('status','reason','title','company','work_commune','source_published_at','valid_through')}})
    queue = publication_queue.prepare(store, output=output, now=now)
    records = [row for row in queue['records'] if row['candidate_id'] in checked_ids]
    report = {'schema':'trabajo-cerca.curated-public-cycle.v1','checked_at':now.isoformat(),
      'catalog_offers':len(offers),'checked':len(reviewed),'reviewed':reviewed,
      'ready_count':len(records),'published':0,'publication_confirmed':False,'paid_provider_calls':0,
      'coverage_complete':False}
    write_json(output/'curated-public-cycle.json', report)
    return records, report


def merge_batch(document_queue, portal_records):
    records, identities = [], set()
    for row in [*document_queue['records'], *portal_records]:
        adapter = source_adapter(row['source_url'])
        identity = offer_identity(row['source_url'],(row.get('document_unit') or {}).get('key')) if adapter else canonical_url(row['source_url'])
        if identity not in identities:
            records.append(row); identities.add(identity)
        if len(records) == 3: break
    return {**document_queue, 'records':records,'ready_count':len(records)}
