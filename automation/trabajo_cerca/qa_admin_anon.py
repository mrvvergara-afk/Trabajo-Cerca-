#!/usr/bin/env python3
"""Read-only smoke of administrative access protection, without credentials."""
import json
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError

ROOT="https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro"
ROUTES=[
    ("GET","/api/admin/session",None),
    ("GET","/api/admin/radar-review",None),
    ("POST","/api/admin/radar-review/import",b'{"items":[]}'),
    ("POST","/api/admin/radar-review/decision",b'{"id":"tc_aaaaaaaaaaaaaaaaaaaaaa","status":"discarded"}'),
    ("POST","/api/admin/radar-review/check",b'{"id":"tc_aaaaaaaaaaaaaaaaaaaaaa"}'),
    ("POST","/api/admin/radar-review/submit",b'{"id":"tc_aaaaaaaaaaaaaaaaaaaaaa"}'),
    ("POST","/api/admin/radar-review/status",b'{"id":"tc_aaaaaaaaaaaaaaaaaaaaaa"}'),
]
def probe(method,path,data):
    request=Request(ROOT+path,data=data,method=method,headers={
        "Accept":"application/json","Content-Type":"application/json",
        "User-Agent":"TrabajoCercaAdminAnonymousQA/1.0"})
    try:
        with urlopen(request,timeout=12) as response:
            return {"method":method,"route":path,"http":response.status,"protected":False}
    except HTTPError as e:
        return {"method":method,"route":path,"http":e.code,
                "protected":e.code in (401,403)}
    except (URLError,TimeoutError,OSError) as e:
        return {"method":method,"route":path,"error":type(e).__name__,"protected":False}
def main():
    outcomes=[probe(*r) for r in ROUTES]
    success=all(x["protected"] for x in outcomes)
    obj={"schema":"trabajo-cerca.anonymous-admin-qa.v1",
         "checked_at":datetime.now(timezone.utc).isoformat(),
         "anonymous_protection_passed":success,"write_operations_performed":0,
         "results":outcomes}
    Path("resultado_seguridad_admin.json").write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(obj,ensure_ascii=False))
    if not success:raise SystemExit(1)
if __name__=="__main__":
    main()
