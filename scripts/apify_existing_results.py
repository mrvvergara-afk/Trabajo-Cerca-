"""Read existing Apify runs/datasets only. Never start an Actor."""
import json
import os
import re
import urllib.parse
import urllib.request
try:
    from .common import canonical_url, communes, output_dir, safe_error, write_json
except ImportError:
    from common import canonical_url, communes, output_dir, safe_error, write_json

JOBS = re.compile(r'oferta laboral|vacantes?|se (?:necesita|requiere|busca)|contratando|postulaciones|env[ií]a tu cv|curr[ií]culum|omil', re.I)


def run(*, output=None, token=None, actor=None, opener=urllib.request.urlopen, budget=None):
    token = os.environ.get('APIFY_TOKEN', '') if token is None else token
    actor = actor or os.environ.get('APIFY_ACTOR_ID', '').strip() or 'apify~instagram-scraper'
    report = {'configured': bool(token), 'actor': actor, 'runs_examined': 0,
              'dataset_items_examined': 0, 'candidates': [], 'errors': [],
              'new_actor_runs_started': 0, 'coverage_complete': False}

    def get(url):
        request = urllib.request.Request(url, headers={
            'Authorization': 'Bearer ' + token, 'Accept': 'application/json'})
        timeout = min(20, budget.remaining()) if budget else 20
        if timeout <= 0:
            raise TimeoutError('stage budget exhausted')
        with opener(request, timeout=timeout) as response:
            return json.load(response)

    if token:
        try:
            runs = get('https://api.apify.com/v2/acts/' + urllib.parse.quote(actor, safe='~') +
                       '/runs?limit=10&desc=1').get('data', {}).get('items', [])
            report['runs_examined'] = len(runs)
            for run_record in runs:
                if budget and budget.remaining() <= 0:
                    report['errors'].append('stage_budget_exhausted')
                    break
                if run_record.get('status') != 'SUCCEEDED' or not run_record.get('defaultDatasetId'):
                    continue
                try:
                    dataset = run_record['defaultDatasetId']
                    items = get('https://api.apify.com/v2/datasets/' + urllib.parse.quote(dataset, safe='') +
                                '/items?limit=100&clean=true')
                    if not isinstance(items, list):
                        raise ValueError('Unexpected dataset')
                    report['dataset_items_examined'] += len(items)
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        text = ' '.join(str(item.get(k) or '') for k in ('caption', 'text', 'description', 'title'))
                        if not communes(text) or not JOBS.search(text):
                            continue
                        url = item.get('url') or item.get('postUrl')
                        if not url and re.fullmatch(r'[A-Za-z0-9_-]+', str(item.get('shortCode', ''))):
                            url = 'https://www.instagram.com/p/' + item['shortCode'] + '/'
                        if not url:
                            continue
                        try:
                            url = canonical_url(url)
                        except ValueError:
                            continue
                        report['candidates'].append({
                            'url': url, 'text': text[:700], 'source': 'Instagram/Apify',
                            'commune_hint': communes(text)[0], 'state': 'pending_verification',
                            'published_at': item.get('timestamp') or item.get('publishedAt'),
                            'actor_run_id': run_record.get('id')})
                except Exception as exc:
                    report['errors'].append(safe_error(exc))
        except Exception as exc:
            report['errors'].append(safe_error(exc))
    report['candidates'] = list({item['url']: item for item in report['candidates']}.values())
    report['candidate_count'] = len(report['candidates'])
    write_json((output or output_dir()) / 'apify_existing_results.json', report)
    return report


if __name__ == '__main__':
    result = run()
    print('APIFY_EXISTING ' + json.dumps({k: v for k, v in result.items() if k != 'candidates'}, ensure_ascii=False))
