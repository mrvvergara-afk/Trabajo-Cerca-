"""Explicit pilot handoff to the existing signed exchange; no direct app writer."""
import datetime as dt
import json
import os
import re
import time
from pathlib import Path

from . import durable_backup, laboratory_exchange, local_history, observe_laboratory
from . import publication_queue, radar_v2_pilot, verify_candidates
from .common import Budget, canonical_url, decode_public_html, parse_date, safe_error, utcnow, write_json
from .public_source_adapters import same_job, source_adapter
from .radar_v2_store import PilotStore
from .state import State

CHECKPOINT = 'radar_v2_signed_handoff_v1'
CONTROL = Path('config/radar-v2-publication-control.json')


def fresh_time(value, now):
    stamp = parse_date(value)
    if not stamp or stamp > now or now - stamp > dt.timedelta(hours=24):
        raise ValueError('pilot_evidence_requires_recollection')
    return stamp


def revalidate(pilot, row, rows, now):
    """Rebuild evidence from archived originals/pages, never from a verified flag."""
    payload = row['payload']
    if payload.get('contribution_requires_review'):
        raise ValueError('contribution_origin_requires_confirmation')
    completed = fresh_time(row.get('completed_at'), now)
    if row['kind'] == 'web':
        url = payload['url']
        adapter = source_adapter(url)
        if (payload.get('page_type') != 'notice' or payload['source'].get('scope') != 'publication_control'
                or not adapter or adapter['name'] != 'Bolsa Nacional de Empleo'):
            raise ValueError('unsupported_publication_control')
        captured = fresh_time(row['result'].get('captured_at'), now)
        archive = row['result']['archive']
        raw = pilot.object(archive).read_bytes()
        result = verify_candidates.evaluate({'url':url}, decode_public_html(raw), url, now=now)
        return result, min(completed, captured), archive

    if row['kind'] != 'evaluate':
        raise ValueError('unsupported_handoff_work')
    url = payload['source_url']
    adapter = source_adapter(url)
    if not adapter or adapter['family'] != 'local':
        raise ValueError('social_or_employer_publication_bridge_not_validated')
    html = payload.get('html_object_sha256') if not payload.get('object_sha256') else None
    if html:
        captures = [item for item in rows if item['kind'] == 'web' and item['status'] == 'done'
                    and item['result'].get('html_object_sha256') == html
                    and item['result'].get('source_url') == url
                    and item['result'].get('page_type') == 'notice'
                    and item['result'].get('capture_slot') == payload.get('capture_slot')]
        if not captures:
            raise ValueError('original_html_capture_missing')
        if any(radar_v2_pilot.listing_is_closed(pilot,item['payload']) for item in captures):
            raise ValueError('listing_marks_notice_closed')
        captured = min(fresh_time(item['result'].get('captured_at'), now) for item in captures)
        page = radar_v2_pilot.discover(decode_public_html(pilot.object(html).read_bytes()), url)
        result = local_history.verify_notice(page['text'], url, page['source_published_at'],
            sha256=html, complete=len(page['text']) < 14000, now=now)
        return result, min(completed, captured), html
    digest = payload.get('object_sha256')
    pilot.object(digest)
    origin = payload.get('publisher_page') or url
    media = [item for item in rows if item['kind'] == 'media' and item['status'] == 'done'
             and item['result'].get('archive') == digest and item['payload']['source_url'] == origin
             and item['payload'].get('capture_slot') == payload.get('capture_slot')]
    if not media:
        raise ValueError('original_document_download_missing')
    if any(radar_v2_pilot.listing_is_closed(pilot,item['payload']) for item in media):
        raise ValueError('listing_marks_notice_closed')
    captured = min(fresh_time(item.get('completed_at'), now) for item in media)
    pages = [item for item in rows if item['kind'] == 'page'
             and item['payload'].get('object_sha256') == digest and item['payload']['source_url'] == origin
             and item['payload'].get('capture_slot') == payload.get('capture_slot')]
    count = payload.get('original_page_count')
    if (not isinstance(count, int) or not 1 <= count <= 40 or len(pages) != count
            or any(item['status'] != 'done' for item in pages)
            or sorted(item['payload']['page'] for item in pages) != list(range(1, count + 1))):
        raise ValueError('document_pages_incomplete')
    values = [json.loads(pilot.object(item['result']['archive']).read_text())
              for item in sorted(pages, key=lambda item:item['payload']['page'])]
    text = '\n'.join(value['text'] for value in values)
    complete = len(text) <= 18000 and not any(
        value['textTruncated'] or value.get('engine') == 'tesseract-local'
        and (value.get('mean_confidence') or 0) < 70 for value in values)
    date = radar_v2_pilot.original_date(payload, now)
    result = local_history.verify_notice(text[:18000], url, date.isoformat() if date else None,
                                       sha256=digest, complete=complete, now=now)
    return result, min(completed, captured), digest


