"""Actor execution remains blocked, including when the flag is true."""
import json
import os
try:
    from .common import output_dir, write_json
except ImportError:
    from common import output_dir, write_json


def run(*, output=None):
    enabled = os.getenv('APIFY_RUN_ENABLED', 'false').lower() == 'true'
    result = {'enabled': enabled, 'actor_runs_started': 0,
              'status': 'blocked_no_usage' if enabled else 'disabled_no_usage'}
    if enabled:
        result['blocked'] = 'Actor input, local sources, usage cap and explicit spend authorization require configuration'
    write_json((output or output_dir()) / 'apify_run_status.json', result)
    return result


if __name__ == '__main__':
    print('APIFY_RUN ' + json.dumps(run()))
