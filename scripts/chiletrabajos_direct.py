"""Chiletrabajos public discovery. Search communes are hints, not worksites."""
import re
import urllib.parse
try:
    from .common import COMMUNES, Links, canonical_url, fetch_text, output_dir, safe_error, utcnow, write_json
except ImportError:
    from common import COMMUNES, Links, canonical_url, fetch_text, output_dir, safe_error, utcnow, write_json


def run(*, fetcher=fetch_text, output=None, places=None, budget=None, now=None):
    now = now or utcnow()
    candidates, diagnostics = {}, []
    for place in (COMMUNES if places is None else places):
        url = 'https://www.chiletrabajos.cl/encuentra-un-empleo/?2=' + urllib.parse.quote(place) + '&f=2'
        record = {'source': 'Chiletrabajos', 'commune_query': place, 'url': url,
                  'links_seen': 0, 'candidates': 0, 'status': 'ok', 'coverage_complete': False}
        if budget and budget.remaining() <= 0:
            record.update(status='deferred', error='stage_budget_exhausted')
            diagnostics.append(record)
            continue
        try:
            parser = Links()
            parser.feed(fetcher(url, budget=budget))
            for href, title in parser.links:
                try:
                    full = canonical_url(urllib.parse.urljoin(url, href))
                except ValueError:
                    continue
                parsed = urllib.parse.urlsplit(full)
                if parsed.hostname not in ('chiletrabajos.cl', 'www.chiletrabajos.cl') or not re.fullmatch(r'/trabajo/[^/]+/?', parsed.path):
                    continue
                record['links_seen'] += 1
                if full in candidates:
                    if place not in candidates[full]['commune_queries']:
                        candidates[full]['commune_queries'].append(place)
                    continue
                candidates[full] = {'source': 'Chiletrabajos', 'url': full, 'title_hint': title[:180],
                                    'commune_query': place, 'commune_queries': [place],
                                    'state': 'pending_verification', 'work_location_verified': False,
                                    'discovered_at': now.isoformat()}
                record['candidates'] += 1
        except Exception as exc:
            record.update(status='error', error=safe_error(exc))
        diagnostics.append(record)
    report = {'source': 'Chiletrabajos direct HTML', 'candidate_count': len(candidates),
              'published_count': 0, 'candidates': list(candidates.values()),
              'diagnostics': diagnostics,
              'warning': 'Only the returned search page was examined; job pages require verification.'}
    write_json((output or output_dir()) / 'chiletrabajos_direct.json', report)
    return report


if __name__ == '__main__':
    import json
    result = run()
    print('DIRECT_CHILETRABAJOS ' + json.dumps({'candidates': result['candidate_count'],
          'errors': sum(d['status'] == 'error' for d in result['diagnostics'])}))
