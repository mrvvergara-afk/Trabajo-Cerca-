"""Read-only authentication and configured Actor metadata check."""
import json
import os
import urllib.parse
import urllib.request
try:
    from .common import output_dir, safe_error, write_json
except ImportError:
    from common import output_dir, safe_error, write_json


def run(*, output=None, token=None, actor=None, opener=urllib.request.urlopen, budget=None):
    token = os.environ.get('APIFY_TOKEN', '') if token is None else token
    actor = actor or os.environ.get('APIFY_ACTOR_ID', '').strip() or 'apify~instagram-scraper'
    report = {'configured': bool(token), 'actor': actor,
              'authenticated': False, 'actor_accessible': False}
    if token:
        try:
            request = urllib.request.Request('https://api.apify.com/v2/users/me',
                                             headers={'Authorization': 'Bearer ' + token})
            timeout = min(15, budget.remaining()) if budget else 15
            if timeout <= 0:
                raise TimeoutError('stage budget exhausted')
            with opener(request, timeout=timeout) as response:
                report['authenticated'] = response.status == 200
                report['auth_http'] = response.status
            request = urllib.request.Request('https://api.apify.com/v2/acts/' + urllib.parse.quote(actor, safe='~'),
                                             headers={'Authorization': 'Bearer ' + token})
            timeout = min(15, budget.remaining()) if budget else 15
            if timeout <= 0:
                raise TimeoutError('stage budget exhausted')
            with opener(request, timeout=timeout) as response:
                data = json.load(response)
                report['actor_accessible'] = response.status == 200
                report['actor_name'] = data.get('data', {}).get('name', '')
        except Exception as exc:
            report['error'] = safe_error(exc)
    else:
        report['error'] = 'APIFY_TOKEN not configured'
    write_json((output or output_dir()) / 'apify_connection.json', report)
    return report


if __name__ == '__main__':
    print('APIFY_CONNECTION ' + json.dumps(run()))
