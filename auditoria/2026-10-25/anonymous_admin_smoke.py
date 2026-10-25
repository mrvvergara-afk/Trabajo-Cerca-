#!/usr/bin/env python3
"""Anonymous security smoke test: no credentials, no writes should ever pass."""
import datetime as dt
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE="https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro"
ROUTES=[
    ("GET","/api/admin/radar-review",None),
    ("POST","/api/admin/radar-review/import",b'{"items":[]}'),
    ("POST","/api/admin/radar-review/decision",b'{"id":"tc_aaaaaaaaaaaaaaaaaaaaaa","status":"discarded"}'),
    ("GET","/api/admin/session",None),
]
def check(method,path,data):
    request=Request(BASE+path,data=data,method=method,headers={
        "Content-Type":"application/json","Accept":"application/json",
        "User-Agent":"TrabajoCercaAnonymousSecuritySmoke/1.0"})
    try:
        with urlopen(request,timeout=18) as response:
            return {"method":method,"route":path,"http":response.status,"protected":False}
    except HTTPError as error:
        return {"method":method,"route":path,"http":error.code,"protected":error.code in (401,403)}
    except (URLError,OSError,TimeoutError) as error:
        return {"method":method,"route":path,"error":type(error).__name__,"protected":False}

def main():
    results=[check(*route) for route in ROUTES]
    ok=all(item.get("protected") for item in results)
    output={"checked_at":dt.datetime.now(dt.timezone.utc).isoformat(),
      "anonymous_requests":results,"all_protected":ok,"writes":0}
    Path("resultado_seguridad_radar_review.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(output,ensure_ascii=False))
    if not ok:raise SystemExit(1)
if __name__=="__main__":main()
