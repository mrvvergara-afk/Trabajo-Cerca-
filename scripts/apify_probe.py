"""Apify authentication and read-only public Actor metadata check."""
import json
import os
import urllib.request
from pathlib import Path

Path('output').mkdir(exist_ok=True)
token=os.environ.get('APIFY_TOKEN')
report={'configured':bool(token),'authenticated':False,'actor_accessible':False}
if token:
    try:
        req=urllib.request.Request('https://api.apify.com/v2/users/me',headers={'Authorization':'Bearer '+token})
        with urllib.request.urlopen(req,timeout=15) as response:
            report['authenticated']=response.status==200
            report['auth_http']=response.status
        actor='apify~instagram-scraper'
        req=urllib.request.Request('https://api.apify.com/v2/acts/'+actor,headers={'Authorization':'Bearer '+token})
        with urllib.request.urlopen(req,timeout=15) as response:
            data=json.load(response)
            report['actor_accessible']=response.status==200
            report['actor_name']=data.get('data',{}).get('name','')
    except Exception as exc:
        report['error']=str(exc)[:180]
else:
    report['error']='APIFY_TOKEN not configured'
Path('output/apify_connection.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('APIFY_CONNECTION '+json.dumps(report))
