"""Bounded public downloads with publisher and robots checks before each redirect."""
import hashlib
import re
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

from .common import canonical_url
from .local_source_audit import same_publisher
from .public_source_adapters import LOCAL_PUBLISHERS

USER_AGENT = 'TrabajoCercaLocalAudit/1.0'
PUBLIC_CAPTURE_PUBLISHERS = set(LOCAL_PUBLISHERS) | {'cmpc.csod.com'}


def public_error(exc):
    code = str(exc)
    if isinstance(exc,ValueError) and re.fullmatch(
            r'(?:publisher_not_allowed|credential_query_not_allowed|robots_policy_unavailable|'
            r'public_source_robots_disallowed|source_byte_budget_exceeded|redirect_outside_publisher|'
            r'redirect_budget_exhausted|publisher_page_mismatch|primary_page_not_html|'
            r'rendered_page_budget_exceeded|public_access_challenge|(?:public_source|rendered)_http_\d{3})',code):
        return code
    return type(exc).__name__


def public_url(value):
    url = canonical_url(value)
    parts = urllib.parse.urlsplit(url)
    public_cmpc_search=(parts.hostname=='us.api.csod.com' and parts.path in ('/robots.txt','/rec-job-search/external/jobs'))
    if parts.port or not (parts.hostname.removeprefix('www.') in PUBLIC_CAPTURE_PUBLISHERS or public_cmpc_search):
        raise ValueError('publisher_not_allowed')
    if any(key.lower() in ('token','access_token','api_key','apikey','session','authorization')
           for key, _ in urllib.parse.parse_qsl(parts.query)):
        raise ValueError('credential_query_not_allowed')
    return url


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


class PublicCapture:
    def __init__(self, root, transport=None):
        self.root = Path(root)
        (self.root/'objects').mkdir(parents=True, exist_ok=True)
        self.transport = transport or self._transport
        self.robots = {}
        self.requests = []

    def put(self, raw):
        digest = hashlib.sha256(raw).hexdigest()
        path = self.root/'objects'/digest
        if not path.exists():
            path.write_bytes(raw)
        elif path.read_bytes() != raw:
            raise ValueError('capture_hash_conflict')
        return digest

    def _transport(self, url, budget, maximum):
        request = urllib.request.Request(url, headers={
            'User-Agent': USER_AGENT, 'Accept': 'text/html,application/pdf,image/png,image/jpeg,text/plain',
        })
        opener = urllib.request.build_opener(NoRedirect())
        try:
            response = opener.open(request, timeout=min(10, max(1, budget.remaining())))
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            raw = response.read(maximum+1)
            if len(raw) > maximum:
                raise ValueError('source_byte_budget_exceeded')
            return raw, response.headers.get_content_type(), response.code, response.headers.get('Location')

    def allowed(self, value, budget):
        url = public_url(value)
        parts = urllib.parse.urlsplit(url)
        origin = parts.scheme+'://'+parts.netloc
        if origin not in self.robots:
            address = original_policy = origin+'/robots.txt'
            for _ in range(4):
                raw, mime, status, location = self.transport(address, budget, 50000)
                self.requests.append({'url':address,'status':status,'mime':mime,'sha256':self.put(raw)})
                if status not in (301,302,303,307,308):
                    break
                address = public_url(urllib.parse.urljoin(address,location or ''))
                if not same_publisher(original_policy,address):
                    raise ValueError('robots_policy_unavailable')
            else:
                raise ValueError('robots_policy_unavailable')
            if status not in (200, 404):
                raise ValueError('robots_policy_unavailable')
            if status == 200 and (mime not in ('text/plain','text/html') or
                                  mime == 'text/html' and not re.search(rb'^\s*User-agent\s*:',raw,re.I|re.M)):
                raise ValueError('robots_policy_unavailable')
            parser = urllib.robotparser.RobotFileParser()
            parser.parse(raw.decode('utf-8','replace').splitlines() if status == 200 else [])
            self.robots[origin] = parser
        return self.robots[origin].can_fetch(USER_AGENT, url)

    def __call__(self, value, budget, max_bytes=900000):
        original = current = public_url(value)
        for _ in range(4):
            if not same_publisher(original, current):
                raise ValueError('redirect_outside_publisher')
            if not self.allowed(current, budget):
                raise ValueError('public_source_robots_disallowed')
            raw, mime, status, location = self.transport(current, budget, max_bytes)
            self.requests.append({'url':current,'status':status,'mime':mime,
                                  'bytes':len(raw),'sha256':self.put(raw)})
            if status in (301,302,303,307,308):
                current = public_url(urllib.parse.urljoin(current, location or ''))
                continue
            if status != 200:
                if status == 404 and urllib.parse.urlsplit(current).path == '/robots.txt':
                    raise urllib.error.HTTPError(current,404,'robots.txt not found',None,None)
                raise ValueError('public_source_http_'+str(status))
            return raw, current, mime, status
        raise ValueError('redirect_budget_exhausted')