def prepare(pilot, history, output, *, now=None, territories=('Renaico', 'Negrete'), document_reviews=()):
    now = now or utcnow()
    output = Path(output)
    rows = pilot.results()
    eligible = set()
    blocked = []
    document_ids=set()
    if document_reviews:
        from .document_unit_bridge import prepare_reviewed_units
        for manifest in document_reviews:
            try:
                _, reviewed=prepare_reviewed_units(pilot,history,manifest,output,now=now)
                # Every selected unit is revalidated above, even on a replay.
                for item in history.document_inventory():
                    result=item['verification']
                    if (item['id'] in reviewed['candidate_ids'] and result['status']=='verified'
                            and result['work_commune'] in territories):document_ids.add(item['id'])
            except (ValueError,KeyError,TypeError) as exc:
                blocked.append({'source_url':manifest.get('source_url'),'reason':str(exc) if isinstance(exc,ValueError) else safe_error(exc)})
        eligible.update(document_ids)
    candidates = [row for row in rows if row['status'] == 'done' and row['kind'] in ('evaluate', 'web')
                  and (row.get('result') or {}).get('status') == 'verified']
    for row in candidates:
        try:
            result, checked, archive = revalidate(pilot, row, rows, now)
            if result['status'] != 'verified' or result.get('work_commune') not in territories:
                blocked.append({'task_id':row['id'], 'reason':result.get('reason', 'workplace_outside_pilot')})
                continue
            url = canonical_url(result['url'])
            previous = next((item for item in history.inventory() if item['url'] == url), None)
            old = (previous or {}).get('verification') or {}
            previous_check = parse_date(old.get('checked_at'))
            if previous_check and previous_check > checked:
                blocked.append({'task_id':row['id'], 'reason':'newer_history_evidence_preserved'})
                continue
            if not (old.get('source_archive_sha256') == archive and previous_check == checked):
                history.ingest([{'url':url, 'source':result['source'], 'radar_v2_task_id':row['id']}], checked)
                item = next(item for item in history.inventory() if item['url'] == url)
                history.record_result(item, {**result, 'source_archive_sha256':archive}, checked)
                previous = item
            eligible.add(previous['id'])
        except (ValueError, KeyError, TypeError) as exc:
            reason = str(exc) if isinstance(exc, ValueError) and re.fullmatch('[a-z_]+', str(exc)) else safe_error(exc)
            blocked.append({'task_id':row['id'], 'reason':reason})
    queue = publication_queue.prepare(history, output=output, now=now)
    selected=[item for item in queue['records'] if item['candidate_id'] in eligible]
    queue['records'] = sorted(selected,key=lambda item:item['candidate_id'] not in document_ids)[:3]
    queue['ready_count'] = len(queue['records'])
    report = {'schema':'trabajo-cerca.radar-v2-handoff.v1', 'checked_at':now.isoformat(),
              'pilot_verified_candidates':len(candidates), 'batch_records':len(queue['records']),
              'reviewed_document_candidates':len(document_ids),
              'source_urls':[item['source_url'] for item in queue['records']], 'blocked':blocked,
              'paid_provider_calls':0, 'published':0, 'publication_confirmed':False,
              'social_capture_proven':False, 'coverage_complete':False}
    history.checkpoint(CHECKPOINT, report, now)
    write_json(Path(output) / 'publication_queue.json', queue)
    write_json(Path(output) / 'handoff.json', report)
    return queue, report


def matching_publication(proof, context, records):
    observed = observe_laboratory.validate(proof)
    ingestion = proof.get('ingestion') or {}
    if (observed['ingestion_run_id'] != context['run_id'] or not observed['publication_confirmed']
            or observed['published'] != len(records)):
        return None
    expected = {item['candidate_id']:item['source_url'] for item in records}
    receipts = [item for item in ingestion.get('receipts', []) if item.get('publishedId')]
    if ({item.get('candidateId') for item in receipts} != set(expected)
            or any(not same_job(item.get('sourceUrl'), expected[item['candidateId']]) for item in receipts)):
        raise ValueError('publication_receipts_differ_from_handoff')
    return observed


def history_files(path, output, run_id, report):
    folder = Path(output) / 'history-backup'
    manifest = durable_backup.snapshot(path, folder)
    files = {
        'state/radar.sqlite3.gz':(folder / 'radar.sqlite3.gz').read_bytes(),
        'state/manifest.json':(folder / 'manifest.json').read_bytes(),
        'history/' + run_id + '/radar.sqlite3.gz':(folder / 'radar.sqlite3.gz').read_bytes(),
        'history/' + run_id + '/manifest.json':(folder / 'manifest.json').read_bytes(),
        'history/' + run_id + '/radar-v2-handoff.json':(json.dumps(report, ensure_ascii=False) + '\n').encode(),
        'reports/radar-v2-handoff.json':(json.dumps(report, ensure_ascii=False) + '\n').encode(),
    }
    return files, manifest


