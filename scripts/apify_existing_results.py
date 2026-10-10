"""Inspect existing Apify Instagram actor runs and extract available public results without triggering paid runs."""
import os,json,urllib.request,urllib.parse,re,datetime as dt
from pathlib import Path
Path('output').mkdir(exist_ok=True)
token=os.getenv('APIFY_TOKEN','')
actor=os.getenv('APIFY_ACTOR_ID','apify~instagram-scraper').strip() or 'apify~instagram-scraper'
report={'configured':bool(token),'actor':actor,'runs_examined':0,'dataset_items_examined':0,'candidates':[],'errors':[],'new_actor_runs_started':0}
PLACES=re.compile(r'angol|collipulli|ercilla|renaico|mininco|los sauces|pur[eé]n|traigu[eé]n|lumaco|nacimiento|negrete|mulch[eé]n|victoria',re.I)
JOBS=re.compile(r'oferta laboral|vacantes?|se necesita|se requiere|se busca|contratando|postulaciones|env[ií]a tu cv|curr[ií]culum|omil',re.I)
def get(url):
 req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Accept':'application/json'})
 with urllib.request.urlopen(req,timeout=20) as resp:return json.load(resp)
if token:
 try:
  runs=get('https://api.apify.com/v2/acts/'+urllib.parse.quote(actor,safe='~')+'/runs?limit=10&desc=1').get('data',{}).get('items',[])
  report['runs_examined']=len(runs)
  for run in runs:
   if run.get('status')!='SUCCEEDED' or not run.get('defaultDatasetId'):continue
   dataset=run['defaultDatasetId']
   try:
    items=get('https://api.apify.com/v2/datasets/'+urllib.parse.quote(dataset)+'/items?limit=100&clean=true')
    if not isinstance(items,list):continue
    report['dataset_items_examined']+=len(items)
    for item in items:
     if not isinstance(item,dict):continue
     text=' '.join(str(item.get(k) or '') for k in ('caption','text','description','title'))
     if not PLACES.search(text) or not JOBS.search(text):continue
     url=item.get('url') or item.get('postUrl') or item.get('shortCode')
     if not isinstance(url,str) or not url.startswith('https://'):continue
     report['candidates'].append({'url':url,'text':text[:700],'source':'Instagram/Apify','state':'pending_verification','actor_run_id':run.get('id')})
   except Exception as exc:report['errors'].append('dataset '+str(dataset)+': '+str(exc)[:100])
 except Exception as exc:report['errors'].append(str(exc)[:180])
report['candidates']=list({x['url']:x for x in report['candidates']}.values())
report['candidate_count']=len(report['candidates'])
Path('output/apify_existing_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('APIFY_EXISTING '+json.dumps({k:v for k,v in report.items() if k!='candidates'},ensure_ascii=False))
