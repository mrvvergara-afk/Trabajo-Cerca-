#!/usr/bin/env python3
"""Read-only production-candidate contract smoke; no stress or mutations."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro"
WEB = "https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/"
HEADERS = {"Accept":"application/json","User-Agent":"TrabajoCerca-QAReadOnly/1.0"}
outcomes = []

def request(url, accept=None):
    headers = dict(HEADERS)
    if accept: headers["Accept"] = accept
    req=urllib.request.Request(url,headers=headers)
    with urllib.request.urlopen(req,timeout=25) as res:
        return res.status,dict(res.headers),res.read(1000000).decode("utf-8","replace")

def record(name, ok, **detail):
    outcome={"check":name,"pass":bool(ok),**detail}
    outcomes.append(outcome)
    print("TC_QA_CHECK "+json.dumps(outcome,ensure_ascii=False),flush=True)

def main():
    try:
        status,headers,body=request(API+"/api/_healthcheck")
        obj=json.loads(body)
        record("healthcheck",status==200 and obj.get("message")=="Success",status=status)
    except Exception as exc:
        record("healthcheck",False,error=type(exc).__name__)

    try:
        status,headers,body=request(API+"/api/listings?fresh=1")
        listing=json.loads(body)
        items=listing.get("items")
        valid=status==200 and isinstance(items,list) and not listing.get("degraded") and not listing.get("feedRebuilding") and listing.get("totalVerifiedJobOffers",0)>0
        record("full_authoritative_catalog_page",valid,status=status,
               page_items=len(items) if isinstance(items,list) else None,
               reported_public_jobs=listing.get("totalVerifiedJobOffers"),
               degraded=listing.get("degraded",False),
               feed_state=listing.get("feedState"))
    except Exception as exc:
        record("full_authoritative_catalog_page",False,error=type(exc).__name__)

    try:
        cursor=None;seen_cursors=set();seen_ids=set();pages=0;count=0;total=None
        allowed={"id","title","company","url","workCommunes","urlHashSha256"}
        for _ in range(40):
            qs="?cursor="+urllib.parse.quote(cursor,safe="") if cursor else ""
            status,headers,body=request(API+"/api/listings/identities"+qs)
            data=json.loads(body)
            if status!=200 or data.get("provisional") is not False or not isinstance(data.get("items"),list):
                raise ValueError("non_authoritative_identity_page")
            if total is None:total=data.get("totalItems")
            elif total!=data.get("totalItems"):raise ValueError("catalog_changed_during_read")
            for item in data["items"]:
                if not isinstance(item,dict) or set(item.keys())-allowed:
                    raise ValueError("unexpected_private_identity_fields")
                if not item.get("id") or item["id"] in seen_ids:
                    raise ValueError("duplicate_or_missing_public_id")
                seen_ids.add(item["id"])
            count+=len(data["items"]);pages+=1
            if data.get("hasMore") is False:
                if data.get("complete") is not True:raise ValueError("incomplete_final_page")
                break
            cursor=data.get("nextCursor")
            if not isinstance(cursor,str) or not cursor or cursor in seen_cursors:
                raise ValueError("invalid_pagination_cursor")
            seen_cursors.add(cursor)
            time.sleep(.25)
        else:raise ValueError("too_many_identity_pages")
        record("complete_public_identity_inventory",0<count<=total and pages>0,
               pages=pages,job_ids=count,total_public_records=total)
    except Exception as exc:
        record("complete_public_identity_inventory",False,error=type(exc).__name__,
               detail=str(exc)[:90])

    try:
        status,headers,body=request(API+"/api/listings?fresh=1")
        data=json.loads(body)
        items=data.get("items",[])
        forbidden={"ownerToken","ownerHash","ownerEmailHash","ownerEmail","adminNotes","evidenceImagePath"}
        leaked=sorted({key for item in items if isinstance(item,dict) for key in item if key in forbidden})
        record("public_catalog_owner_credential_redaction",
               status==200 and isinstance(items,list) and not leaked,
               status=status,items_checked=len(items),forbidden_fields=leaked)
    except Exception as exc:
        record("public_catalog_owner_credential_redaction",False,error=type(exc).__name__)

    try:
        status,headers,body=request(API+"/api/local-directory?place=Angol&kind=all")
        data=json.loads(body)
        items=data.get("items",[])
        forbidden={"email","phone","ownerHash","ownerEmailHash","ownerToken","reviewEmailHash"}
        leaked=sorted({key for item in items if isinstance(item,dict) for key in item if key in forbidden})
        record("public_directory_private_fields_redacted",
               status==200 and isinstance(items,list) and not leaked,
               status=status,items_checked=len(items),forbidden_fields=leaked)
    except Exception as exc:
        record("public_directory_private_fields_redacted",False,error=type(exc).__name__)

    try:
        # Read-only access-control check: do not attempt any admin mutation.
        try:
            status,headers,body=request(API+"/api/admin/session")
        except urllib.error.HTTPError as exc:status=exc.code
        record("admin_session_denied_without_login",status in (401,403),status=status)
    except Exception as exc:
        record("admin_session_denied_without_login",False,error=type(exc).__name__)

    try:
        status,headers,body=request(WEB,"text/html")
        meta_csp='http-equiv="Content-Security-Policy"' in body
        hsts=any(k.lower()=="strict-transport-security" for k in headers)
        record("web_meta_csp",status==200 and meta_csp,status=status,html_csp_meta=meta_csp,hosting_hsts_header_present=hsts)
    except Exception as exc:
        record("web_meta_csp",False,error=type(exc).__name__)

    summary={"total":len(outcomes),"pass":sum(x["pass"] for x in outcomes),
             "fail":[x["check"] for x in outcomes if not x["pass"]],
             "production_ready":False,
             "note":"Read-only smoke only. This is NOT a load test, pentest or DR certification."}
    print("TRABAJO_CERCA_PUBLIC_SMOKE "+json.dumps(summary,ensure_ascii=False),flush=True)
    if summary["fail"]:raise SystemExit(1)

if __name__=="__main__":
    main()