def main():
    context = {'repository':os.environ.get('GITHUB_REPOSITORY'),
               'repository_id':os.environ.get('RADAR_REPOSITORY_ID'), 'ref':os.environ.get('GITHUB_REF'),
               'sha':os.environ.get('GITHUB_SHA'), 'run_id':os.environ.get('GITHUB_RUN_ID')}
    if (context['repository'] != laboratory_exchange.REPOSITORY
            or context['repository_id'] != laboratory_exchange.REPOSITORY_ID
            or context['ref'] != 'refs/heads/' + laboratory_exchange.PRODUCER_BRANCH):
        raise ValueError('Handoff restricted to the reviewed repair branch')
    output = Path('output/radar-v2-handoff')
    output.mkdir(parents=True, exist_ok=True)
    root = Path('state/radar-v2-handoff')
    pilot_parent = radar_v2_pilot.restore_git(root)
    if not pilot_parent:
        raise ValueError('Existing pilot backup required; do not initialize silently')
    path = Path('state/radar-v2-publication.sqlite3')
    laboratory_exchange.git('fetch', 'origin', 'refs/heads/radar-state-laboratorio:refs/remotes/origin/radar-state-laboratorio')
    history_parent = laboratory_exchange.restore_from_git(path)
    pilot, history = PilotStore(root), State(path)
    before_pilot, before_history = pilot.counts(), durable_backup.counts(history.connection)
    known_ids = {row[0] for row in history.connection.execute('SELECT DISTINCT published_id FROM publication_receipts')}
    try:
        control = json.loads(CONTROL.read_text())
        captured = radar_v2_pilot.run(pilot, control, {'captures':[]}, limit=6, budget=Budget(80))
        review_files=json.loads(os.environ.get('RADAR_V2_DOCUMENT_REVIEW_FILES','[]'))
        if not isinstance(review_files,list) or len(review_files)>5:raise ValueError('Invalid reviewed document file list')
        reviews=[];review_root=Path('config/document-reviews').resolve()
        for name in review_files:
            path=Path(name).resolve()
            if not path.is_relative_to(review_root) or path.suffix!='.json' or path.stat().st_size>80000:
                raise ValueError('Document review must be a bounded reviewed configuration file')
            reviews.append(json.loads(path.read_text()))
        queue, report = prepare(pilot, history, output, territories=control['territories'],document_reviews=reviews)
        report.update(control_capture=captured, pilot_parent=pilot_parent, history_parent=history_parent,
                      before_pilot=before_pilot, before_history=before_history)
        history.record_run(report)
        pilot_manifest = pilot.snapshot(output / 'pilot-backup')
        pilot_commit = radar_v2_pilot.push_snapshot(pilot, pilot_manifest, output / 'pilot-backup',
            context['run_id'], pilot_parent, {'handoff.json':report})
        report['pilot_data_commit'] = pilot_commit
        files, manifest = history_files(path, output, context['run_id'], report)
        if queue['records']:
            body = laboratory_exchange.unsigned_body(queue, context)
            envelope = laboratory_exchange.signed_envelope(body, laboratory_exchange.request_proof(body))
            files['exchange/latest.json'] = (json.dumps(envelope, separators=(',', ':')) + '\n').encode()
        parent = laboratory_exchange.publish_git_snapshot(files, context['run_id'], expected_parent=history_parent)
        report.update(exchange_data_commit=parent, backup_counts=manifest['counts'],
                      signed_batch_created=bool(queue['records']))
        write_json(output / 'handoff.json', report)
        print('RADAR_V2_HANDOFF ' + json.dumps({key:value for key,value in report.items() if key != 'control_capture'}, ensure_ascii=False), flush=True)
        if not queue['records']:
            return
        deadline = time.monotonic() + 1080
        while time.monotonic() < deadline:
            observe_laboratory.main()
            proof = json.loads(Path('output/laboratory_observation_proof.json').read_text())
            confirmed = matching_publication(proof, context, queue['records'])
            if confirmed:
                history.record_publication_receipts(proof)
                report.update(published=confirmed['published'], publication_confirmed=True,
                              published_ids=confirmed['published_ids'],
                              known_published_ids_reused=[identity for identity in confirmed['published_ids'] if identity in known_ids],
                              feed_manifest=confirmed['feed_manifest'])
                write_json(output / 'publication-confirmation.json', report)
                files, manifest = history_files(path, output, context['run_id'], report)
                parent = laboratory_exchange.publish_git_snapshot(files, context['run_id'], expected_parent=parent)
                print('RADAR_V2_HANDOFF_CONFIRMED ' + json.dumps({'data_commit':parent, 'backup_counts':manifest['counts'],
                    'published_ids':confirmed['published_ids'], 'known_published_ids_reused':report['known_published_ids_reused'],
                    'published':confirmed['published'], 'publication_confirmed':True, 'feed_manifest':confirmed['feed_manifest'],
                    'paid_provider_calls':0}, ensure_ascii=False), flush=True)
                return
            print('RADAR_V2_HANDOFF_WAIT ' + json.dumps({'expected_run_id':context['run_id'],
                  'observed_run_id':(proof.get('ingestion') or {}).get('runId') or (proof.get('ingestion') or {}).get('run_id'),
                  'waiting_for_existing_writer':True}), flush=True)
            time.sleep(45)
        write_json(output / 'handoff.json', report)
        raise RuntimeError('The existing writer did not confirm the new handoff during the bounded window')
    finally:
        pilot.close()
        history.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('RADAR_V2_HANDOFF_FAILED ' + safe_error(exc), flush=True)
        raise SystemExit(1)
