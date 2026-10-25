#!/usr/bin/env python3
"""Probe only existing read-only public API, no credentials and no data output."""
from __future__ import annotations
import json
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError

APP_ID = "trabajo-cerca-laboratorio-3ojgro"
URLS = {
    "app_frontend": f"https://{APP_ID}.v2.appdeploy.ai/api/ops/free-public-sources",
    "api_backend": f"https://api-v2.appdeploy.ai/app/{APP_ID}/api/ops/free-public-sources",
    "admin_anonymous": f"https://api-v2.appdeploy.ai/app/{APP_ID}/api/admin/document-work",
}
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

def main():
    opener = build_opener(NoRedirect)
    results = {}
    for key, url in URLS.items():
        outcome = {}
        try:
            req = Request(url, headers={"Accept":"application/json",
                                        "User-Agent":"TrabajoCercaConnectivityProbe/1.0"})
            with opener.open(req, timeout=12) as response:
                data = response.read(200000)
                outcome = {"http":response.status,"mime":response.headers.get_content_type()}
                if outcome["mime"]=="application/json":
                    try:
                        doc=json.loads(data)
                        outcome["is_json"]=True
                        outcome["has_document_work"]=isinstance(doc,dict) and "documentWork" in doc
                        if outcome["has_document_work"] and key != "admin_anonymous":
                            work=doc.get("documentWork") or {}
                            outcome["items_count"]=len(work.get("items", [])) if isinstance(work,dict) else None
                    except (ValueError,TypeError):
                        outcome["is_json"]=False
                else:
                    outcome["is_json"]=False
        except HTTPError as error:
            outcome = {"http":error.code,"mime":error.headers.get_content_type(),
                       "blocked":error.code in (401,403)}
        except (URLError,TimeoutError,OSError,ValueError) as error:
            outcome = {"error":type(error).__name__}
        results[key] = outcome
    with open("diagnostico_api.json","w",encoding="utf-8") as handle:
        json.dump({"schema":"trabajo-cerca.read-only-api-probe.v1",
                   "no_credentials":True,"results":results},
                  handle,ensure_ascii=False,indent=2)
    print(json.dumps(results,ensure_ascii=False))

if __name__=="__main__":
    main()
