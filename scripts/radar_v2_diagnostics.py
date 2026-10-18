"""Describe collection failures separately from publication and control checks."""
from collections import Counter

from .common import parse_date
from .local_source_audit import evidence_fields


def source_key(row):
    value = row['payload'].get('source') or row['payload'].get('source_key')
    return value.get('key') if isinstance(value, dict) else value


def describe(rows, config, now):
    # Latest attempt per source/document. Queue attempts are never job-ad counts.
    latest = {}
    for row in rows:
        if row['kind'] != 'evaluate' and not (row['kind'] == 'web' and
                (row.get('result') or {}).get('source_family') == 'official_control'):
            continue
        key = (source_key(row), row['payload'].get('source_url') or row['payload'].get('url'))
        stamp = row.get('completed_at') or ''
        if key not in latest or stamp > (latest[key].get('completed_at') or ''):
            latest[key] = row
    reviews, hard, controls = [], set(), set()
    for row in latest.values():
        result, payload = row.get('result') or {}, row['payload']
        stamp = parse_date(row.get('completed_at'))
        fresh = bool(stamp and stamp <= now and (now - stamp).total_seconds() <= 86400)
        url = payload.get('source_url') or payload.get('url')
        control = result.get('source_family') == 'official_control'
        if result.get('status') == 'verified' and fresh and result.get('work_commune') in config['territories']:
            (controls if control else hard).add(url)
        elif result.get('status') != 'rejected':
            fields = result.get('fields') or evidence_fields(payload.get('text', ''), result.get('source_published_at'))
            reviews.append({'task_id':row['id'], 'source_key':source_key(row), 'source_url':url,
                'reason':result.get('reason') or row['status'], 'fresh_evidence':fresh,
                'missing_fields':fields['missing'], 'review_blockers':result.get('review_blockers', []),
                'role':fields.get('role'), 'company':fields.get('company'),
                'work_communes':fields['work_communes'], 'original_date':fields.get('source_published_at'),
                'contact_present':bool(fields['emails'] or fields['phones']),
                'original_sha256':payload.get('object_sha256') or payload.get('html_object_sha256'),
                'document_review_sha256':result.get('document_review_sha256'),
                'review_notice_count':result.get('review_notice_count',0),
                'publication_confirmed':False})
    sources = []
    for source in config['sources']:
        work = [row for row in rows if source_key(row) == source['key']]
        roots = [row for row in work if row['kind'] in ('social', 'web') and
                 (row['kind'] == 'social' or not row['payload'].get('depth'))]
        last = max(roots, key=lambda row:row.get('completed_at') or '', default=None)
        value = (last or {}).get('result') or {}
        sources.append({'key':source['key'], 'territory':source.get('territory'),
            'url':source['url'], 'kind':source['kind'], 'last_finished_at':(last or {}).get('completed_at'),
            'last_capture_status':value.get('status') or (last or {}).get('status') or 'not_attempted',
            'last_task_status':(last or {}).get('status') or 'not_attempted',
            'last_failure':value.get('reason') if (last or {}).get('status') in ('retry','blocked') else None,
            'public_access':value.get('access'), 'dated_social_posts':value.get('dated_posts',0),
            'social_attachments':value.get('media_count',0),
            'documents_downloaded':sum(row['kind'] == 'media' and row['status'] == 'done' for row in work),
            'pages_read':sum(row['kind'] == 'page' and row['status'] == 'done' for row in work),
            'review_reasons':dict(Counter(item['reason'] for item in reviews if item['source_key'] == source['key'])),
            'coverage_proven':False})
    return {'eligible_hard_source_notices':len(hard), 'eligible_official_controls':len(controls),
            'metric_scope':'Latest retained evaluation per source and document URL; fresh means <=24h; not publications.',
            'source_diagnostics':sources, 'review_queue':reviews,
            'collection_operating_automatically':False,
            'social_publication_bridge_validated':False, 'difficult_source_goal_demonstrated':False}
