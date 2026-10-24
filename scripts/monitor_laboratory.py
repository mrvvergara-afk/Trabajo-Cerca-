"""Bounded SDK observer; preserve confirmed receipts in Git without new collections or proofs."""
import json
import os
import time
from pathlib import Path

try:
    from . import durable_backup, laboratory_exchange, observe_laboratory
    from .state import State
except ImportError:
    import durable_backup, laboratory_exchange, observe_laboratory
    from state import State


def main():
    if os.environ.get('GITHUB_REPOSITORY') != laboratory_exchange.REPOSITORY or os.environ.get('GITHUB_REF') != 'refs/heads/' + laboratory_exchange.PRODUCER_BRANCH:
        raise ValueError('Monitor is restricted to the authorized laboratory branch')
    for attempt in range(9):
        observe_laboratory.main()
        report = json.loads(Path('output/laboratory_observation.json').read_text())
        if report['publication_confirmed']:
            proof = json.loads(Path('output/laboratory_observation_proof.json').read_text())
            store = State('state/radar.sqlite3')
            try:
                count = store.record_publication_receipts(proof)
            finally:
                store.close()
            durable_backup.snapshot('state/radar.sqlite3','confirmed_snapshot')
            root = Path('confirmed_snapshot')
            run_id = os.environ['GITHUB_RUN_ID']
            files = {'state/radar.sqlite3.gz':(root/'radar.sqlite3.gz').read_bytes(),
                     'state/manifest.json':(root/'manifest.json').read_bytes(),
                     'history/' + run_id + '/radar.sqlite3.gz':(root/'radar.sqlite3.gz').read_bytes(),
                     'history/' + run_id + '/manifest.json':(root/'manifest.json').read_bytes(),
                     'reports/publication-confirmation.json':(json.dumps(report,ensure_ascii=False) + '\n').encode()}
            commit = laboratory_exchange.publish_git_snapshot(files,run_id,expected_parent=os.environ['RADAR_DATA_PARENT'])
            print('LABORATORY_CONFIRMED ' + json.dumps({'published':count,'data_commit':commit,'feed_manifest':report['feed_manifest']}))
            return
        if attempt < 8:
            # The remote runner waits; the interactive assistant remains available for updates.
            for _ in range(15):
                time.sleep(60)
    raise RuntimeError('The bounded monitoring window ended without confirmed visible IDs')


if __name__ == '__main__':
    main()
