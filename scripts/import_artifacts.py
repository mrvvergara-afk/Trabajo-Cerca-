"""Import downloaded historical reports locally. Never trust publication flags."""
import argparse
import json
from pathlib import Path

try:
    from .common import utcnow
    from .state import State
    from .verify_candidates import INPUT_FILES
except ImportError:
    from common import utcnow
    from state import State
    from verify_candidates import INPUT_FILES


def import_reports(directory, state_path, *, now=None):
    directory, now = Path(directory), now or utcnow()
    reports = []
    for name in INPUT_FILES:
        path = directory / name
        if path.exists():
            report = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(report.get('candidates'), list):
                raise ValueError('Historical report must contain a candidate array')
            reports.append(report)
    if not reports:
        raise ValueError('No historical collector reports found; no database initialized')
    store = State(state_path)
    try:
        added = 0
        for report in reports:
            # Source data are observations, not an authorization to publish.
            added += store.ingest(report['candidates'], now)
        return {'reports_imported': len(reports), 'new_candidates': added,
                'inventory_count': len(store.inventory()), 'published_count': 0}
    finally:
        store.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--state', type=Path, default=Path('state/radar.sqlite3'))
    args = parser.parse_args()
    print(json.dumps(import_reports(args.directory, args.state), ensure_ascii=False))
