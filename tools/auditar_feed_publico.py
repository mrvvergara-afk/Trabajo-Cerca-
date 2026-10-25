#!/usr/bin/env python3
"""Read ONLY public Trabajo Cerca feed into a sanitized diagnostic JSON."""
from __future__ import annotations
import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

APP='trabajo-cerca-laboratorio-3ojgro'
ROOT='https://api-v2.appdeploy.ai/app/'+APP+'/api/listings'
UA={'Accept':'application/json','User-Agent':'TrabajoCercaFeedAudit/0.1'}

def read(cursor: str | None):
    params={'fresh':'1'}
    if cursor: params['cursor']=cursor
    url=ROOT+'?'+urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=18) as response:
                if response.headers.get_content_type()!='application/json':
                    return None,'not_json'
                return json.loads(response.read(700000).decode('utf-8')),None
        except urllib.error.HTTPError as error:
            if error.code not in (429,502,503,504) or attempt==3:
                return None,'http_'+str(error.code)
        except (TimeoutError,OSError,ValueError) as error:
            if attempt==3:return None,type(error).__name__
        time.sleep(3)
    return None,'unavailable'

def main():
    items=[];seen=set();pages=[];cursor=None;error=None
    for _ in range(35):
        obj,error=read(cursor)
        if error:break
        pages.append({'keys':list(obj.keys()),'totalItems':obj.get('totalItems'),'hasNext':bool(obj.get('nextCursor'))})
        if not isinstance(obj.get('items'),list):
            error='missing_items';break
        for value in obj['items']:
            if not isinstance(value,dict):continue
            record={k:value.get(k) for k in ('id','kind','title','company','source','url','workCommunes','workLocation','sourcePublishedAt','sourceValidThrough')}
            if record['id'] not in seen: items.append(record);seen.add(record['id'])
        new_cursor=obj.get('nextCursor')
        if not new_cursor:break
        if new_cursor==cursor:error='pagination_loop';break
        cursor=new_cursor
    else:error='pagination_limit'
    report={'read_only':True,'app_writes':0,'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),
            'complete':bool(pages) and not error,'error':error,'pages':pages,'items':items}
    Path('reporte_feed_publico.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'pages':len(pages),'items':len(items),'complete':report['complete'],'error':error},ensure_ascii=False))
if __name__=='__main__':main()
