"""Shared parsing and local output helpers. No credentials or paid services."""
import datetime as dt
import json
import os
import re
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

COMMUNES = ['Angol', 'Collipulli', 'Ercilla', 'Renaico', 'Mininco',
            'Los Sauces', 'Purén', 'Traiguén', 'Lumaco', 'Nacimiento',
            'Negrete', 'Mulchén', 'Victoria']


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(text).lower())
                   if not unicodedata.combining(c))


def communes(text):
    flat = normalized(text)
    return [p for p in COMMUNES
            if re.search(r'\b' + re.escape(normalized(p)) + r'\b', flat)]


def canonical_url(value):
    parsed = urllib.parse.urlsplit(str(value))
    if parsed.scheme.lower() not in ('http', 'https') or not parsed.hostname:
        raise ValueError('An absolute public HTTP(S) URL is required')
    if parsed.username or parsed.password:
        raise ValueError('Credentials in URLs are not allowed')
    host = parsed.hostname.lower().encode('idna').decode('ascii')
    port = parsed.port
    if port and (parsed.scheme.lower(), port) not in (('https', 443), ('http', 80)):
        host += ':' + str(port)
    path = urllib.parse.quote(parsed.path or '/', safe='/%:@!$&\'()*+,;=-._~')
    pairs = [(k, v) for k, v in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid')]
    query = urllib.parse.urlencode(sorted(pairs))
    return urllib.parse.urlunsplit((parsed.scheme.lower(), host, path, query, ''))


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def parse_date(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        result = dt.datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
        # A date-only field is a source date, not a discovery timestamp.
        if result.tzinfo is None:
            result = result.replace(tzinfo=dt.timezone.utc)
        return result.astimezone(dt.timezone.utc)
    except ValueError:
        return None


def bounded_int(name, default, minimum, maximum):
    value = int(os.environ.get(name, default))
    if not minimum <= value <= maximum:
        raise ValueError(f'{name} must be between {minimum} and {maximum}')
    return value


def output_dir():
    return Path(os.environ.get('RADAR_OUTPUT_DIR', 'output'))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                         dir=path.parent, delete=False) as handle:
            temporary = handle.name
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


def safe_error(exc):
    if isinstance(exc, urllib.error.HTTPError):
        return f'HTTP {exc.code}'
    return type(exc).__name__


class Budget:
    def __init__(self, seconds):
        self.end = time.monotonic() + seconds

    def remaining(self):
        return max(0, self.end - time.monotonic())


def fetch_text(url, *, budget=None, max_bytes=900000):
    timeout = min(12, budget.remaining()) if budget else 12
    if timeout <= 0:
        raise TimeoutError('stage budget exhausted')
    request = urllib.request.Request(canonical_url(url), headers={
        'User-Agent': 'Mozilla/5.0 (compatible; TrabajoCercaRadar/0.4)',
        'Accept': 'text/html,application/rss+xml,application/xml',
    })
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(max_bytes).decode('utf-8', 'replace')


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.href = None
        self.label = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.href = dict(attrs).get('href')
            self.label = []
        if tag == 'img' and self.href and dict(attrs).get('alt'):
            self.label.append(dict(attrs)['alt'])

    def handle_data(self, data):
        if self.href is not None:
            self.label.append(data)

    def handle_endtag(self, tag):
        if tag == 'a':
            if self.href:
                self.links.append((self.href, ' '.join(self.label).strip()))
            self.href = None
            self.label = []
