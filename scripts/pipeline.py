"""Collect, checkpoint, verify and prepare local ingestion; never publish."""
import json
import os
from pathlib import Path

try:
    from . import apify_existing_results, apify_probe, apify_run_bounded, backfill, chiletrabajos_direct, local_history, publication_queue, public_portals, radar, verify_candidates
    from .common import MAX_SOURCE_AGE_DAYS, Budget, bounded_int, output_dir, safe_error, utcnow, write_json
    from .state import State
except ImportError:
    import apify_existing_results, apify_probe, apify_run_bounded, backfill, chiletrabajos_direct, local_history, publication_queue, public_portals, radar, verify_candidates
    from common import MAX_SOURCE_AGE_DAYS, Budget, bounded_int, output_dir, safe_error, utcnow, write_json
    from state import State


def run(*, output=None, state_path=None, collectors=None, checker=verify_candidates.check,
        limit=None, now=None):
    now, output = now or utcnow(), Path(output or output_dir())
    limit = bounded_int('VERIFY_LIMIT', 60, 0, 60) if limit is None else limit
    # Validate before any collector can make a request.
    if not 0 <= limit <= 60:
        raise ValueError('VERIFY_LIMIT must be between 0 and 60')
    bounded_int('BACKFILL_DAYS', MAX_SOURCE_AGE_DAYS, 1, MAX_SOURCE_AGE_DAYS)
    total_seconds = bounded_int('RADAR_BUDGET_SECONDS', 1100, 30, 1100)
    budget = Budget(total_seconds)
    state_path = state_path or Path(os.environ.get('RADAR_STATE_DIR', 'state')) / 'radar.sqlite3'
    store = State(state_path)
    summary = {'started_at': now.isoformat(), 'stages': [], 'published_count': 0,
               'publisher_status': 'not_connected', 'new_actor_runs_started': 0}
    try:
        if collectors is None:
            # Reserve 12 seconds per verification plus local persistence time.
            collection_seconds = max(1, total_seconds - limit * 12 - 20)
            collection_budget = Budget(collection_seconds)
            def stage_budget(seconds):
                return Budget(min(seconds, collection_budget.remaining()))
            collectors = [
                ('municipal_and_rss', lambda: radar.run(output=output, budget=stage_budget(120),
                                                       checkpoints=store.checkpoints(), now=now)),
                ('rss_backfill', lambda: backfill.run(output=output, budget=stage_budget(60), now=now)),
                ('public_portals', lambda: public_portals.run(output=output,budget=stage_budget(90),checkpoints=store.checkpoints(),now=now)),
                ('local_history', lambda: local_history.run(output=output,budget=stage_budget(120),checkpoints=store.checkpoints(),now=now)),
                ('chiletrabajos', lambda: chiletrabajos_direct.run(output=output, budget=stage_budget(160), now=now)),
                ('apify_connection', lambda: apify_probe.run(output=output, budget=stage_budget(30))),
                ('apify_actor_gate', lambda: apify_run_bounded.run(output=output)),
                ('apify_existing', lambda: apify_existing_results.run(output=output, budget=stage_budget(60))),
            ]
        for name, collect in collectors:
            try:
                report = collect()
                candidates = report.get('candidates', [])
                added = store.ingest(candidates, now)
                if name=='local_history' and report.get('schema')=='trabajo-cerca.local-history.v1':
                    inventory = {item['url']:item for item in store.inventory()}
                    for notice in report.get('notice_evidence',[]):
                        if notice.get('status')=='verified' and notice.get('url') in inventory:
                            store.record_result(inventory[notice['url']],notice,now)
                diagnostics = report.get('diagnostics', [])
                failures = sum(d.get('status') == 'error' for d in diagnostics)
                partial = any(d.get('status') in ('partial', 'deferred') for d in diagnostics)
                if report.get('errors'):
                    failures += len(report['errors'])
                if diagnostics and failures == len(diagnostics):
                    status = 'error'
                else:
                    status = 'partial' if failures or partial else 'ok'
                if name == 'apify_existing' and not report.get('configured'):
                    status = 'disabled'
                if name == 'apify_connection':
                    status = 'ok' if report.get('authenticated') and report.get('actor_accessible') else 'error' if report.get('configured') else 'disabled'
                summary['stages'].append({'stage': name, 'status': status,
                                           'candidates': len(candidates), 'new': added, 'errors': failures})
                for source, checkpoint in report.get('checkpoints', {}).items():
                    store.checkpoint(source, checkpoint, now)
            except Exception as exc:
                summary['stages'].append({'stage': name, 'status': 'error', 'reason': safe_error(exc)})
        verification = verify_candidates.run(state=store, output=output, limit=limit,
                                              checker=checker, budget=budget, now=now)
        summary['verification'] = {k: v for k, v in verification.items() if k != 'results'}
        queue = publication_queue.prepare(store, output=output, now=now)
        summary['ready_for_ingestion'] = queue['ready_count']
        summary['inventory_count'] = len(store.inventory())
        summary['status'] = 'partial' if verification['errors'] or any(
            s['status'] in ('partial', 'error') for s in summary['stages']) else 'ok'
        # No successful source and all active sources failed is a workflow failure.
        active = [s for s in summary['stages'] if s['status'] != 'disabled' and s['stage'] != 'apify_actor_gate']
        summary['exit_code'] = 1 if active and all(s['status'] == 'error' for s in active) else 0
        if verification['errors'] and verification['errors'] == verification['checked']:
            summary['exit_code'] = 1
        write_json(output / 'candidate_inventory.json', {'candidates': store.inventory()})
        store.record_run(summary, now)
        write_json(output / 'pipeline_summary.json', summary)
        return summary
    finally:
        store.close()


if __name__ == '__main__':
    result = run()
    print('RADAR_PIPELINE ' + json.dumps(result, ensure_ascii=False))
    if result['status'] == 'partial':
        print('::warning::Radar partial; consult pipeline_summary.json. Published: 0; AppDeploy ingestion absent.')
    raise SystemExit(result['exit_code'])
