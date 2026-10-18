"""Explicit signed delivery of reviewed originals; no searches or paid providers.

The committed capture retains its original timestamps and OCR bytes. Re-download
the official PDF and require the exact reviewed digest before reusing that OCR.
This does not renew an expired capture or create a new editorial review.
"""
import base64
import hashlib
import json
import os
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.robotparser
from pathlib import Path

from . import durable_backup, laboratory_exchange, observe_laboratory, radar_v2_pilot
from .common import Budget, canonical_url, decode_public_html, parse_date, safe_error, utcnow, write_json
from .document_unit_bridge import prepare_reviewed_units
from .local_source_audit import discover, fetch_public
from .radar_v2_publish import history_files, matching_publication
from .radar_v2_store import MAX_PDF_BYTES, PilotStore, restore
from .state import State

REVIEW = Path('config/document-reviews/traiguen-salud-2026-10-17.json')
CAPTURE = Path('config/document-reviews/traiguen-salud-capture-2026-10-17.json')
DATA_BRANCH = 'radar-reviewed-document-state'


def restore_capture(bundle, review, destination, output, *, fetcher=fetch_public, now=None):
    now = now or utcnow()
    if (bundle.get('schema') != 'trabajo-cerca.reviewed-capture-transfer.v1'
            or bundle.get('source_url') != review['source_url']
            or bundle.get('document_url') != review['document_url']
            or bundle.get('document_sha256') != review['document_sha256']):
        raise ValueError('reviewed_capture_origin_mismatch')
    budget = Budget(90)
    source = canonical_url(review['source_url'])
    document = canonical_url(review['document_url'])
    source_parts, document_parts = urllib.parse.urlsplit(source), urllib.parse.urlsplit(document)
    if source_parts.scheme != 'https' or source_parts.netloc != document_parts.netloc:
        raise ValueError('reviewed_capture_origin_mismatch')
    robots_url = source_parts.scheme + '://' + source_parts.netloc + '/robots.txt'
    robots = urllib.robotparser.RobotFileParser()
    try:
        raw, _, _, status = fetcher(robots_url, budget, max_bytes=50000)
        if status != 200:
            raise ValueError('robots_policy_unavailable')
        robots.parse(raw.decode('utf-8', 'replace').splitlines())
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
        robots.parse([])
    if not all(robots.can_fetch('TrabajoCercaLocalAudit', url) for url in (source, document)):
        raise ValueError('public_source_robots_disallowed')
    page, final, mime, status = fetcher(source, budget, max_bytes=900000)
    if status != 200 or canonical_url(final) != source or 'html' not in mime:
        raise ValueError('publisher_revalidation_failed')
    parsed = discover(decode_public_html(page), source)
    if (parse_date(parsed.get('source_published_at')) != parse_date(bundle['source_published_at'])
            or document not in decode_public_html(page)
            or re.search(r'postulaci[oó]n\s+cerrada|concurso\s+(?:cerrado|finalizado|anulado)', parsed['text'], re.I)):
        raise ValueError('publisher_metadata_changed_requires_review')
    original, final, mime, status = fetcher(document, budget, max_bytes=MAX_PDF_BYTES)
    if (status != 200 or canonical_url(final) != document or 'pdf' not in mime
            or not original.startswith(b'%PDF-')
            or hashlib.sha256(original).hexdigest() != review['document_sha256']):
        raise ValueError('reviewed_document_changed_requires_review')
    objects = bundle['objects_base64']
    metadata = bundle['manifest']
    expected = set(metadata['objects']) - {review['document_sha256']}
    if not isinstance(objects, dict) or set(objects) != expected or len(objects) > 100:
        raise ValueError('reviewed_capture_objects_incomplete')
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        (root / 'state.gz').write_bytes(base64.b64decode(bundle['sqlite_gzip_base64'], validate=True))
        write_json(root / 'manifest.json', metadata)
        restore(root / 'state.gz', root / 'manifest.json', destination,
                lambda digest: original if digest == review['document_sha256']
                else base64.b64decode(objects[digest], validate=True))
    receipt = {'checked_at': now.isoformat(), 'source_url': source, 'document_url': document,
               'document_sha256': review['document_sha256'], 'original_document_unchanged': True,
               'publisher_html_sha256': hashlib.sha256(page).hexdigest(),
               'capture_timestamps_preserved': True, 'review_timestamp_preserved': review['reviewed_at'],
               'paid_provider_calls': 0}
    write_json(Path(output) / 'official-revalidation.json', receipt)
    return receipt


