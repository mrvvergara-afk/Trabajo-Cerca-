"""Direct Chiletrabajos source adapter. Discovery only; never publishes unverified jobs."""
import datetime as dt
import html
import json
import re
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

PLACES = ['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén','Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria']
class Links(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.href=None; self.label=[]
    def handle_starttag(self, tag, attrs):
        if tag=='a':
            self.href=dict(attrs).get('href'); self.label=[]
    def handle_data(self, data):
        if self.href is not None: self.label.append(data)
    def handle_endtag(self, tag):
        if tag=='a' and self.href:
            self.links.append((self.href,' '.join(self.label).strip()))
            self.href=None; self.label=[]

def run():
    Path('output').mkdir(exist_ok=True)
    candidates={}; diagnostics=[]
    for place in PLACES:
        url='https://www.chiletrabajos.cl/encuentra-un-empleo/?2='+urllib.parse.quote(place)+'&f=2'
        record={'source':'Chiletrabajos','commune_query':place,'url':url,'links_seen':0,'candidates':0,'status':'ok'}
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; TrabajoCerca/1.0)'})
            with urllib.request.urlopen(req,timeout=14) as resp:
                if resp.status!=200: raise ValueError('HTTP '+str(resp.status))
                page=resp.read(1200000).decode('utf-8','replace')
            parser=Links(); parser.feed(page)
            for href,title in parser.links:
                full=urllib.parse.urljoin(url,html.unescape(href)).split('#')[0]
                parsed=urllib.parse.urlparse(full)
                if parsed.hostname not in ('chiletrabajos.cl','www.chiletrabajos.cl'):continue
                if not re.search(r'/trabajo/[^/?#]+',parsed.path):continue
                record['links_seen']+=1
                if full in candidates:continue
                candidates[full]={'source':'Chiletrabajos','url':full,'title_hint':title[:180],'commune_query':place,'status':'pending_verification','work_location_verified':False,'discovered_at':dt.datetime.now(dt.timezone.utc).isoformat()}
                record['candidates']+=1
        except Exception as exc:
            record['status']='error';record['error']=str(exc)[:160]
        diagnostics.append(record)
    result={'source':'Chiletrabajos direct HTML','candidate_count':len(candidates),'published_count':0,'candidates':list(candidates.values()),'diagnostics':diagnostics,'warning':'Search city is not verified work location; each job must be opened and checked before publication.'}
    Path('output/chiletrabajos_direct.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('DIRECT_CHILETRABAJOS '+json.dumps({'candidates':len(candidates),'errors':sum(x['status']=='error' for x in diagnostics)}))
if __name__=='__main__':run()
