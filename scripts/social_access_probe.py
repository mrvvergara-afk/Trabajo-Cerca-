"""Read-only public access diagnosis of the exact user-identified accounts.

Check robots before content, never follow authentication/challenges, and keep
original responses in the existing durable evidence branch. This is not a post
collector and cannot certify a recent timeline or publish a vacancy.
"""
import json
import os
import re
import urllib.parse
from pathlib import Path

from .common import Budget, canonical_url, decode_public_html, utcnow, write_json
from .local_source_audit import Document, public_social_url
from .public_document_http import PublicCapture, public_error

MAX_PROFILE_BYTES = 4 * 1024 * 1024
SOURCE_CONFIG = Path('config/user-omil-pages-2026-10-20.json')


def channels(path=SOURCE_CONFIG):
    seen, rows = set(), []
    for row in json.loads(Path(path).read_text(encoding='utf-8'))['sources']:
        if row.get('identity_requires_check') or not (
                row.get('identified_from') == 'user_supplied_screenshot' or row.get('discovered_from')):
            continue
        url = canonical_url(row['url'])
        if not public_social_url(url):
            continue
        key = re.sub(r'^https://www\.', 'https://', url).rstrip('/')
        if key not in seen:
            seen.add(key)
            rows.append({key: value for key, value in {
                'url': url, 'territory': row['territory'],
                'identified_from': row.get('identified_from'),
                'discovered_from': row.get('discovered_from'),
            }.items() if value})
    return rows


def profile_validator(rows):
    approved = {(urllib.parse.urlsplit(row['url']).hostname.removeprefix('www.'),
                 urllib.parse.urlsplit(row['url']).path.rstrip('/')) for row in rows}
    hosts = {host for host, _ in approved}

    def validate(value):
        url = canonical_url(value)
        parts = urllib.parse.urlsplit(url)
        if parts.scheme != 'https' or parts.port:
            raise ValueError('public_social_url_not_approved')
        host = parts.hostname.removeprefix('www.')
        if host not in hosts:
            raise ValueError('public_social_url_not_approved')
        if re.search(r'^/(?:accounts|login|checkpoint)(?:/|$)', parts.path, re.I):
            raise ValueError('public_access_login_required')
        if re.search(r'^/(?:challenge|captcha)(?:/|$)', parts.path, re.I):
            raise ValueError('public_access_challenge')
        if parts.query:
            raise ValueError('public_social_url_not_approved')
        if parts.path != '/robots.txt' and (host, parts.path.rstrip('/')) not in approved:
            raise ValueError('public_social_url_not_approved')
        return url
    return validate


def access_error(exc):
    value = str(exc)
    if isinstance(exc, ValueError) and value in (
            'public_access_login_required', 'public_social_url_not_approved'):
        return value
    return public_error(exc)


def inspect_channel(row, budget, fetcher):
    result = {**row, 'read_only': True, 'paid_provider_calls': 0,
              'coverage_complete': False, 'posts_read': 0, 'published': 0}
    try:
        raw, final, mime, status = fetcher(row['url'], budget, max_bytes=MAX_PROFILE_BYTES)
        result.update(http_status=status, bytes=len(raw), mime=mime)
        if status != 200 or mime not in ('text/html', 'application/xhtml+xml'):
            return {**result, 'access': 'unavailable', 'reason': 'public_page_unavailable'}
        parser = Document()
        parser.feed(decode_public_html(raw))
        title = parser.title.strip()[:180]
        wall = bool(re.search(r'/login|/accounts/login', final, re.I) or re.search(
            r'^(?:log in|iniciar sesi[oó]n|inicia sesi[oó]n|login)', title, re.I))
        challenge = bool(re.search(r'checkpoint|captcha|verify you are human|just a moment', title, re.I))
        refs = set()
        for href, _ in parser.links:
            try:
                target = canonical_url(urllib.parse.urljoin(final, href))
                if (urllib.parse.urlsplit(target).hostname == urllib.parse.urlsplit(final).hostname and
                        public_social_url(target) and re.search(
                            r'/posts/|/permalink/|/p/|/reel/|/videos/|[?&](?:story_fbid|fbid)=', target, re.I)):
                    refs.add(target)
            except ValueError:
                pass
        result.update(title=title, post_references=len(refs), post_urls=sorted(refs),
                      access='login_required' if wall else 'challenge' if challenge else
                      'post_links_visible' if refs else 'no_readable_posts',
                      reason='login_wall' if wall else 'public_access_challenge' if challenge else
                      'individual_notices_not_verified')
    except Exception as exc:
        reason = access_error(exc)
        access = {'public_source_robots_disallowed': 'blocked_by_robots',
                  'robots_policy_unavailable': 'policy_unavailable',
                  'public_access_login_required': 'login_required',
                  'public_access_challenge': 'challenge',
                  'public_source_http_429': 'rate_limited'}.get(reason, 'unavailable')
        result.update(access=access, reason=reason)
    return result


def probe_channels(rows, capture, budget):
    results, failed_policies = [], {}
    for row in rows:
        origin = urllib.parse.urlsplit(row['url']).netloc
        if origin in failed_policies:
            results.append({**row, 'access': 'policy_unavailable',
                            'reason': 'robots_policy_unavailable',
                            'shared_origin_failure_from': failed_policies[origin],
                            'read_only': True, 'paid_provider_calls': 0,
                            'coverage_complete': False, 'posts_read': 0, 'published': 0})
            continue
        if budget.remaining() <= 0:
            results.append({**row, 'access': 'not_checked', 'reason': 'run_budget_exhausted',
                            'coverage_complete': False, 'posts_read': 0, 'published': 0})
            continue
        result = inspect_channel(row, budget, capture)
        results.append(result)
        if result['reason'] == 'robots_policy_unavailable':
            failed_policies[origin] = row['url']
    return results


def main():
    if (os.environ.get('GITHUB_REF') != 'refs/heads/repair/mulchen-captura-2026-10-17' or
            os.environ.get('GITHUB_REPOSITORY') != 'mrvvergara-afk/Trabajo-Cerca-'):
        raise ValueError('authorized_repair_branch_required')
    from .document_queue_reader import publish_evidence, restore_checkpoint
    selected = channels()[:6]
    output = Path('output/social-access')
    capture = PublicCapture(output, url_validator=profile_validator(selected))
    rows = probe_channels(selected, capture, Budget(65))
    report = {'schema': 'trabajo-cerca.public-social-access.v2',
              'checked_at': utcnow().isoformat(), 'read_only': True, 'paid_provider_calls': 0,
              'checked': sum(row['access'] != 'not_checked' for row in rows),
              'published': 0, 'new_offers_confirmed': 0,
              'coverage_complete': False, 'results': rows, 'requests': capture.requests,
              'automatic_retries': 0, 'credentials_used': False}
    write_json(output/'social-access-probe.json', report)
    parent, checkpoint = restore_checkpoint()
    commit = publish_evidence(output, checkpoint, parent,
                              os.environ['GITHUB_RUN_ID']+'-'+os.environ.get('GITHUB_RUN_ATTEMPT', '1'))
    print('SOCIAL_ACCESS_PROBE '+json.dumps({**report, 'data_commit': commit}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
