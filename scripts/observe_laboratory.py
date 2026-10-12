"""Read-only browser check through the supported AppDeploy frontend SDK, with no provider actions."""
import json
import os
import shutil
import subprocess
import tempfile
from html.parser import HTMLParser
from pathlib import Path

URL = 'https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/?radar-proof=1#operacion'


class ProofElement(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.capture = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == 'pre' and dict(attrs).get('id') == 'radar-live-check':
            self.capture = True

    def handle_endtag(self, tag):
        if tag == 'pre':
            self.capture = False

    def handle_data(self, data):
        if self.capture:
            self.parts.append(data)


def validate(proof):
    ingestion, feed = proof.get('ingestion'), proof.get('feed')
    if not isinstance(ingestion, dict) or not isinstance(feed, dict):
        raise ValueError('Operator read unavailable; do not infer a publication count')
    published = ingestion.get('published')
    if not isinstance(published, int) or not 0 <= published <= 3:
        raise ValueError('Invalid observed publication count')
    ids = [row.get('publishedId') for row in ingestion.get('receipts', []) if row.get('publishedId')]
    if published:
        if not feed.get('complete') or feed.get('manifestId') != ingestion.get('feedManifestId'):
            raise ValueError('Publication receipt and complete feed do not refer to the same snapshot')
        if proof.get('feedReadError') or len(set(ids)) != published or not set(ids).issubset(proof.get('visibleIds', [])):
            raise ValueError('Published IDs are not confirmed in the visible feed')
    return {'stored':ingestion.get('stored'), 'published':published, 'published_ids':ids,
            'feed_complete':feed.get('complete'), 'feed_manifest':feed.get('manifestId'),
            'source_phase':feed.get('buildSource'), 'staged_pages':feed.get('stagedPages'),
            'read_only':True, 'provider_calls':0, 'publication_confirmed':bool(published),
            'status':'published_ids_confirmed' if published else 'waiting_for_publication'}


def main():
    browser = shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not browser:
        raise RuntimeError('The runner has no browser; no fallback transport is invented')
    with tempfile.TemporaryDirectory() as directory:
        child_env = dict(os.environ)
        child_env.pop('ACTIONS_ID_TOKEN_REQUEST_TOKEN', None)
        child_env.pop('GITHUB_TOKEN', None)
        result = subprocess.run([browser, '--headless', '--disable-gpu', '--no-first-run',
          '--disable-background-networking', '--user-data-dir=' + directory,
          '--virtual-time-budget=20000', '--dump-dom', URL], capture_output=True, text=True,
          timeout=90, env=child_env, check=True)
    parser = ProofElement()
    parser.feed(result.stdout)
    if not parser.parts:
        raise RuntimeError('The SDK operator view did not return a readable result')
    proof = json.loads(''.join(parser.parts))
    report = validate(proof)
    Path('output').mkdir(exist_ok=True)
    Path('output/laboratory_observation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2) + '\n')
    print('LABORATORY_READ ' + json.dumps(report,ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('LABORATORY_READ_UNAVAILABLE ' + type(exc).__name__)
        raise SystemExit(1)
