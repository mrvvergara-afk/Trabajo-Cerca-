"""Verify the actual cron's document receipts through the read-only frontend SDK."""
import datetime as dt
import json
import time
from pathlib import Path

from . import observe_laboratory
from .common import parse_date, safe_error, utcnow, write_json

EXPECTED_IDS = {
    'de9067f5-59f2-4e0c-ba02-fc9584debe0f',
    '8b75b282-d838-45bc-9309-d10874aae023',
    '3c875b30-eec8-4d2a-9410-797e9ad37c07',
}


def validate(proof, *, now=None):
    now = now or utcnow()
    status = proof.get('documentRevalidation')
    if (not isinstance(status, dict) or status.get('schema') != 'trabajo-cerca.document-revalidation-status.v1'
            or status.get('readOnly') is not True or status.get('providerCalls') != 0):
        raise ValueError('document_revalidation_read_unavailable')
    document = next((item for item in status.get('documents', []) if item.get('key') == 'traiguen-salud-2026-10'), None)
    if not document or set(document.get('publishedIds', [])) != EXPECTED_IDS:
        raise ValueError('document_publication_identity_changed')
    if document.get('status') in ('pending', 'source_unavailable') or document.get('registrationPending'):
        return None
    if document.get('status') != 'revalidated':
        raise ValueError('document_revalidation_requires_attention:' + str(document.get('reason')))
    checked = parse_date(document.get('lastSuccessAt'))
    if not checked or checked > now or now - checked > dt.timedelta(hours=24):
        raise ValueError('document_revalidation_not_fresh')
    if parse_date(document.get('originalPublishedAt')) != parse_date('2026-10-01T12:04:54+00:00'):
        raise ValueError('original_publication_date_changed')
    feed = proof.get('feed') or {}
    if not feed.get('complete') or proof.get('feedReadError'):
        return None
    visible = set(document.get('visibleIds', [])) if status.get('feedManifestId') == feed.get('manifestId') \
        else set(proof.get('visibleIds', []))
    if not EXPECTED_IDS <= visible:
        return None
    return {'schema': 'trabajo-cerca.actual-document-revalidation-proof.v1',
            'checked_at': now.isoformat(), 'revalidated_at': checked.isoformat(),
            'next_check_at': document.get('nextCheckAt'), 'original_published_at': document['originalPublishedAt'],
            'published_ids': sorted(EXPECTED_IDS), 'feed_manifest': feed['manifestId'],
            'visible_count': 3, 'new_offers': 0, 'provider_calls': 0,
            'read_only': True, 'actual_cron_revalidation_confirmed': True,
            'social_capture_proven': False}


def main():
    deadline = time.monotonic() + 1100
    output = Path('output/document-revalidation')
    output.mkdir(parents=True, exist_ok=True)
    while time.monotonic() < deadline:
        observe_laboratory.main()
        proof = json.loads(Path('output/laboratory_observation_proof.json').read_text())
        result = validate(proof)
        if result:
            write_json(output / 'confirmed.json', result)
            write_json(output / 'operator-proof.json', proof)
            print('DOCUMENT_REVALIDATION_CONFIRMED ' + json.dumps(result), flush=True)
            return
        state = proof.get('documentRevalidation') or {}
        write_json(output / 'last-observation.json', proof)
        print('DOCUMENT_REVALIDATION_WAIT ' + json.dumps({'documents': state.get('documents'),
              'read_error': proof.get('documentRevalidationError')}), flush=True)
        time.sleep(45)
    raise RuntimeError('document_revalidation_not_confirmed_in_bounded_window')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('DOCUMENT_REVALIDATION_FAILED ' + safe_error(exc), flush=True)
        raise SystemExit(1)
