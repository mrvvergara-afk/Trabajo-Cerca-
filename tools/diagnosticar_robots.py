#!/usr/bin/env python3
"""Read-only public robots diagnostics, no crawling or bypass."""
import json
import datetime as dt
from urllib.request import build_opener, Request, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from pathlib import Path

HOSTS = ('www.traiguencity.cl','traiguencity.cl','victoriachile.cl','mtraiguen.cl')
class StopRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

def inspect(host):
    request=Request('https://'+host+'/robots.txt',
                    headers={'User-Agent':'TrabajoCercaDocumentReader/0.1 (read-only)',
                             'Accept':'text/plain'})
    opener=build_opener(StopRedirect)
    try:
        with opener.open(request, timeout=8) as response:
            return {'host':host,'http':response.status,
                    'mime':response.headers.get_content_type(),
                    'robots_policy_readable':response.status==200 and
                      response.headers.get_content_type()=='text/plain'}
    except HTTPError as error:
        location=error.headers.get('Location','')
        parsed=urlsplit(location)
        return {'host':host,'http':error.code,
                'mime':error.headers.get_content_type(),
                'redirect_host':parsed.hostname if error.code in (301,302,303,307,308) else None,
                'robots_policy_readable':False}
    except (OSError,URLError,TimeoutError,ValueError) as error:
        return {'host':host,'error':type(error).__name__,
                'robots_policy_readable':False}

if __name__=='__main__':
    result={'schema':'trabajo-cerca.robots-diagnostic.v1',
            'timestamp':dt.datetime.now(dt.timezone.utc).isoformat(),
            'read_only':True,'bypass_attempted':False,
            'hosts':[inspect(h) for h in HOSTS]}
    Path('diagnostico_robots.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))
