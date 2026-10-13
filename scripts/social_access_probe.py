"""Bounded read-only diagnosis of public institutional social channels; no login."""
import json
import re
from pathlib import Path

from .common import Budget, canonical_url, decode_public_html, utcnow, write_json
from .local_source_audit import Document, fetch_public, public_social_url, source_error
from .radar import SOURCE_CONFIG

MAX_PROFILE_BYTES = 4 * 1024 * 1024


def channels(path=SOURCE_CONFIG):
    seen, rows = set(), []
    for row in json.loads(Path(path).read_text(encoding='utf-8'))['sources']:
        if row.get('family') != 'social' or row.get('identity_requires_check') or not row.get('discovered_from'): continue
        url = canonical_url(row['url'])
        if not public_social_url(url): continue
        key = re.sub(r'^https://(?:www\.|web\.|m\.)?', 'https://', url).rstrip('/')
        if key not in seen:
            seen.add(key); rows.append({'url':url,'territory':row['territory'],'discovered_from':row['discovered_from']})
    return rows


def inspect_channel(row, budget, fetcher=fetch_public):
    result = {**row, 'read_only':True,'paid_provider_calls':0,'coverage_complete':False}
    try:
        raw, final, mime, status = fetcher(row['url'], budget, max_bytes=MAX_PROFILE_BYTES)
        result.update(http_status=status, bytes=len(raw), mime=mime)
        if status != 200 or mime not in ('text/html','application/xhtml+xml'):
            return {**result,'access':'unavailable','reason':'public_page_unavailable'}
        parser = Document(); parser.feed(decode_public_html(raw))
        title = parser.title.strip()[:180]
        wall = bool(re.search(r'/login|/accounts/login',final,re.I) or
                    re.search(r'^(?:log in|iniciar sesi[oó]n|inicia sesi[oó]n|login)',title,re.I))
        refs = set()
        for href, _ in parser.links:
            # Count public post references only; a profile or its timestamp is not an individual notice.
            if re.search(r'/posts/|/permalink/|/p/|/reel/|/videos/|[?&](?:story_fbid|fbid)=',href,re.I):
                refs.add(href)
        result.update(title=title,post_references=len(refs),access='login_required' if wall else 'post_links_visible' if refs else 'no_readable_posts',
                      reason='login_wall' if wall else 'individual_notices_not_verified')
    except Exception as exc:
        result.update(access='unavailable', reason=source_error(exc))
    return result


def main():
    budget = Budget(65)
    reviewed = channels()
    facebook = [row for row in reviewed if 'facebook.com/' in row['url']]
    instagram = [row for row in reviewed if 'instagram.com/' in row['url']]
    selected = [row for i in range(max(len(facebook),len(instagram),0))
                for group in (facebook,instagram) for row in group[i:i+1]][:6]
    rows = [inspect_channel(row, budget) for row in selected if budget.remaining()>0]
    report = {'checked_at':utcnow().isoformat(),'read_only':True,'paid_provider_calls':0,
              'checked':len(rows),'coverage_complete':False,'results':rows}
    write_json(Path('output/public-sources/social-access-probe.json'),report)
    print('SOCIAL_ACCESS_PROBE '+json.dumps(report,ensure_ascii=False))


if __name__ == '__main__': main()