def existing_data_parent(branch):
    result = laboratory_exchange.git('ls-remote', '--heads', 'origin', branch).decode().strip()
    if not result:
        return None
    laboratory_exchange.git('fetch', 'origin', 'refs/heads/' + branch + ':refs/remotes/origin/' + branch)
    return laboratory_exchange.git('rev-parse', 'refs/remotes/origin/' + branch).decode().strip()


def main():
    context = {'repository': os.environ.get('GITHUB_REPOSITORY'),
               'repository_id': os.environ.get('RADAR_REPOSITORY_ID'), 'ref': os.environ.get('GITHUB_REF'),
               'sha': os.environ.get('GITHUB_SHA'), 'run_id': os.environ.get('GITHUB_RUN_ID')}
    if (context['repository'] != laboratory_exchange.REPOSITORY
            or context['repository_id'] != laboratory_exchange.REPOSITORY_ID
            or context['ref'] != 'refs/heads/' + laboratory_exchange.DOCUMENT_PRODUCER_BRANCH):
        raise ValueError('reviewed_document_branch_required')
    output = Path('output/reviewed-document-handoff')
    output.mkdir(parents=True, exist_ok=False)
    if CAPTURE.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('reviewed_capture_transfer_too_large')
    review, bundle = json.loads(REVIEW.read_text()), json.loads(CAPTURE.read_text())
    root = output / 'original-state'
    receipt = restore_capture(bundle, review, root, output)
    history_path = output / 'history.sqlite3'
    history_parent = existing_data_parent(laboratory_exchange.DATA_BRANCH)
    if not history_parent:
        raise ValueError('existing_publication_history_required')
    laboratory_exchange.restore_from_git(history_path)
    pilot, history = PilotStore(root), State(history_path)
    try:
        before = durable_backup.counts(history.connection)
        queue, report = prepare_reviewed_units(pilot, history, review, output)
        if queue['ready_count'] != len(review['units']) or queue['ready_count'] != 3:
            raise ValueError('complete_reviewed_batch_required')
        report.update(before_history=before, official_revalidation=receipt, history_parent=history_parent)
        pilot_parent = existing_data_parent(DATA_BRANCH)
        manifest = pilot.snapshot(output / 'capture-backup')
        report['capture_data_commit'] = radar_v2_pilot.push_snapshot(
            pilot, manifest, output / 'capture-backup', context['run_id'], pilot_parent,
            {'document-handoff.json': report}, data_branch=DATA_BRANCH)
        history.record_run(report)
        files, _ = history_files(history_path, output, context['run_id'], report)
        body = laboratory_exchange.unsigned_body(queue, context)
        envelope = laboratory_exchange.signed_envelope(body, laboratory_exchange.request_proof(body))
        files['exchange/latest.json'] = (json.dumps(envelope, separators=(',', ':')) + '\n').encode()
        parent = laboratory_exchange.publish_git_snapshot(files, context['run_id'], expected_parent=history_parent)
        report.update(exchange_data_commit=parent, signed_batch_created=True)
        write_json(output / 'delivery.json', report)
        print('REVIEWED_DOCUMENT_SENT ' + json.dumps({'run_id': context['run_id'], 'records': 3,
              'exchange_data_commit': parent, 'capture_data_commit': report['capture_data_commit']}), flush=True)
        deadline = time.monotonic() + 1200
        while time.monotonic() < deadline:
            observe_laboratory.main()
            proof = json.loads(Path('output/laboratory_observation_proof.json').read_text())
            confirmed = matching_publication(proof, context, queue['records'])
            if confirmed:
                history.record_publication_receipts(proof)
                report.update(published=3, publication_confirmed=True, published_ids=confirmed['published_ids'],
                              feed_manifest=confirmed['feed_manifest'])
                write_json(output / 'publication-confirmation.json', report)
                files, _ = history_files(history_path, output, context['run_id'], report)
                laboratory_exchange.publish_git_snapshot(files, context['run_id'], expected_parent=parent)
                print('REVIEWED_DOCUMENT_CONFIRMED ' + json.dumps(confirmed), flush=True)
                return
            print('REVIEWED_DOCUMENT_WAIT ' + json.dumps({'expected_run': context['run_id'],
                  'observed_run': (proof.get('ingestion') or {}).get('runId'),
                  'rejection': (proof.get('ingestion') or {}).get('rejection')}), flush=True)
            time.sleep(45)
        raise RuntimeError('publication_not_confirmed_in_bounded_window')
    finally:
        pilot.close()
        history.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('REVIEWED_DOCUMENT_FAILED ' + safe_error(exc), flush=True)
        raise SystemExit(1)
