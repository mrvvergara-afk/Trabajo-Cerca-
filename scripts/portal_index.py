"""Discover individual jobs independently of recruiting words in card titles."""
import json
import urllib.parse
from .common import canonical_url
from .local_source_audit import Document, same_publisher
from .public_source_adapters import source_adapter


def portal_index_links(raw, origin, limit=200):
    if not 1 <= limit <= 200:
        raise ValueError('portal_index_limit_out_of_range')
    parser = Document()
    parser.feed(raw)
    found = {}
    def add(value, title=''):
        try:
            url = canonical_url(urllib.parse.urljoin(origin, value))
            adapter = source_adapter(url)
            if adapter and adapter['family'] in ('portal', 'aggregator') and same_publisher(origin, url):
                found.setdefault(adapter['identityUrl'], {'url': url, 'title_hint': title[:300],
                    'source': adapter['name'], 'source_identity': adapter['identityUrl'],
                    'work_location_verified': False, 'state': 'pending_verification'})
        except (ValueError, TypeError):
            pass
    for href, title in parser.links:
        add(href, title)
    for schema in parser.schemas:
        try:
            stack = [json.loads(schema)]
        except (ValueError, TypeError):
            continue
        visited = 0
        while stack and visited < 2000:
            node = stack.pop(); visited += 1
            if isinstance(node, list):
                stack.extend(node)
            elif isinstance(node, dict):
                if isinstance(node.get('url'), str):
                    add(node['url'], str(node.get('title') or node.get('name') or ''))
                stack.extend(value for value in node.values() if isinstance(value, (dict, list)))
    return {'links': list(found.values())[:limit], 'individual_links_found': len(found),
            'returned_links': min(limit, len(found)), 'truncated': len(found) > limit,
            'coverage_complete': False, 'published': 0}
