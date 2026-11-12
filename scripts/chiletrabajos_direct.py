"""Motor A: direct Chiletrabajos discovery. Never auto-publish unverified jobs."""
import datetime as dt
import html
import json
import re
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

# One geographic identity per commune; sublocalities are search aliases.
PLACES = ['Angol','Collipulli','Ercilla','Renaico','Los Sauces','Purén',
          'Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria']
ALIASES = {'Collipulli':['Collipulli','Mininco'],
           'Negrete':['Negrete','Coihue','Coigüe']}


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

    def handle_data(self, data):
        if self.href is not None:
            self.label.append(data)

    def handle_endtag(self, tag):
        if tag == 'a' and self.href:
            self.links.append((self.href, ' '.join(self.label).strip()))
            self.href = None
            self.label = []


def discover(read_page=None):
    """Return all unique job URLs and every query that returned them.

    An index commune is search provenance, never verified worksite.
    """
    if read_page is None:
        def read_page(url):
            req = urllib.request.Request(url, headers={
                'User-Agent':'Mozilla/5.0 (compatible; TrabajoCerca/1.0)'})
            with urllib.request.urlopen(req, timeout=14) as response:
                if response.status != 200:
                    raise ValueError('HTTP '+str(response.status))
                return response.read(1200000).decode('utf-8','replace')

    candidates, diagnostics = {}, []
    checked_at = dt.datetime.now(dt.timezone.utc).isoformat()
    for place in PLACES:
        for term in ALIASES.get(place, [place]):
            url = ('https://www.chiletrabajos.cl/encuentra-un-empleo/?2='+
                   urllib.parse.quote(term)+'&f=2')
            record = {'source':'Chiletrabajos','commune_query':place,
                      'search_term':term,'url':url,
                      'links_seen':0,'candidates':0,'status':'ok'}
            try:
                parser = Links()
                parser.feed(read_page(url))
                for href, title in parser.links:
                    full = urllib.parse.urljoin(url,html.unescape(href)).split('#')[0]
                    parsed = urllib.parse.urlparse(full)
                    if parsed.scheme != 'https' or parsed.hostname not in (
                            'chiletrabajos.cl','www.chiletrabajos.cl'):
                        continue
                    if not re.fullmatch(r'/trabajo/[^/?#]+/?', parsed.path):
                        continue
                    record['links_seen'] += 1
                    if full in candidates:
                        old = candidates[full]
                        if place not in old['commune_queries']:
                            old['commune_queries'].append(place)
                        if term not in old['search_terms']:
                            old['search_terms'].append(term)
                        continue
                    candidates[full] = {
                        'source':'Chiletrabajos','url':full,'title_hint':title[:180],
                        'commune_query':place,'commune_queries':[place],
                        'search_terms':[term],'status':'pending_verification',
                        'work_location_verified':False,'discovered_at':checked_at}
                    record['candidates'] += 1
            except Exception as exc:
                record['status']='error'
                record['error']=str(exc)[:160]
            diagnostics.append(record)
    return {'source':'Chiletrabajos direct HTML',
            'candidate_count':len(candidates),'published_count':0,
            'candidates':list(candidates.values()),'diagnostics':diagnostics,
            'warning':'A portal search location is NOT proof of worksite.'}


def run():
    Path('output').mkdir(exist_ok=True)
    result=discover()
    Path('output/chiletrabajos_direct.json').write_text(
        json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('DIRECT_CHILETRABAJOS '+json.dumps({
        'candidates':result['candidate_count'],
        'searches':len(result['diagnostics']),
        'towns':len(PLACES),
        'errors':sum(x['status']=='error' for x in result['diagnostics'])}))


if __name__=='__main__':
    run()
