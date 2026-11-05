"""Motor D territorial: inspección diaria reproducible de fuentes públicas para 12 comunas.
Produce inventario de candidatos con evidencia, NUNCA publica HTML genérico como vacante.
No solicita credenciales, evita redes con acceso restringido y registra fallas por fuente.
"""
import json, re, hashlib, unicodedata
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from urllib.parse import urljoin, urlsplit
import requests
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup

TZ=ZoneInfo("America/Santiago")
NOW=datetime.now(TZ)
ROOT=Path("automation/motor_d_discovery")
COMMUNES=["Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén",
          "Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento"]
# Fuentes municipales y de intermediación: una fuente base por comuna, más fuentes adicionales.
SEEDS=[
("Angol","Municipalidad Angol","https://noticias.angol.cl/"),
("Angol","Hospital Angol concursos","https://hospitalangol.cl/concursos/"),
("Collipulli","Municipio Collipulli","https://municipalidadcollipulli.cl/"),
("Ercilla","Municipio Ercilla","https://muniercilla.cl/"),
("Lumaco","Municipio Lumaco","https://munilumaco.cl/"),
("Los Sauces","Municipio Los Sauces","https://munilossauces.cl/"),
("Purén","Municipio Purén","https://munipuren.cl/"),
("Renaico","Municipio Renaico","https://municipalidadrenaico.cl/concursos-publicos/"),
("Traiguén","Municipio Traiguén","https://mtraiguen.cl/category/bolsa-de-empleo-o-concurso/"),
("Victoria","Municipio Victoria OMIL","https://victoriachile.cl/departamentos-y-direcciones/udel/omil/"),
("Mulchén","Municipio Mulchén empleos","https://www.munimulchen.cl/pagina-central-ofertas-laborales/"),
("Negrete","Municipio Negrete OMIL","https://www.muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/"),
("Nacimiento","Municipio Nacimiento","https://nacimiento.cl/"),
("Angol","Salud Araucanía Norte","https://ssan.redsalud.gob.cl/trabaje-con-nosotros/"),
("Collipulli","Arauco empleo","https://jobs.arauco.com/Chile/search/"),
("Nacimiento","CMPC empleo","https://cmpc.csod.com/ux/ats/careersite/4/home?c=cmpc"),
("Mulchén","OMIL Mulchén temporada","https://www.munimulchen.cl/oferta-laboral-personal-temporada-agricola-packing-y-cosecha-de-arandanos/"),
("Mulchén","OMIL Mulchén arándanos 100 cupos","https://www.munimulchen.cl/oferta-laboral-02-operarios-agrarios-cosecha-de-arandanos/"),
("Victoria","Municipio Victoria OMIL publicaciones","https://victoriachile.cl/category/omil/"),
("Angol","Hospital Angol estado postulaciones","https://hospitalangol.cl/estado/postulacion/"),
("Angol","Radio Viaducto","https://radioviaducto.cl/"),
("Angol","Las Noticias de Malleco","https://lasnoticiasdemalleco.cl/"),
]
TERMS=re.compile(r"\b(?:oferta(?:s)? laboral(?:es)?|empleo(?:s)?|trabajo(?:s)?|vacante(?:s)?|"
    r"postulaci[oó]n|convocatoria|concurso(?:s)?|contrata(?:ci[oó]n)?|operador(?:a)?|"
    r"t[eé]cnico(?:a)?|auxiliar|conductor(?:a)?|chofer|mec[aá]nico(?:a)?|"
    r"enfermer(?:a|o)|albañil|capataz|temporada|reclutamiento|se necesita|se busca)\b",re.I)
NOT_LINK=re.compile(r"^(?:inicio|ver m[aá]s|leer m[aá]s|conoce m[aá]s|contacto|menu|"
                    r"concursos|omil|empleos|ofertas laborales|trabaja con nosotros)$",re.I)
CLOSED=re.compile(r"postulaci[oó]n(?:es)?\s+cerrad[ao]s?|proceso\s+finalizado|"
                  r"concurso\s+cerrado|postulaci[oó]n\s+finalizada|convocatoria\s+cerrada",re.I)
INTERNAL_ONLY=re.compile(r"\bconcurso\s+interno\b",re.I)
GENERAL_INDEX=re.compile(r"^(?:concursos?\s+(?:p[uú]blicos?|internos?)|"
                         r"llamado\s+a\s+concursos?\s+p[uú]blicos?|"
                         r"llamado\s+a\s+concurso\s+interno)$",re.I)
HEADERS={"User-Agent":"TrabajoCercaTerritorial/1.0 (+public sources; no social scraping)",
         "Accept":"text/html,application/xhtml+xml"}
