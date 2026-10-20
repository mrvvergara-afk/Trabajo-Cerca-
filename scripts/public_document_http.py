"""Bounded public downloads with publisher and robots checks before each redirect."""
import hashlib
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from .common import canonical_url
from .local_source_audit import same_publisher
from .public_source_adapters import LOCAL_PUBLISHERS

USER_AGENT = 'TrabajoCercaLocalAudit/1.0'
PUBLIC_PORTAL_HOSTS={'cl.indeed.com','indeed.com','cl.computrabajo.com','computrabajo.cl','linkedin.com','cl.linkedin.com','es.linkedin.com','laborum.cl','opcionempleo.cl','chiletrabajos.cl','bne.gob.cl','empleospublicos.cl'}
PUBLIC_CAPTURE_PUBLISHERS = set(LOCAL_PUBLISHERS) | {'cmpc.csod.com'} | PUBLIC_PORTAL_HOSTS


def robots_allow(raw,url,agent=USER_AGENT):
    groups=[];current=None;has_rules=False
    for line in raw.splitlines():
        match=re.match(r'^\s*([a-z-]+)\s*:\s*(.*?)\s*$',line.split('#',1)[0],re.I)
        if not match:continue
        key,value=match.group(1).lower(),match.group(2)
        if key=='user-agent':
            if current is None or has_rules:
                current={'agents':[],'rules':[]};groups.append(current);has_rules=False
            current['agents'].append(value.lower())
        elif current is not None and key in ('allow','disallow'):
            has_rules=True
            if value:current['rules'].append((value,key=='allow'))
    scores=[max([-1]+[0 if value=='*' else len(value) if agent.lower().startswith(value) else -1 for value in group['agents']]) for group in groups]
    best=max([-1]+scores);parts=urllib.parse.urlsplit(url);path=parts.path+('?' +parts.query if parts.query else '')
    matches=[]
    for index,group in enumerate(groups):
        if best<0 or scores[index]!=best:continue
        for rule,allow in group['rules']:
            anchored=rule.endswith('$');value=rule[:-1] if anchored else rule
            pattern='^'+'.*'.join(re.escape(part) for part in value.split('*'))+('$' if anchored else '')
            if re.search(pattern,path):matches.append((len(rule.replace('*','').replace('$','')),allow))
    return max(matches,default=(0,True))[1]


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
            self.robots[origin] = raw.decode('utf-8','replace') if status == 200 else ''
        return robots_allow(self.robots[origin],url)

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
