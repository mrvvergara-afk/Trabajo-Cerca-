"""Compare the actual public homepage with all SDK feed pages, without collection or publication."""
import json
import asyncio
import os
import shutil
import subprocess
import tempfile
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

from .common import utcnow, write_json
from . import observe_laboratory
from .observe_document_revalidation import EXPECTED_IDS


class Homepage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.cards=[];self.card=None;self.title=False;self.hero=False;self.hero_text=[];self.text=[]

    def handle_starttag(self, tag, attrs):
        classes=dict(attrs).get('class','').split()
        if tag=='article' and 'neoJobCard' in classes:
            self.card={'kind':'job_offer' if 'neoKind-job_offer' in classes else 'other','title':[]}
        if tag=='h3' and self.card is not None:self.title=True
        if 'neoHeroMeta' in classes:self.hero=True

    def handle_endtag(self, tag):
        if tag=='h3':self.title=False
        if tag=='article' and self.card is not None:
            self.card['title']=' '.join(self.card['title']).strip();self.cards.append(self.card);self.card=None
        if tag=='div' and self.hero:self.hero=False

    def handle_data(self, data):
        if self.title and self.card is not None:self.card['title'].append(data.strip())
        if self.hero:self.hero_text.append(data.strip())
        self.text.append(data)


def inventory(proof, raw_home):
    if proof.get('feedReadComplete') is not True or proof.get('feedReadError'):
        raise ValueError('full_feed_not_read_do_not_infer_count')
    items=proof.get('visibleItems')
    if not isinstance(items,list) or len({x['id'] for x in items})!=len(items):
        raise ValueError('invalid_inventory')
    parser=Homepage();parser.feed(raw_home)
    jobs=[x for x in items if x.get('kind')=='job_offer']
    cards=[x for x in parser.cards if x['kind']=='job_offer']
    text=' '.join(parser.text)
    return {'schema':'trabajo-cerca.site-inventory-proof.v1','checked_at':utcnow().isoformat(),
            'feed_read_complete':True,'feed_pages_read':proof.get('feedPagesRead'),
            'feed_manifest':proof['feed'].get('manifestId'),'sdk_total_items':len(items),'sdk_job_offers':len(jobs),
            'sources':dict(Counter(x.get('source') or 'Sin fuente' for x in jobs)),
            'traiguen_ids_in_feed':sorted(EXPECTED_IDS & {x['id'] for x in jobs}),
            'homepage_job_cards':len(cards),'homepage_cards':cards,'homepage_header':' '.join(parser.hero_text),
            'homepage_has_load_more':'Cargar más' in text,'homepage_read_error':'No pudimos cargar el Radar central' in text,
            'visible_items':items,'document_revalidation':proof.get('documentRevalidation'),
            'read_only':True,'paid_provider_calls':0,'new_offers_published':0,
            'previous_user_reported_count':18,'current_user_reported_count':15,
            'previous_per_id_snapshot_available':False,'cause_of_change_confirmed':False}


def main():
    observe_laboratory.main()
    proof=json.loads(Path('output/laboratory_observation_proof.json').read_text())
    browser=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not browser:raise RuntimeError('readonly_browser_unavailable')
    if os.environ.get('RADAR_OPERATOR_WAIT_BROWSER')=='1':
        raw=asyncio.run(read_homepage_browser(browser))
    else:
        environment={k:v for k,v in os.environ.items() if k not in ('GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')}
        with tempfile.TemporaryDirectory() as directory:
            result=subprocess.run([browser,'--headless','--disable-gpu','--no-first-run','--disable-background-networking',
                '--user-data-dir='+directory,'--virtual-time-budget=20000','--dump-dom',
                'https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/'],capture_output=True,text=True,
                timeout=90,check=True,env=environment)
        raw=result.stdout
    report=inventory(proof,raw)
    output=Path('output/site-inventory');output.mkdir(parents=True,exist_ok=True)
    write_json(output/'proof.json',report)
    write_json(output/'operator-proof.json',proof)
    (output/'homepage.html').write_text(raw)
    print('SITE_INVENTORY_PROOF '+json.dumps(report,ensure_ascii=False),flush=True)


async def read_homepage_browser(browser):
    from playwright.async_api import async_playwright
    environment={key:value for key,value in os.environ.items() if key not in ('GITHUB_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL')}
    async with async_playwright() as playwright:
        instance=await playwright.chromium.launch(executable_path=browser,headless=True,env=environment)
        try:
            page=await instance.new_page()
            await page.goto('https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/',wait_until='domcontentloaded',timeout=30000)
            await page.wait_for_selector('article.neoJobCard',timeout=60000)
            return await page.content()
        finally:
            await instance.close()


if __name__=='__main__':main()