def fold(s):
    return "".join(c for c in unicodedata.normalize("NFD",str(s)) if unicodedata.category(c)!="Mn").lower()
def key(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:20]
def safe_link(raw,base,origin):
    try:
        u=urlsplit(urljoin(base,raw))
        if u.scheme!="https" or not u.hostname or u.username or u.password or u.port:return None
        if u.hostname.lower()!=origin:return None
        if re.search(r"\.(?:jpg|png|gif|svg|css|js|zip|pdf)$",u.path,re.I):return None
        if not u.path or u.path in ("/","/index.php"):return None
        if (u.hostname,u.path.rstrip("/"),u.query)==(urlsplit(base).hostname,urlsplit(base).path.rstrip("/"),urlsplit(base).query):return None
        return u.geturl().split("#",1)[0]
    except ValueError:return None
def request_page(url):
    resp=requests.get(url,headers=HEADERS,timeout=(5,9),allow_redirects=True,
                      stream=True)
    try:
        if resp.status_code!=200:return resp.status_code,None,None
        if not ("html" in resp.headers.get("Content-Type","").lower()):return 200,None,"non_html"
        size=0;parts=[]
        for chunk in resp.iter_content(32768):
            size+=len(chunk)
            if size>1200000:return 200,None,"too_large"
            parts.append(chunk)
        return 200,BeautifulSoup(b"".join(parts),"html.parser"),None
    finally:resp.close()
def dates_in(soup):
    found=[]
    for elem in soup.select("time[datetime], meta[property='article:published_time'], meta[name='date'], meta[property='og:published_time']")[:8]:
        value=(elem.get("datetime") or elem.get("content") or "")[:30]
        m=re.search(r"20\d{2}-\d\d-\d\d",value)
        if m:found.append(m.group(0))
    return list(dict.fromkeys(found))
def links_from(soup,base):
    origin=urlsplit(base).hostname
    output={}
    for tag in soup.select("a[href]")[:500]:
        url=safe_link(tag.get("href",""),base,origin)
        if not url:continue
        title=" ".join(tag.stripped_strings)[:180]
        if len(title)<6 or NOT_LINK.fullmatch(title) or not TERMS.search(title+" "+urlsplit(url).path.replace("-"," ")):continue
        # El índice municipal puede decir CERRADA aunque la ficha individual antigua diga ABIERTA.
        # Solo usar contenedores pequeños del enlace; nunca un div que reúna toda la página.
        listing_state="not_indicated"
        parent=tag
        for _ in range(3):
            parent=getattr(parent,"parent",None)
            if parent is None:break
            context=parent.get_text(" ",strip=True)
            if len(context)>460:break
            nearby=re.search(r"postulaci[oó]n\s+(abierta|cerrada)",context,re.I)
            if nearby:
                listing_state="closed" if nearby.group(1).lower()=="cerrada" else "open"
                break
        if CLOSED.search(title):listing_state="closed"
        output.setdefault(url,(title,listing_state))
    return [(url,title,state) for url,(title,state) in output.items()][:35]
# Solo el texto explicito de la oferta puede establecer empresa y lugar de trabajo.
# La comuna de la fuente municipal NO equivale a la comuna del puesto.
def explicit_work_commune(body):
    value=fold(body)
    aliases={"mininco":"Collipulli","coihue":"Negrete","coigue":"Negrete"}
    places={fold(place):place for place in COMMUNES}
    places.update(aliases)
    for field in re.finditer(
        r"(?:lugar de trabajo|comuna de trabajo|lugar de desempeno|ubicacion laboral|sede de trabajo)\s*[:\-]\s*([^.;]{3,100})",
        value):
        text=field.group(1)
        for name,commune in places.items():
            if re.search(r"(?<!\w)"+re.escape(name)+r"(?!\w)",text):
                return commune
    return None

def explicit_employer(body):
    found=re.search(r"(?:empresa|empleador|raz[oó]n social)\s*:\s*([^.;]{3,90})",body,re.I)
    if not found:return None
    value=found.group(1).strip(" -:")
    value=re.split(r"\s+(?:cargo|vacantes|ubicaci[oó]n|comuna|requisitos|postulaci[oó]n)\s*:",value,1,flags=re.I)[0].strip()
    return value if 2<=len(value)<=90 else None

def explicit_application(body):
    return bool(re.search(r"(?:postulaciones?\s+abiertas?|c[oó]mo\s+postular|postula\s+(?:en|aqu[ií])|enviar\s+(?:curr[ií]culum|cv)|env[ií]a\s+tu\s+cv|recepci[oó]n\s+de\s+antecedentes)",body,re.I))

