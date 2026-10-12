"""Bounded public RSS backfill. Dates are source dates, never invented."""
import datetime as dt
import email.utils
import hashlib
import re
import urllib.parse
import xml.etree.ElementTree as ET
try:
    from .common import COMMUNES, bounded_int, canonical_url, communes, fetch_text, output_dir, safe_error, utcnow, write_json
except ImportError:
    from common import COMMUNES, bounded_int, canonical_url, communes, fetch_text, output_dir, safe_error, utcnow, write_json

HIRING = re.compile(r'ofertas? laborales?|vacantes?|se (?:busca|necesita|requiere)|contrataci[oó]n|postulaciones|omil', re.I)
EXCLUDE = re.compile(r'argentina|villarruel|subsidio|inversiones|victoria electoral|victoria de', re.I)


def run(*, fetcher=fetch_text, output=None, places=None, days=None, budget=None, now=None):
    now = now or utcnow()
    days = bounded_int('BACKFILL_DAYS', 60, 1, 60) if days is None else days
    items, diagnostics, seen = [], [], set()
    for source in ('GoogleNewsLocal', 'GoogleNewsPortals'):
        for place in (COMMUNES if places is None else places):
            record = {'source': source, 'commune': place, 'status': 'ok', 'scanned': 0,
                      'candidates': 0, 'error': None, 'coverage_complete': False}
            if budget and budget.remaining() <= 0:
                record.update(status='deferred', error='stage_budget_exhausted')
                diagnostics.append(record)
                continue
            terms = '("oferta laboral" OR "se necesita" OR "se busca" OR "vacantes" OR OMIL)' if source == 'GoogleNewsLocal' else '(site:chiletrabajos.cl OR site:cl.indeed.com OR site:computrabajo.cl OR site:linkedin.com/jobs OR site:laborum.cl OR site:jobsora.com)'
            url = 'https://news.google.com/rss/search?q=' + urllib.parse.quote(f'"{place}" {terms} when:{days}d') + '&hl=es-419&gl=CL&ceid=CL:es-419'
            try:
                root = ET.fromstring(fetcher(url, budget=budget))
                for item in root.findall('./channel/item'):
                    record['scanned'] += 1
                    title, link = item.findtext('title', '').strip(), item.findtext('link', '').strip()
                    if not link or not HIRING.search(title) or EXCLUDE.search(title) or place not in communes(title):
                        continue
                    try:
                        when = email.utils.parsedate_to_datetime(item.findtext('pubDate', ''))
                        when = when.replace(tzinfo=when.tzinfo or dt.timezone.utc).astimezone(dt.timezone.utc)
                    except (ValueError, TypeError, OverflowError):
                        when = None
                    if when and (when > now or now - when > dt.timedelta(days=days)):
                        continue
                    link = canonical_url(link)
                    if link in seen:
                        continue
                    seen.add(link)
                    record['candidates'] += 1
                    items.append({'id': hashlib.sha256(link.encode()).hexdigest()[:24],
                                  'source': source, 'commune_hint': place, 'title': title, 'url': link,
                                  'published_at': when.isoformat() if when else None,
                                  'discovered_at': now.isoformat(), 'state': 'pending_verification',
                                  'work_location_verified': False})
            except Exception as exc:
                record.update(status='error', error=safe_error(exc))
            diagnostics.append(record)
    report = {'generated_at': now.isoformat(), 'lookback_days': days, 'candidate_count': len(items),
              'published_count': 0, 'candidates': items, 'diagnostics': diagnostics,
              'coverage_note': 'Only indexed RSS content, not a complete 60-day historical crawl.'}
    write_json((output or output_dir()) / 'backfill.json', report)
    return report


if __name__ == '__main__':
    import json
    result = run()
    print(json.dumps({'candidates': result['candidate_count'],
                      'scanned': sum(d['scanned'] for d in result['diagnostics']),
                      'errors': sum(d['status'] == 'error' for d in result['diagnostics']),
                      'published': 0}, ensure_ascii=False))
