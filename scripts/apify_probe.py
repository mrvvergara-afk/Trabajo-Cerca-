"""Apify connector smoke test: requires APIFY_TOKEN and APIFY_ACTOR_ID."""
import os
import json
import urllib.request

token = os.environ.get('APIFY_TOKEN')
actor = os.environ.get('APIFY_ACTOR_ID')
if not token:
    print(json.dumps({'status':'not_configured','reason':'APIFY_TOKEN missing'}))
else:
    req = urllib.request.Request('https://api.apify.com/v2/users/me', headers={'Authorization':'Bearer '+token})
    with urllib.request.urlopen(req,timeout=15) as response:
        print(json.dumps({'status':'authenticated','http':response.status}))