def inspect(seed):
    town,source,url=seed
    out={"commune":town,"source":source,"url":url,"status":"not_started",
         "checked_at":NOW.isoformat(),"http":None,"links_found":0,
         "details_opened":0,"candidates":[],"errors":[]}
    try:
        status,soup,reason=request_page(url)
        out["http"]=status
        if status!=200 or soup is None:
            out["status"]="http_restricted" if status in (401,403,406,429) else (reason or "http_error")
            return out
        links=links_from(soup,url)
        out["links_found"]=len(links)
        # Procesar todos los enlaces descubiertos (hasta 35) con paralelismo acotado,
        # sin quedar en un muestreo fijo de cinco.
        def inspect_detail(entry):
            detail_url,label,index_status=entry
            detail={"id":key(detail_url),"url":detail_url,"label":label,
                    "index_status":index_status,"evidence":"link_candidate_only",
                    "date_source":None,"work_commune":None,"recruitment_commune":None,
                    "source_scope_commune":town,"source_commune_not_confirmed":True}
            try:
                code,detail_soup,detail_reason=request_page(detail_url)
                detail["http"]=code
                if code==200 and detail_soup is not None:
                    heading=detail_soup.select_one("h1")
                    title=heading.get_text(" ",strip=True)[:180] if heading else label
                    body=detail_soup.get_text(" ",strip=True)[:7000]
                    dates=dates_in(detail_soup)
                    job_commune=explicit_work_commune(body)
                    employer=explicit_employer(body)
                    application_evidence=explicit_application(body)
                    # Closed labels and internal-only calls are not public job vacancies.
                    explicit_closed=bool(CLOSED.search(title+" "+label))
                    public_title=title if len(title)>10 else label
                    internal_only=bool(INTERNAL_ONLY.search(public_title+" "+label))
                    general_index=bool(GENERAL_INDEX.fullmatch(public_title.strip()))
                    detail.update(title=public_title,dates=dates,
                                  work_commune=job_commune,source_commune_not_confirmed=job_commune is None,
                                  employer=employer,application_evidence=application_evidence,
                                  date_source=dates[0] if dates else None,
                                  evidence="closed" if (explicit_closed or index_status=="closed") else (
                                      "internal_only" if internal_only else (
                                      "directory_not_offer" if general_index else (
                                      "individual_page_with_job_terms" if TERMS.search(public_title+" "+body[:1600])
                                      else "inconclusive_page"))),
                                  excerpt=body[:550])
                    detail["express_ready"]=bool(
                        detail["evidence"]=="individual_page_with_job_terms"
                        and job_commune and employer and application_evidence and dates
                        and (NOW.date()-timedelta(days=1))<=datetime.strptime(dates[0],"%Y-%m-%d").date()<=NOW.date()
                    ) if dates and re.fullmatch(r"20\d{2}-\d{2}-\d{2}",dates[0]) else False
                    if dates:
                        parsed=datetime.strptime(dates[0],"%Y-%m-%d").date()
                        detail["date_recent_2d"]=(NOW.date()-timedelta(days=1))<=parsed<=NOW.date()
                else:detail["evidence"]="detail_unavailable"
            except Exception as exc:
                detail["error"]=type(exc).__name__
                detail["evidence"]="detail_unavailable"
            return detail
        with ThreadPoolExecutor(max_workers=6) as pool:
            out["candidates"]=list(pool.map(inspect_detail,links))
        # Los comunicados de empleo individuales usados como semilla también son
        # candidatos propios; no depender de que tengan enlaces internos.
        source_path=urlsplit(url).path.rstrip("/").lower()
        if "/oferta-laboral-" in source_path or "/convocatoria-laboral-" in source_path:
            headline=soup.select_one("h1")
            heading=headline.get_text(" ",strip=True)[:180] if headline else ""
            body=soup.get_text(" ",strip=True)[:7000]
            if (TERMS.search(heading) or "oferta-laboral-" in source_path) and re.search(
                    r"requisitos|postulaci[oó]n|curr[ií]culum|omil|se requiere",body,re.I):
                dates=dates_in(soup)
                detail={"id":key(url),"url":url,"label":heading,"title":heading,
                        "date_source":dates[0] if dates else None,"dates":dates,
                        "http":200,"evidence":"closed" if CLOSED.search(heading) else (
                            "internal_only" if INTERNAL_ONLY.search(heading) else "individual_page_with_job_terms"),
                        "work_commune":None,"recruitment_commune":None,
                        "source_scope_commune":town,"source_commune_not_confirmed":True,
                        "excerpt":body[:550]}
                if dates:
                    try:
                        date=datetime.strptime(dates[0],"%Y-%m-%d").date()
                        detail["date_recent_2d"]=(NOW.date()-timedelta(days=1))<=date<=NOW.date()
                    except ValueError:pass
                if not any(x["id"]==detail["id"] for x in out["candidates"]):
                    out["candidates"].append(detail)
        out["details_opened"]=sum(x.get("http")==200 and x.get("evidence") not in
                                   ("detail_unavailable","link_candidate_only") for x in out["candidates"])
        out["status"]="scanned_with_candidates" if out["candidates"] else "scanned_no_candidates"
    except requests.exceptions.RequestException as exc:
        out["status"]="network_error";out["errors"].append(type(exc).__name__)
    except Exception as exc:
        out["status"]="processing_error";out["errors"].append(type(exc).__name__)
    return out
