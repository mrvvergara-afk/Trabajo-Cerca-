"""Prepare an idempotent local ingestion payload. There is no external writer."""
import datetime as dt
import re

try:
    from .common import COMMUNES, MAX_SOURCE_AGE_DAYS, canonical_url, output_dir, parse_date, utcnow, write_json
    from .public_source_adapters import source_adapter
except ImportError:
    from common import COMMUNES, MAX_SOURCE_AGE_DAYS, canonical_url, output_dir, parse_date, utcnow, write_json
    from public_source_adapters import source_adapter


def prepare(state, *, output=None, now=None):
    now = now or utcnow()
    records, blocked, identities = [], [], set()
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
        validity = result.get('validity_method', 'explicit_deadline')
        evidence = result.get('validity_evidence') or {}
        form_checked = parse_date(evidence.get('checked_at'))
        live_form = (validity == 'live_application' and not result.get('valid_through')
                     and evidence.get('form_url') == result.get('url')
                     and evidence.get('form_action') == result.get('application')
                     and form_checked == checked and re.fullmatch('[a-f0-9]{64}',evidence.get('source_sha256','')))
        if (not published or published > now or (deadline and deadline <= now)
                or (not deadline and not live_form)):
            blocked.append({'id': item['id'], 'reason': 'source_date_or_deadline_invalid'})
            continue
        if now - published > dt.timedelta(days=MAX_SOURCE_AGE_DAYS):
            blocked.append({'id': item['id'], 'reason': 'source_older_than_45_days'})
            continue
        if (not result.get('title') or not result.get('company') or not result.get('application')
                or result.get('work_commune') not in COMMUNES or not result.get('work_location_verified')):
            blocked.append({'id': item['id'], 'reason': 'required_evidence_missing'})
            continue
        adapter = source_adapter(result.get('url'))
        identity = adapter['identityUrl'] if adapter else canonical_url(result['url'])
        if identity in identities:
            blocked.append({'id':item['id'],'reason':'same_original_offer_already_in_batch'})
            continue
        identities.add(identity)
        records.append({'idempotency_key': 'radar:' + item['id'], 'candidate_id': item['id'],
                        'source_url': canonical_url(result['url']), 'source': result['source'],
                        'title': result['title'], 'company': result['company'],
                        'work_commune': result['work_commune'],
                        'source_published_at': result['source_published_at'],
                        'valid_through': result['valid_through'], 'application': result['application'],
                        'verified_at': checked.isoformat(),
                        'verification_method': result['verification_method'],
                        **({'source_evidence':result['source_evidence']} if result.get('source_evidence') else {}),
                        **({'validity_method':validity,'validity_evidence':evidence} if live_form else {})})
    report = {'schema': 'trabajo-cerca.ingestion.v1', 'generated_at': now.isoformat(),
              'dry_run': True, 'publisher_status': 'not_connected',
              'ready_count': len(records), 'published_count': 0,
              'records': records, 'blocked': blocked}
    write_json((output or output_dir()) / 'publication_queue.json', report)
    return report
