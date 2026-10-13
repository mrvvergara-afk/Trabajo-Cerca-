"""Prepare an idempotent local ingestion payload. There is no external writer."""
import datetime as dt

try:
    from .common import COMMUNES, MAX_SOURCE_AGE_DAYS, canonical_url, output_dir, parse_date, utcnow, write_json
except ImportError:
    from common import COMMUNES, MAX_SOURCE_AGE_DAYS, canonical_url, output_dir, parse_date, utcnow, write_json


def prepare(state, *, output=None, now=None):
    now = now or utcnow()
    records, blocked = [], []
    for item in state.inventory():
        result = item.get('verification') or {}
        if item['state'] != 'verified' or result.get('status') != 'verified':
            continue
        checked = parse_date(result.get('checked_at'))
        deadline = parse_date(result.get('valid_through'))
        published = parse_date(result.get('source_published_at'))
        if not checked or checked > now or now - checked > dt.timedelta(hours=24):
            blocked.append({'id': item['id'], 'reason': 'verification_requires_recheck'})
            continue
        if not deadline or deadline <= now or not published or published > now:
            blocked.append({'id': item['id'], 'reason': 'source_date_or_deadline_invalid'})
            continue
        if now - published > dt.timedelta(days=MAX_SOURCE_AGE_DAYS):
            blocked.append({'id': item['id'], 'reason': 'source_older_than_45_days'})
            continue
        if (not result.get('title') or not result.get('company') or not result.get('application')
                or result.get('work_commune') not in COMMUNES or not result.get('work_location_verified')):
            blocked.append({'id': item['id'], 'reason': 'required_evidence_missing'})
            continue
        records.append({'idempotency_key': 'radar:' + item['id'], 'candidate_id': item['id'],
                        'source_url': canonical_url(result['url']), 'source': result['source'],
                        'title': result['title'], 'company': result['company'],
                        'work_commune': result['work_commune'],
                        'source_published_at': result['source_published_at'],
                        'valid_through': result['valid_through'], 'application': result['application'],
                        'verified_at': checked.isoformat(),
                        'verification_method': result['verification_method']})
    report = {'schema': 'trabajo-cerca.ingestion.v1', 'generated_at': now.isoformat(),
              'dry_run': True, 'publisher_status': 'not_connected',
              'ready_count': len(records), 'published_count': 0,
              'records': records, 'blocked': blocked}
    write_json((output or output_dir()) / 'publication_queue.json', report)
    return report