def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    rows=[inspect(seed) for seed in SEEDS]
    scanned={r["commune"] for r in rows}
    missing=sorted(set(COMMUNES)-scanned)
    candidates=[dict(x,source=y["source"],commune=y["commune"]) for y in rows for x in y["candidates"]]
    unique={}
    for item in candidates:
        unique.setdefault(item["id"],item)
    # Diff persistente: contabiliza solo identidades nuevas respecto al inventario de GitHub.
    state_file=ROOT/"territorial_state.json"
    try:
        state=json.loads(state_file.read_text(encoding="utf-8")) if state_file.exists() else {}
    except (ValueError,OSError):
        state={}
    known=state.get("seen",{})
    if not isinstance(known,dict):known={}
    first_run=not state_file.exists()
    discovered=[x for x in unique.values() if x["id"] not in known]
    for item in unique.values():
        known.setdefault(item["id"],{"first_seen":NOW.isoformat(),"url":item["url"],
                                     "source":item["source"],"commune":item["commune"]})
    # Keep a capped inventory; do not silently recategorize prior source identities.
    if len(known)>8000:
        known=dict(sorted(known.items(),key=lambda x:x[1].get("first_seen",""),reverse=True)[:8000])
    state_file.write_text(json.dumps({"schema_version":1,"last_run":NOW.isoformat(),
                                     "seen":known},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    per_commune={town:{"sources_attempted":sum(x["commune"]==town for x in rows),
                       "sources_accessible":sum(x["commune"]==town and x["status"].startswith("scanned") for x in rows),
                       "links_found":sum(x["links_found"] for x in rows if x["commune"]==town),
                       "candidates":sum(len(x["candidates"]) for x in rows if x["commune"]==town)}
                 for town in COMMUNES}
    excluded={"closed","internal_only","directory_not_offer","inconclusive_page","detail_unavailable"}
    eligible=[x for x in unique.values() if x.get("evidence")=="individual_page_with_job_terms"]
    report={"schema_version":2,"date":NOW.isoformat(),"scope":"today_and_yesterday",
            "communes_expected":COMMUNES,"communes_visited":sorted(scanned),
            "missing_communes":missing,"sources_total":len(SEEDS),
            "commune_status":per_commune,
            "communes_with_accessible_source":sum(v["sources_accessible"]>0 for v in per_commune.values()),
            "communes_without_accessible_source":[k for k,v in per_commune.items() if not v["sources_accessible"]],
            "sources_accessible":sum(r["status"].startswith("scanned") for r in rows),
            "sources_blocked":sum(r["status"] in ("http_restricted","network_error") for r in rows),
            "job_candidates_total":len(unique),"new_candidate_links":len(discovered),
            "individually_read_potential_offers":len(eligible),
            "express_ready_candidates":sum(x.get("express_ready") is True for x in unique.values()),
            "rejected_or_unusable_evidence":sum(x.get("evidence") in excluded for x in unique.values()),
            "baseline_run":first_run,"confirmed_new_publications":0,
            "published_in_trabajo_cerca":0,
            "warning":"Enlaces candidatos, NO empleos confirmados. Fuente por comuna no prueba lugar de trabajo ni reclutamiento. Nunca incluir índice/listado como oferta.",
            "sources":rows,"candidates":list(unique.values()),"new_candidates":discovered}
    (ROOT/"territorial_daily.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    summary={k:report[k] for k in ("sources_total","sources_accessible","sources_blocked","job_candidates_total","new_candidate_links",
                                   "confirmed_new_publications","published_in_trabajo_cerca","missing_communes")}
    print("MOTOR_D_TERRITORIAL "+json.dumps(summary,ensure_ascii=False),flush=True)
    if missing:raise SystemExit("COVERAGE_FAILURE: comuna no inspeccionada")
if __name__=="__main__":main()
