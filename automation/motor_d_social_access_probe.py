"""Prueba de acceso público a Instagram/Facebook, sin credenciales, bypass ni API paga.
Solo diagnostica disponibilidad; NUNCA afirma haber leído un afiche si no lo hizo.
"""
import json
import re
import urllib.error
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

SOURCES = [
    {"name": "OMIL Angol Instagram", "url": "https://www.instagram.com/omilangol2026/", "priority": "critical"},
    {"name": "Radio Nativa Instagram", "url": "https://www.instagram.com/radionativacl/", "priority": "normal"},
    {"name": "Municipalidad Angol Facebook", "url": "https://www.facebook.com/municipalidad.angol/", "priority": "critical"},
    {"name": "Radio Nativa Facebook", "url": "https://www.facebook.com/RadioNativaCl/", "priority": "normal"},
]
AGENT = "TrabajoCercaPublicAudit/1.0"
MAX_BYTES = 250000
def read(url, *, max_bytes=MAX_BYTES):
    req = urllib.request.Request(url, headers={"User-Agent": AGENT, "Accept": "text/html,text/plain"})
    with urllib.request.urlopen(req, timeout=12) as response:
        return response.status, response.headers.get("Content-Type", ""), response.read(max_bytes+1)

def inspect(source):
    now=datetime.now(timezone.utc).isoformat()
    result={"source":source["name"], "url":source["url"], "checked_at":now,
            "status":"not_tested", "http_status":None, "poster_images_read":0,
            "jobs_extracted":0, "posts_discovered":0, "limitations":[]}
    host=urlsplit(source["url"]).hostname
    if host not in ("www.instagram.com", "www.facebook.com"):
        result["status"]="unapproved_host";return result
    robots="https://"+host+"/robots.txt"
    try:
        code,ctype,raw=read(robots,max_bytes=300000)
        if len(raw)>300000 or code!=200:
            result["status"]="robots_unavailable";return result
        parser=urllib.robotparser.RobotFileParser();parser.parse(raw.decode("utf-8",errors="replace").splitlines())
        if not parser.can_fetch(AGENT,source["url"]):
            result["status"]="robots_disallowed";return result
    except urllib.error.HTTPError as e:
        result["status"]="robots_unavailable";result["http_status"]=e.code;return result
    except Exception as e:
        result["status"]="robots_unavailable";result["limitations"]=[type(e).__name__];return result
    try:
        code,mime,html=read(source["url"])
        result["http_status"]=code
        if len(html)>MAX_BYTES:
            result["status"]="document_too_large";return result
        if "html" not in mime.lower():
            result["status"]="unexpected_content_type";return result
        text=html.decode("utf-8",errors="replace")
        if re.search(r"log in|inicia sesi[oó]n|login_required|checkpoint_required",text,re.I):
            result["status"]="login_wall";return result
        if "instagram.com" in host:
            links=set(re.findall(r'https?://(?:www\\.)?instagram\\.com/(?:p|reel)/[A-Za-z0-9_-]+',text))
            links.update("https://www.instagram.com"+p for p in re.findall(r'/(?:p|reel)/[A-Za-z0-9_-]+/?',text))
        else:
            links=set("https://www.facebook.com"+p for p in re.findall(r'/(?:posts|permalink)/[A-Za-z0-9._/-]+',text))
        result["posts_discovered"]=min(len(links),100)
        result["status"]="public_post_links_found" if links else "profile_html_no_post_links"
        result["post_link_sample"]=sorted(links)[:6]
        result["limitations"]=["No se han descargado afiches ni leído carruseles; requiere fase de extracción con acceso autorizado."]
    except urllib.error.HTTPError as e:
        result["status"]="http_restricted" if e.code in (401,403,406,429) else "http_error"
        result["http_status"]=e.code
    except Exception as e:
        result["status"]="network_error";result["limitations"]=[type(e).__name__]
    return result

def main():
    output={"schema":"trabajo-cerca.social-public-access.v1",
            "checked_at":datetime.now(timezone.utc).isoformat(),
            "method":"HTTP GET público con respeto a robots.txt; sin login, proxies ni bypass",
            "results":[inspect(source) for source in SOURCES]}
    out=Path("automation/motor_d_discovery/social_access_status.json")
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(output,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({"statuses":{x["source"]:x["status"] for x in output["results"]},
                      "images_read":0,"job_offers_extracted":0},ensure_ascii=False))
if __name__=="__main__":
    main()
