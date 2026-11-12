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
from ocr_review_security import redact
from trabajo_cerca.municipal_feed import (
    SITES as MUNICIPAL_FEED_SITES, discover_municipal, documents_from_page,
    is_broad_municipal_index,
)

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
# Recover independently confirmed individual vacancies from the original portal.
# These are seed URLs to re-check, not automatic approvals or permanent fixtures.
("Nacimiento","Chiletrabajos · Serfonac mecánico soldador","https://www.chiletrabajos.cl/trabajo/mecanico-a-soldador-a-de-maquinaria-nacimiento-3923358"),
("Nacimiento","Chiletrabajos · Serfonac mecánico automotriz","https://www.chiletrabajos.cl/trabajo/mecanico-a-automotriz-nacimiento-3923364"),
("Nacimiento","Chiletrabajos · Serfonac conductor","https://www.chiletrabajos.cl/trabajo/conductor-de-transporte-de-carga-y-personal-nacimiento-3923758"),
("Angol","Chiletrabajos · Operario alimentos Angol","https://www.chiletrabajos.cl/trabajo/se-busca-operario-de-produccion-angol-3919569"),
# Independent discovery control cases. All must be rechecked on each run;
# historical links are NOT proof that a vacancy remains open.
("Angol","Chiletrabajos · Director CC LAE Angol · contraste","https://www.chiletrabajos.cl/trabajo/director-a-cc-lae-angol-3930443"),
("Victoria","Chiletrabajos · Inventario Victoria Traiguén · contraste","https://www.chiletrabajos.cl/trabajo/personal-toma-de-inventario-victoria-traiqguen-3925455"),
# Geographic cross-postings: recruiter's office is outside the 12 communes,
# but the body explicitly states the real workplace. Always re-read the URL.
("Traiguén","Chiletrabajos · Reponedor Traiguén","https://www.chiletrabajos.cl/trabajo/part-time-para-traiguen-en-la-araucania-3924463"),
("Mulchén","Chiletrabajos · Reponedor Mulchén","https://www.chiletrabajos.cl/trabajo/reponedor-part-time-mulchen-3927989"),
("Purén","Chiletrabajos · Prevencionista obras Malleco","https://www.chiletrabajos.cl/trabajo/prevencionista-de-riesgos-malleco-3924497"),
("Angol","Radio Viaducto","https://radioviaducto.cl/"),
("Angol","Las Noticias de Malleco","https://lasnoticiasdemalleco.cl/"),
# Recuperación crítica de anuncios vistos en Indeed desde la fuente del empleador.
# Solo se consideran fichas individuales; ninguna lista es una oferta aprobada.
("Angol","Fashion's Park · portal oficial de contratación","https://fashionspark.hiringroom.com/jobs"),
("Angol","Falabella · empleos oficiales","https://muevete.falabella.com/"),
("Angol","Unimarc · empleos oficiales","https://unimarc.trabajando.cl/"),
]
# Chiletrabajos: /ciudad/<slug>.html is the preferred geographic route.
# Many city indices render without a geographic heading. A ?2= keyword
# fallback may then discover individual job URLs, but its result page is NOT
# geographically scoped. Only a confirmed individual worksite can enter an
# auto-publishable lot; a title+portal city alone stays review-only.
from urllib.parse import quote
def chiletrabajos_city_slug(town):
    folded=unicodedata.normalize("NFD",town.lower())
    slug="".join(c for c in folded if unicodedata.category(c)!="Mn")
    return re.sub(r"[^a-z0-9]+","-",slug).strip("-")

def chiletrabajos_fallback_url(town):
    """Unscoped keyword search: discovery only, not evidence of job location."""
    if town not in COMMUNES:
        raise ValueError("Comuna no autorizada para búsqueda")
    return "https://www.chiletrabajos.cl/encuentra-un-empleo/?2="+quote(town)


SEEDS.extend((town,"Chiletrabajos · "+town,
    "https://www.chiletrabajos.cl/ciudad/"+chiletrabajos_city_slug(town)+".html")
    for town in COMMUNES)
# Indeed is a critical source. Check one page per commune and report access
# truthfully; HTTP 403 is coverage failure, never zero open jobs.
INDEED_SEEDS=[(town,"Indeed · "+town,
    "https://cl.indeed.com/jobs?q=&l="+quote(town)+"&fromage=2")
    for town in COMMUNES]

# Integrate all registered permanent source indexes and social references.
# Individual historical vacancies are NOT permanent search sources.
from motor_d_employer_portal import read_employer_vacancy
from motor_d_cmpc_api import source_is_official_cmpc,read_cmpc_requisitions
from motor_d_safco import allowed_source as official_safco_home, extract_open_safco_cards
from motor_d_source_registry import plan as source_plan, ranked as ranked_sources, assess as assess_source_coverage, learn as learn_source_performance
from motor_d_source_recovery import build_recovery_queue
from motor_a_handoff import read as read_motor_a_review
from motor_d_social_sources import SOURCES as SOCIAL_REFERENCE_SOURCES
SOURCE_PLAN=source_plan(SEEDS,INDEED_SEEDS,social_refs=SOCIAL_REFERENCE_SOURCES)
SEEDS.extend(SOURCE_PLAN["added"])

TERMS=re.compile(r"\b(?:oferta(?:s)? laboral(?:es)?|empleo(?:s)?|trabajo(?:s)?|vacante(?:s)?|"
    r"postulaci[oó]n|convocatoria|concurso(?:s)?|contrata(?:ci[oó]n)?|operador(?:a)?|"
    r"t[eé]cnico(?:a)?|auxiliar|conductor(?:a)?|chofer|mec[aá]nico(?:a)?|"
    r"enfermer(?:a|o)|albañil|capataz|temporada|reclutamiento|se necesita|se busca|"
    r"asistente|cajer[ao]s?|vendedor(?:a)?|bodega|tesorer[ií]a|click and collect|"
    r"jefe(?:a)? de ventas|reponedor(?:a)?|prevencionista|mercaderista|docente|psic[oó]log[oa]|"
    r"director(?:a)?|supervisor(?:a)?|encargad[ao]|instrumentista|guardia|"
    r"mantenedor(?:a)?|inventario|inventarista|analista|inspector(?:a)?|"
    r"brigadista|motosierrista|teclero|cargador\s+frontal|"
    r"administrativ[ao]|profesional|jefatura|ingenier[ao]|operari[ao])\b",re.I)
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
# Match Motor A's already-tested public job-detail reader for Chiletrabajos.
# Do not change the request policy for Indeed, social media, or third parties.
CHILETRABAJOS_HEADERS={
    **HEADERS,
    "User-Agent":"Mozilla/5.0 (compatible; TrabajoCerca/1.0)"
}
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
        if origin in ("www.chiletrabajos.cl","chiletrabajos.cl") and not u.path.startswith("/trabajo/"):
            return None
        # The employer-branded Trabajando indexes show CV advice/news pages
        # alongside actual vacancies; those are never job details.
        if origin.endswith(".trabajando.cl") and u.path.startswith(("/noticias/","/blog/","/articulos/")):
            return None
        if not u.path or u.path in ("/","/index.php") or re.search(r"/(?:alertas-de-empleo|login|registro|faq|preguntas-frecuentes)/?$",u.path,re.I):return None
        if (u.hostname,u.path.rstrip("/"),u.query)==(urlsplit(base).hostname,urlsplit(base).path.rstrip("/"),urlsplit(base).query):return None
        return u.geturl().split("#",1)[0]
    except ValueError:return None
def authorized_public_url(url, origin=None):
    """HTTPS only: reject private targets and off-publisher redirects."""
    import ipaddress
    try:
        value=urlsplit(url)
        host=(value.hostname or "").lower().removeprefix("www.")
        if (value.scheme!="https" or not host or value.username or value.password
            or value.port is not None or host=="localhost"
            or host.endswith((".local",".internal"))):
            return False
        try:
            if not ipaddress.ip_address(host).is_global:
                return False
        except ValueError:
            pass
        return origin is None or host==origin
    except (TypeError,ValueError):
        return False

def request_page(url):
    # Do not let a public municipal post redirect the crawler to a different
    # domain or a private address. Explicit redirects can be followed only
    # inside the exact same publisher (www aliases allowed).
    if not authorized_public_url(url):
        return 0,None,"source_url_not_authorized"
    origin=urlsplit(url).hostname.lower().removeprefix("www.")
    for redirect in range(4):
        host=urlsplit(url).hostname.lower().removeprefix("www.")
        headers=(CHILETRABAJOS_HEADERS if host=="chiletrabajos.cl" else HEADERS)
        resp=requests.get(url,headers=headers,timeout=(5,9),allow_redirects=False,
                          stream=True)
        try:
            if resp.status_code in (301,302,303,307,308):
                location=resp.headers.get("Location")
                target=urljoin(url,location) if location else ""
                if redirect==3 or not authorized_public_url(target,origin):
                    return resp.status_code,None,"redirect_not_authorized"
                url=target
                continue
            if resp.status_code!=200:
                return resp.status_code,None,None
            if not ("html" in resp.headers.get("Content-Type","").lower()):
                return 200,None,"non_html"
            size=0;parts=[]
            for chunk in resp.iter_content(32768):
                size+=len(chunk)
                if size>1200000:return 200,None,"too_large"
                parts.append(chunk)
            return 200,BeautifulSoup(b"".join(parts),"html.parser"),None
        finally:
            resp.close()
    return 0,None,"redirect_not_authorized"
def dates_in(soup):
    found=[]
    for elem in soup.select("time[datetime], meta[property='article:published_time'], meta[name='date'], meta[property='og:published_time']")[:8]:
        value=(elem.get("datetime") or elem.get("content") or "")[:30]
        m=re.search(r"20\d{2}-\d\d-\d\d",value)
        if m:found.append(m.group(0))
    # Chiletrabajos individual pages label the original date explicitly.
    # Never infer a publication date from a date in a job description.
    text=soup.get_text(" ",strip=True)[:3000]
    match=re.search(r"\bFecha\s*[:|]?\s*(20\d{2}-\d{2}-\d{2})\b",text,re.I)
    if match:found.append(match.group(1))
    return list(dict.fromkeys(found))
def links_from(soup,base,limit=35):
    origin=urlsplit(base).hostname
    output={}
    # Include deep links in large indices; rotation then visits them across
    # scheduled runs. The old first-500 cutoff starved later jobs forever.
    for tag in soup.select("a[href]")[:3000]:
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
    found=[(url,title,state) for url,(title,state) in output.items()]
    return found[:limit] if limit is not None else found
# Solo el texto explicito de la oferta puede establecer empresa y lugar de trabajo.
# La comuna de la fuente municipal NO equivale a la comuna del puesto.
def explicit_work_commune(body):
    """Worksite cues only, never a recruiter address, residence or source commune."""
    value=fold(body)
    aliases={"mininco":"Collipulli","coihue":"Negrete","coigue":"Negrete"}
    places={fold(place):place for place in COMMUNES}
    places.update(aliases)
    cues=(
        r"(?:lugar de trabajo|comuna de trabajo|lugar de desempeno|ubicacion laboral|sede de trabajo)\s*[:\-]\s*([^.;]{3,100})",
        r"(?:con base en|base de operaciones en|trabajo con base en|realizar labores en taller y terreno,? con base en)\s+([^.;]{3,90})",
        r"(?:obras? ubicadas? en|planta ubicada en|fabrica de [^.;]{3,50} ubicada en|supermercados? en|tiendas? en)\s+([^.;]{3,90})",
        r"(?:disponibilidad para realizar (?:practica|trabajo|labores) presencial(?:es)? en|disponibilidad para desempenarse en|practica presencial en)\s+([^.;]{3,90})"
    )
    for cue in cues:
        for field in re.finditer(cue,value,re.I):
            clause=field.group(1)
            # The first named workplace in the source wins. Dictionary
            # ordering used to select Los Sauces before Purén in a
            # "Purén, Los Sauces y Traiguén" listing.
            matches=[]
            for name,commune in places.items():
                match=re.search(r"(?<!\w)"+re.escape(name)+r"(?!\w)",clause)
                if match:
                    matches.append((match.start(),-len(name),commune))
            if matches:
                return min(matches)[2]
    return None

def focused_job_text(soup):
    """Prefer the actual vacancy content over long municipal headers and menus."""
    for selector in ("article", ".entry-content", ".post-content", ".td-post-content", "main"):
        for section in soup.select(selector)[:4]:
            content=section.get_text(" ",strip=True)
            if len(content)>=80:
                return content[:7000]
    return soup.get_text(" ",strip=True)[:7000]

def informative_job_title(soup, label):
    """Use the publisher's full article title if H1 only says 'Oferta Laboral'."""
    heading=soup.select_one("h1")
    title=heading.get_text(" ",strip=True)[:180] if heading else label
    if fold(title).strip() in {"oferta laboral","convocatoria","llamado a concurso"} or len(title)<10:
        page_title=soup.title.get_text(" ",strip=True) if soup.title else ""
        actual=page_title.split("|",1)[0].strip()[:180]
        if len(actual)>=12 and TERMS.search(actual):
            return actual
    return title or label

def explicit_employer(body):
    found=re.search(r"(?:empresa|empleador|raz[oó]n social)\s*:\s*([^.;]{3,90})",body,re.I)
    if not found:return None
    value=found.group(1).strip(" -:")
    value=re.split(r"\s+(?:cargo|vacantes|ubicaci[oó]n|comuna|requisitos|postulaci[oó]n)\s*:",value,1,flags=re.I)[0].strip()
    return value if 2<=len(value)<=90 else None

def explicit_application(body):
    return bool(re.search(r"(?:postulaciones?\s+abiertas?|c[oó]mo\s+postular|postula(?:r)?\s+(?:en|aqu[ií])|enviar\s+(?:curr[ií]culum|cv)|env[ií]a\s+tu\s+cv|recepci[oó]n\s+de\s+antecedentes)",body,re.I))

def municipal_open_official_evidence(town, source, index_url, detail_url, index_status, body):
    """Bounded municipality-only validation. Never infer a worksite from its index URL."""
    if index_status != "open" or not source.startswith("Municipio "):
        return None
    if urlsplit(index_url).hostname not in ("www.munimulchen.cl", "munimulchen.cl"):
        return None
    if urlsplit(detail_url).hostname not in ("www.munimulchen.cl", "munimulchen.cl"):
        return None
    if not urlsplit(detail_url).path.startswith("/oferta-laboral-"):
        return None
    # Publisher specifically describes the local agricultural workplace,
    # not merely a municipal OMIL address or place where CVs are delivered.
    # The publisher uses a visual article layout and may split sentences
    # across blocks. Require every independent, *job-specific* evidence
    # marker rather than one brittle regex spanning multiple paragraphs.
    text=fold(body)
    agricultural_site=all(marker in text for marker in (
        "empresa del rubro agricola de la comuna de mulchen",
        "cosecha de arandanos","predio ubicado en el sector campamento"))
    in_person=all(marker in text for marker in (
        "interesados","presentar","documentacion","oficina omil","anibal pinto"))
    if town != "Mulchén" or not agricultural_site or not in_person:
        return None
    return {
        "work_commune": "Mulchén",
        "employer": "Empresa agrícola no identificada (OMIL Mulchén)",
        "application_evidence": True,
        "official_index_open_verified": True,
        "official_open_index_url": index_url,
        "date_source_method": "original_not_reported_official_index_open",
        "application_method": "in_person_omil",
    }

def chiletrabajos_metadata(soup, title, url):
    """Read the individual portal's explicit metadata, never a search-page guess."""
    if not re.search(r"^https://(?:www\.)?chiletrabajos\.cl/trabajo/",url,re.I):
        return None
    text=soup.get_text(" ",strip=True)[:13000]
    employer=None
    match=re.search(r"\bBuscado\s+(.{2,120}?)\s+Fecha\s+(20\d{2}-\d{2}-\d{2})\b",text,re.I)
    if match:
        employer=match.group(1).strip(" -|:")
    city=None
    match=re.search(r"\bUbicaci[oó]n\s+(.{2,110}?)\s+Categor[ií]a\b",text,re.I)
    if match:
        location=fold(match.group(1))
        for place in COMMUNES:
            if re.search(r"(?<!\w)"+re.escape(fold(place))+r"(?!\w)",location):
                city=place
                break
    # The portal's posting city may be a recruitment address, not the worksite.
    # Prefer an explicitly named job site supported by the actual description.
    if re.search(r"\bHospital\s+de\s+Nacimiento\b",text,re.I) and re.search(r"\bNacimiento\b",title,re.I):
        city="Nacimiento"
    explicit=explicit_work_commune(text)
    if explicit:
        city=explicit
    elif city and not re.search(r"(?<!\w)"+re.escape(fold(city))+r"(?!\w)",fold(title)):
        # Portal 'Ubicación' may be the recruiting office, not the
        # workplace. Title agreement is minimum corroboration when
        # the job description omits the execution site.
        city=None
    expiry=re.search(r"\bExpira\s+(20\d{2}-\d{2}-\d{2})\b",text,re.I)
    closed=bool(expiry and datetime.strptime(expiry.group(1),"%Y-%m-%d").date()<NOW.date())
    application=bool(re.search(r"\bPostular\b|\benv[ií]a\s+tu\s+curr[ií]culum\b|\benv[ií]a\s+tu\s+cv\b",text,re.I))
    return {"employer":employer if employer and len(employer)<=140 else None,
            "work_commune":city,"application_evidence":application,"source_closed":closed,
            "deadline":expiry.group(1) if expiry else None}

def hiringroom_metadata(soup, title, url):
    """Primary employer ATS evidence only. Relative time is not an original calendar date."""
    if not re.fullmatch(r"https://fashionspark\.hiringroom\.com/jobs/get_vacancy/[a-f0-9]{24}(?:\?.*)?",url,re.I):
        return None
    text=soup.get_text(" ",strip=True)[:6000]
    m=re.search(r"(?<!\w)(Angol|Victoria|Collipulli|Ercilla|Lumaco|Los Sauces|Purén|Renaico|Traiguén|Mulchén|Negrete|Nacimiento)\s*,\s*Araucan[ií]a\s*,\s*Chile",text,re.I)
    if not m:
        m=re.search(r"(?<!\w)(Mulchén|Negrete|Nacimiento)\s*,\s*Biob[ií]o\s*,\s*Chile",text,re.I)
    site=next((x for x in COMMUNES if fold(x)==fold(m.group(1))),None) if m else None
    heading=soup.find(["h1","h2"])
    name=heading.get_text(" ",strip=True)[:180] if heading else re.split(
        r"\b(?:Angol|Victoria|Collipulli|Ercilla|Lumaco|Los Sauces|Pur[eé]n|Renaico|Traigu[eé]n|Mulch[eé]n|Negrete|Nacimiento),\s*(?:Araucan[ií]a|Biob[ií]o)",title,1,flags=re.I)[0][:180].strip()
    if not re.search(r"Descripci[oó]n del puesto|Requisitos|Postularse",text,re.I):
        return None
    return {"title":name,"employer":"Fashion's Park","work_commune":site,
            "application_evidence":bool(re.search(r"\bPostularse\b",text,re.I)),
            "date_source_method":"relative_only_not_verified"}

def explicit_deadline_date(body):
    """Parse a stated deadline; never use the crawler date as the closing date."""
    cue = r"(?:expira|vence|hasta(?:\s+el)?|cierre(?:\s+de\s+postulaciones?)?|plazo(?:\s+de\s+postulaciones?)?)"
    patterns = (
        cue + r"\s*[:\-]?\s*(20\d{2}-\d{2}-\d{2})",
        cue + r"\s*[:\-]?\s*(\d{1,2})[/-](\d{1,2})[/-](20\d{2})",
        cue + r"\s*[:\-]?\s*(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de(?:l)?\s+)?(20\d{2})"
    )
    months = {"enero":1,"febrero":2,"marzo":3,"abril":4,"mayo":5,"junio":6,
              "julio":7,"agosto":8,"septiembre":9,"setiembre":9,"octubre":10,
              "noviembre":11,"diciembre":12}
    for index, pattern in enumerate(patterns):
        match = re.search(pattern, body, re.I)
        if not match:
            continue
        try:
            if index == 0:
                deadline = datetime.strptime(match.group(1), "%Y-%m-%d").date()
            elif index == 1:
                deadline = datetime(int(match.group(3)), int(match.group(2)), int(match.group(1))).date()
            else:
                month = months.get(match.group(2).casefold())
                if not month:
                    continue
                deadline = datetime(int(match.group(3)), month, int(match.group(1))).date()
            return deadline
        except ValueError:
            continue
    return None


def explicit_deadline_expired(body, today=None):
    """Only explicit closing/deadline evidence can mark a vacancy as expired."""
    deadline=explicit_deadline_date(body)
    return deadline is not None and deadline < (today or NOW.date())

def inspect(seed):
    town,source,url=seed[:3]
    # Optional persisted source-attempt ordinal: rotate among excess jobs
    # so the first 35 DOM links do not permanently starve other vacancies.
    previous_attempts=max(0,int(seed[3])) if len(seed)>3 else 0
    out={"commune":town,"source":source,"url":url,"status":"not_started",
         "checked_at":NOW.isoformat(),"http":None,"links_found":0,
         "details_opened":0,"candidates":[],"errors":[],
         "documents_for_review":[]}
    try:
        if source_is_official_cmpc(url):
            # The Cornerstone career homepage is Javascript-only. Query its
            # public, official job-search endpoint (already in AppDeploy).
            # Do NOT treat a generic HTTP 200 index with zero links as proof
            # that CMPC has no vacancies within our twelve communes.
            result=read_cmpc_requisitions(today=NOW.date())
            out.update({k:v for k,v in result.items() if k!="candidates"})
            out["candidates"]=result["candidates"]
            for candidate in out["candidates"]:
                candidate["id"]=key(candidate["url"])
                candidate["date_recent_2d"]=(
                    candidate["date_source"] >= (NOW.date()-timedelta(days=1)).isoformat())
                candidate["express_ready"]=candidate["date_recent_2d"]
            out["source_reader"]="official_cmpc_cornerstone_json"
            out["links_found"]=len(out["candidates"])
            out["details_opened"]=len(out["candidates"])
            if result.get("official_api_error"):
                out["errors"].append(result["official_api_error"])
            return out
        municipal=None
        is_municipal_index=(source.startswith(("Municipio ","Municipalidad "))
            and urlsplit(url).hostname.lower().removeprefix("www.") in MUNICIPAL_FEED_SITES)
        if is_municipal_index:
            municipal=discover_municipal(url,limit=12)
            out["municipal_feed_status"]=municipal["status"]
            out["municipal_feed_checked"]=municipal["checked"]
            out["municipal_feed_links"]=municipal["links_found"]
            out["municipal_feed_sources_blocked"]=municipal["sources_blocked"]
        status,soup,reason=request_page(url)
        out["http"]=status
        if status==200 and soup is not None and official_safco_home(url):
            # SAFCO publishes per-role OPEN cards on its official homepage
            # without dates or stable vacancy URLs. Capture all for B/C review,
            # but never synthesize publication dates or auto-approve them.
            cards=extract_open_safco_cards(soup,url)
            out["source_reader"]="safco_embedded_cards_review_only"
            out["embedded_open_cards"]=len(cards)
            out["candidates"]=cards
            out["links_found"]=len(cards)
            out["details_opened"]=len(cards)
            out["status"]="scanned_with_candidates" if cards else "scanned_no_candidates"
            return out
        if status!=200 or soup is None:
            if not municipal or not municipal["pages"]:
                out["status"]="http_restricted" if status in (401,403,406,429) else (reason or "http_error")
                return out
            # A blocked municipal homepage does not block an independently
            # authorized feed. Continue with its candidates, not an empty
            # fictitious HTML source.
            out["index_status"]="blocked_but_authorized_feed_accessible"
            soup=BeautifulSoup("","html.parser")
        national_fallback=False
        links_base=url
        if source.startswith(("Chiletrabajos · ","Portal Chiletrabajos · ")) and not urlsplit(url).path.startswith("/trabajo/"):
            heading=soup.select_one("h1")
            page_title=soup.title
            heading_text=heading.get_text(" ",strip=True) if heading else ""
            title_text=page_title.get_text(" ",strip=True) if page_title else ""
            # A query result without verified territorial heading is NOT
            # evidence of zero jobs in that town.
            label=fold(" ".join((heading_text,title_text)))
            territory=fold(town)
            out["index_scope_confirmed"]=bool(
                re.search(r"\btrabajos?\s+en\s+"+re.escape(territory)+r"\b",label))
            if not out["index_scope_confirmed"]:
                out["index_heading"]=heading_text[:120]
                out["index_page_title"]=title_text[:120]
                out["errors"].append("chiletrabajos_territory_heading_missing")
                links_base=chiletrabajos_fallback_url(town)
                out["fallback_url"]=links_base
                out["fallback_query_is_territorially_scoped"]=False
                fallback_status,fallback_soup,fallback_reason=request_page(links_base)
                out["fallback_http"]=fallback_status
                if fallback_status!=200 or fallback_soup is None:
                    out["status"]="search_filter_not_confirmed"
                    out["fallback_error"]=fallback_reason or (
                        "fallback_http_"+str(fallback_status))
                    return out
                soup=fallback_soup
                national_fallback=True
        # A successful HTTP 200 does not imply complete scanning of an index
        # when it exposes more than the current 35-detail budget or >500 links.
        # Keep scanning 35 safely, but mark the source as NOT fully covered,
        # so a pagination/structured adapter is a mandatory next action.
        index_all=links_from(soup,links_base,limit=None)
        index_raw_anchors=len(soup.select("a[href]"))
        detail_budget=35
        index_count=len(index_all)
        rotation_offset=((previous_attempts*detail_budget)%index_count
                         if index_count>detail_budget else 0)
        links=(index_all[rotation_offset:rotation_offset+detail_budget]
               if index_count<=detail_budget else
               (index_all+index_all)[rotation_offset:rotation_offset+detail_budget])
        out["index_rotation_offset"]=rotation_offset
        out["index_candidates_selected"]=len(links)
        out["index_candidates_detected"]=index_count
        out["index_anchor_count"]=index_raw_anchors
        out["index_incomplete"]=index_count>detail_budget or index_raw_anchors>500
        if out["index_incomplete"]:
            out["errors"].append("source_index_partially_read_recovery_required")
        if municipal:
            known={row[0] for row in links}
            for row in municipal["pages"]:
                if row["url"] not in known and len(links)<35:
                    links.append((row["url"],row["anchor"],"not_indicated"))
                    known.add(row["url"])
            out["documents_for_review"]=(
                [] if is_broad_municipal_index(url)
                else documents_from_page(url,str(soup),limit=10))
        parsed_seed=urlsplit(url)
        # First-party individual job pages can be audited directly; never
        # reinterpret them as category/index pages with zero discovered links.
        if (parsed_seed.hostname in ("www.chiletrabajos.cl","chiletrabajos.cl")
            and parsed_seed.path.startswith("/trabajo/")):
            # This seed is a single known job, not a catalog. Related-job
            # links on its HTML page do not make the seed itself truncated.
            out["index_incomplete"]=False
            heading=soup.select_one("h1") or soup.select_one("h2")
            title=heading.get_text(" ",strip=True)[:180] if heading else ""
            if len(title)<5 or fold(title).strip() in ("trabajo","oferta laboral"):
                document_title=soup.title.get_text(" ",strip=True) if soup.title else ""
                title=document_title.split("|",1)[0].strip()[:180]
            # The official portal may render job details without an H1. A
            # first-party individual URL and coherent page title justify
            # attempting a detail read, NOT bypassing evidence verification.
            links=[(url,title,"not_indicated")] if len(title)>=5 else []
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
                code,detail_soup,detail_reason=(200,soup,None) if detail_url==url else request_page(detail_url)
                detail["http"]=code
                if code==200 and detail_soup is not None:
                    title=informative_job_title(detail_soup,label)
                    body=focused_job_text(detail_soup)
                    if municipal:
                        detail["linked_documents_for_review"]=documents_from_page(
                            detail_url,str(detail_soup),limit=2)
                    dates=dates_in(detail_soup)
                    official_open=municipal_open_official_evidence(
                        town,source,url,detail_url,index_status,body)
                    # Many WordPress themes split the actual vacancy into
                    # multiple article/content blocks. The focused first block
                    # may omit the in-person OMIL instructions further down.
                    # Check the SAME fetched original page, never another URL.
                    municipal_full_body=""
                    if index_status=="open" and source=="Municipio Mulchén empleos":
                        # The municipal WordPress theme has very long menus.
                        # An arbitrary 7k/16k text prefix cuts off the actual
                        # in-person application instructions AFTER the role.
                        all_page_text=detail_soup.get_text(" ",strip=True)
                        start=re.search(
                            r"empresa del rubro agr[ií]cola de la comuna de Mulch[eé]n",
                            all_page_text,re.I)
                        if start:
                            municipal_full_body=all_page_text[start.start():start.start()+22000]
                        if not official_open and municipal_full_body:
                            official_open=municipal_open_official_evidence(
                                town,source,url,detail_url,index_status,municipal_full_body)
                    job_commune=explicit_work_commune(body)
                    detail["explicit_worksite_commune"]=job_commune
                    employer=explicit_employer(body)
                    application_evidence=explicit_application(body)
                    if index_status=="open" and source=="Municipio Mulchén empleos":
                        normalized_body=fold(municipal_full_body or body)
                        detail["municipal_open_evidence_checks"]={
                            "agriculture": "empresa del rubro agricola de la comuna de mulchen" in normalized_body,
                            "worksite": "predio ubicado en el sector campamento" in normalized_body,
                            "crop": "cosecha de arandanos" in normalized_body,
                            "instructions": "interesados" in normalized_body and "presentar" in normalized_body,
                            "omil": "oficina omil" in normalized_body,
                            "street": "anibal pinto" in normalized_body,
                            "document": "documentacion" in normalized_body,
                        }
                    if official_open:
                        job_commune=official_open["work_commune"]
                        employer=employer or official_open["employer"]
                        application_evidence=True
                    portal=chiletrabajos_metadata(detail_soup,title,detail_url)
                    if portal:
                        job_commune=portal["work_commune"] or job_commune
                        employer=portal["employer"] or employer
                        application_evidence=portal["application_evidence"] or application_evidence
                    # Company-specific Chiletrabajos pages expose an original
                    # absolute date beside the employer, not under "Fecha".
                    # Their recruitment city is never the execution commune.
                    company_page=read_employer_vacancy(
                        detail_soup,detail_url,label,explicit_work_commune,as_of=NOW.date())
                    if company_page:
                        if company_page["title"]:
                            title=company_page["title"]
                        employer=company_page["employer"] or employer
                        job_commune=company_page["work_commune"] or job_commune
                        application_evidence=company_page["application_evidence"] or application_evidence
                        # When this is a company-specific page, an unrelated
                        # date in the body/meta is not posting-date evidence.
                        dates=([company_page["date_source"]]
                               if company_page["date_source"] else [])
                    primary_ats=hiringroom_metadata(detail_soup,title,detail_url)
                    if primary_ats:
                        title=primary_ats["title"]
                        job_commune=primary_ats["work_commune"] or job_commune
                        employer=primary_ats["employer"] or employer
                        application_evidence=primary_ats["application_evidence"] or application_evidence
                    if urlsplit(detail_url).hostname in ("jobs.arauco.com","www.jobs.arauco.com"):
                        employer="ARAUCO"  # Verified first-party ATS; never infer work commune.
                    # Closed labels and internal-only calls are not public job vacancies.
                    deadline=explicit_deadline_date(body)
                    if company_page and company_page.get("deadline"):
                        deadline=datetime.strptime(company_page["deadline"],"%Y-%m-%d").date()
                    if portal and portal.get("deadline"):
                        portal_expiry=datetime.strptime(portal["deadline"],"%Y-%m-%d").date()
                        deadline=deadline or portal_expiry
                    explicit_closed=bool(CLOSED.search(title+" "+label+" "+body) or (deadline and deadline<NOW.date()) or (portal and portal["source_closed"]) or (company_page and company_page["source_closed"]))
                    public_title=title if len(title)>10 else label
                    internal_only=bool(INTERNAL_ONLY.search(public_title+" "+label))
                    general_index=bool(GENERAL_INDEX.fullmatch(public_title.strip()))
                    detail.update(title=public_title,dates=dates,
                                  source_date_method=(company_page or {}).get("date_source_method") or (
                                      official_open or {}).get("date_source_method"),
                                  official_index_open_verified=bool(official_open),
                                  official_open_index_url=(official_open or {}).get("official_open_index_url"),
                                  application_method=(official_open or {}).get("application_method"),
                                  work_commune=job_commune,source_commune_not_confirmed=job_commune is None,
                                  employer=employer,application_evidence=application_evidence,
                                  date_source=dates[0] if dates else None,
                                  deadline=deadline.isoformat() if deadline else None,
                                  evidence="closed" if (explicit_closed or index_status=="closed") else (
                                      "internal_only" if internal_only else (
                                      "directory_not_offer" if general_index else (
                                      "individual_page_with_job_terms" if TERMS.search(public_title+" "+body[:1600])
                                      else "inconclusive_page"))),
                                  excerpt=redact(body[:550]))
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
        # Bound same-host detail requests while concurrent commune seeds run.
        with ThreadPoolExecutor(max_workers=5) as pool:
            out["candidates"]=list(pool.map(inspect_detail,links))
        if municipal:
            docs=out["documents_for_review"]
            seen_docs={doc["url"] for doc in docs}
            for item in out["candidates"]:
                for doc in item.pop("linked_documents_for_review",[]):
                    if doc["url"] not in seen_docs and len(docs)<16:
                        seen_docs.add(doc["url"])
                        docs.append(doc)
            # PDF evidence is DOCUMENT REVIEW ONLY. Never add a PDF
            # to candidates accepted by Motor D's publication classifier.
            out["documents_for_review"]=docs
        if national_fallback:
            verified=[]
            out["fallback_details_seen"]=len(out["candidates"])
            out["fallback_rejected_nonlocal_or_unknown"]=0
            out["fallback_pending_worksite_confirmation"]=0
            for item in out["candidates"]:
                # Never infer local employment from a national search, from
                # the recruiting city, or from a person named after the town.
                if item.get("work_commune")!=town:
                    out["fallback_rejected_nonlocal_or_unknown"]+=1
                    continue
                # Only explicit worksite wording from the individual vacancy
                # is enough for automatic classification. Agreement between
                # portal city and title is a lead, not proof of execution.
                if item.get("http")==200 and item.get("evidence")=="individual_page_with_job_terms":
                    if item.get("explicit_worksite_commune") != town:
                        item["source_commune_not_confirmed"]=True
                        item["express_ready"]=False
                        out["fallback_pending_worksite_confirmation"]+=1
                verified.append(item)
            out["candidates"]=verified
        # Los comunicados de empleo individuales usados como semilla también son
        # candidatos propios; no depender de que tengan enlaces internos.
        source_path=urlsplit(url).path.rstrip("/").lower()
        if "/oferta-laboral-" in source_path or "/convocatoria-laboral-" in source_path:
            heading=informative_job_title(soup,"")
            body=focused_job_text(soup)
            if (TERMS.search(heading) or "oferta-laboral-" in source_path) and re.search(
                    r"requisitos|postulaci[oó]n|curr[ií]culum|omil|se requiere",body,re.I):
                dates=dates_in(soup)
                detail={"id":key(url),"url":url,"label":heading,"title":heading,
                        "date_source":dates[0] if dates else None,"dates":dates,
                        "deadline":explicit_deadline_date(body).isoformat() if explicit_deadline_date(body) else None,
                        "http":200,"evidence":"closed" if (CLOSED.search(heading+" "+body) or explicit_deadline_expired(body)) else (
                            "internal_only" if INTERNAL_ONLY.search(heading) else "individual_page_with_job_terms"),
                        "work_commune":None,"recruitment_commune":None,
                        "source_scope_commune":town,"source_commune_not_confirmed":True,
                        "excerpt":redact(body[:550])}
                if dates:
                    try:
                        date=datetime.strptime(dates[0],"%Y-%m-%d").date()
                        detail["date_recent_2d"]=(NOW.date()-timedelta(days=1))<=date<=NOW.date()
                    except ValueError:pass
                if not any(x["id"]==detail["id"] for x in out["candidates"]):
                    out["candidates"].append(detail)
        out["details_opened"]=sum(x.get("http")==200 and x.get("evidence") not in
                                   ("detail_unavailable","link_candidate_only") for x in out["candidates"])
        out["status"]=("scanned_partial_index" if out.get("index_incomplete") else
                       ("scanned_with_candidates" if out["candidates"] else
                        ("fallback_no_verified_target_offers" if national_fallback
                         else "scanned_no_candidates")))
    except requests.exceptions.RequestException as exc:
        out["status"]="network_error";out["errors"].append(type(exc).__name__)
    except Exception as exc:
        out["status"]="processing_error";out["errors"].append(type(exc).__name__)
    return out
def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    # Every source registered in both catalogs is attempted on every cycle.
    # History changes priority, NEVER the size of the complete scan.
    performance_file=ROOT/"source_performance.json"
    try:
        previous=json.loads(performance_file.read_text(encoding="utf-8")) if performance_file.exists() else {}
        if not isinstance(previous,dict):previous={}
    except (ValueError,OSError):previous={}
    ordered=ranked_sources(SOURCE_PLAN,previous)
    seeds=[(x["anchor"],x["name"],x["url"],
            int(previous.get(x["id"],{}).get("attempts",0)))
           for x in ordered]
    with ThreadPoolExecutor(max_workers=8) as pool:
        rows=list(pool.map(inspect,seeds))
    # Operational evidence for the employer ATS that formerly looked empty.
    # A HTTP 200 is not coverage unless official API pagination is complete.
    for cm in rows:
        if source_is_official_cmpc(cm.get("url")):
            print("MOTOR_D_CMPC_API "+json.dumps({
                "source":cm["source"],
                "http":cm.get("http"),
                "reader":cm.get("source_reader"),
                "status":cm.get("status"),
                "pages":cm.get("official_api_pages"),
                "jobs_scanned":cm.get("official_api_job_records_examined"),
                "eligible_local_jobs":cm.get("official_api_candidates"),
                "index_complete":cm.get("official_api_index_complete"),
                "error":cm.get("official_api_error"),
                "rejected_reasons":cm.get("official_api_reason_counts")
            },ensure_ascii=False),flush=True)
    for sf in rows:
        if official_safco_home(sf.get("url")):
            print("MOTOR_D_SAFCO_CARDS "+json.dumps({
                "source":sf.get("source"),
                "http":sf.get("http"),
                "reader":sf.get("source_reader"),
                "open_cards_for_review":sf.get("embedded_open_cards"),
                "status":sf.get("status"),
                "titles":[x.get("title") for x in sf.get("candidates",[])][:8],
                "date_and_application_unverified":True
            },ensure_ascii=False),flush=True)
    source_coverage=assess_source_coverage(SOURCE_PLAN,rows,previous)
    updated_performance=learn_source_performance(previous,rows,NOW.isoformat())
    performance_file.write_text(json.dumps(
        updated_performance,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    recovery_plan=build_recovery_queue(
        source_coverage,NOW.isoformat(),updated_performance)
    (ROOT/"source_recovery_queue.json").write_text(
        json.dumps(recovery_plan,ensure_ascii=False,indent=2)+"\n",
        encoding="utf-8")
    print("MOTOR_D_SOURCE_RECOVERY "+json.dumps({
        "pending":recovery_plan["total_pending"],
        "groups":recovery_plan["group_counts"],
        "all_sources_preserved":recovery_plan["all_sources_preserved"]
    },ensure_ascii=False),flush=True)
    indeed_rows=[r for r in rows if r["source"].startswith(("Indeed · ","Portal Indeed · "))]
    print("MOTOR_D_SOURCE_INVENTORY "+json.dumps({
        k:source_coverage[k] for k in ("registered_total","automatic_registered",
        "social_registered","automatic_attempted","not_attempted","unresolved_total",
        "all_registered_sources_accessible")},ensure_ascii=False),flush=True)
    indeed_coverage={
        "sources_attempted":len(indeed_rows),
        "base_searches":sum(x["source"].startswith("Indeed · ") for x in indeed_rows),
        "extended_searches":sum(x["source"].startswith("Portal Indeed · ") for x in indeed_rows),
        "sources_accessible":sum(x["status"].startswith("scanned") for x in indeed_rows),
        "sources_blocked":sum(x["status"] in ("http_restricted","network_error","redirect_not_authorized","source_url_not_authorized","search_filter_not_confirmed") for x in indeed_rows),
        "per_commune":{x["commune"]:{"http":x["http"],"status":x["status"],
            "candidates":len(x["candidates"])} for x in indeed_rows},
        "remediation":"employer_ats_first_no_indeed_bypass",
        "complete":all(x["status"].startswith("scanned") for x in indeed_rows),
    }
    print("MOTOR_D_INDEED_CRITICAL "+json.dumps(indeed_coverage,ensure_ascii=False),flush=True)
    scanned={r["commune"] for r in rows}
    missing=sorted(set(COMMUNES)-scanned)
    # Do NOT count transient A leads as permanently registered sources. They
    # are independent ORIGINAL URL probes; D must re-fetch them individually.
    a_handoff=read_motor_a_review(now=NOW)
    a_rows=[]
    if a_handoff["probes"]:
        # Do not burst 22 simultaneous requests against the same first-party
        # Chiletrabajos host. A's review queue is a bounded, lower-priority pass.
        with ThreadPoolExecutor(max_workers=2) as pool:
            a_rows=list(pool.map(inspect,a_handoff["probes"]))
    a_handoff_report={k:v for k,v in a_handoff.items() if k!="probes"}
    from collections import Counter
    a_http_status=Counter(str(x.get("http") or 0) for x in a_rows)
    a_outcomes=Counter(str(x.get("status") or "unknown") for x in a_rows)
    a_handoff_report.update({
        "fetched":len(a_rows),
        "http_200":sum(r.get("http")==200 for r in a_rows),
        "individual_candidates":sum(len(r["candidates"]) for r in a_rows),
        "http_status_counts":dict(a_http_status),
        "inspection_outcomes":dict(a_outcomes),
        "failed_source_examples":[
            {"url":x["url"],"http":x.get("http"),"status":x.get("status"),
             "errors":x.get("errors",[])[:2]}
            for x in a_rows if x.get("http")!=200][:5],
        "handoff_read_failed":bool(a_rows and not any(x.get("http")==200 for x in a_rows)),
        "verified_or_published":0,
    })
    print("MOTOR_A_TO_D_HANDOFF "+json.dumps(a_handoff_report,ensure_ascii=False),flush=True)
    # One employer portal can serve all 12 towns. Its worker anchor is NOT
    # proof of the job's execution city (e.g. SERFONAC sources anchored Angol).
    candidates=[dict(x,source=y["source"],commune=x.get("work_commune"),
                     crawler_commune=y["commune"]) for y in rows+a_rows for x in y["candidates"]]
    documents_for_review=[]
    seen_documents=set()
    for row in rows:
        for document in row.get("documents_for_review",[]):
            if document["url"] not in seen_documents:
                seen_documents.add(document["url"])
                documents_for_review.append(dict(document,
                    source=row["source"],commune=row["commune"]))
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
    # National/regional sites cover several communes with one request.
    # Report every registered commune association, not just the anchor
    # assigned to the HTTP worker, or coverage looks artificially small.
    per_commune={
        town:{
            "sources_registered":source_coverage["per_commune"][town]["registered"],
            "sources_attempted":source_coverage["per_commune"][town]["registered"]-
                                source_coverage["per_commune"][town]["unvisited"]-
                                source_coverage["per_commune"][town]["social_unread"],
            "sources_accessible":source_coverage["per_commune"][town]["accessible"],
            "sources_blocked":source_coverage["per_commune"][town]["blocked"],
            "sources_unvisited":source_coverage["per_commune"][town]["unvisited"],
            "social_sources_unread":source_coverage["per_commune"][town]["social_unread"],
            "needs_geofilter":source_coverage["per_commune"][town]["needs_geofilter"],
            "needs_specialized_reader":source_coverage["per_commune"][town]["needs_specialized_reader"],
            "links_found":sum(x["links_found"] for x in rows if x["commune"]==town),
            "candidates":sum(y.get("work_commune")==town
                               for x in rows for y in x["candidates"]),
            "candidate_worksites_unconfirmed":sum(y.get("work_commune") is None
                               for x in rows if x["commune"]==town for y in x["candidates"]),
        } for town in COMMUNES
    }
    excluded={"closed","internal_only","directory_not_offer","inconclusive_page","detail_unavailable"}
    eligible=[x for x in unique.values() if x.get("evidence")=="individual_page_with_job_terms"]
    report={"schema_version":2,"date":NOW.isoformat(),"scope":"today_and_yesterday",
            "communes_expected":COMMUNES,"communes_visited":sorted(scanned),
            "missing_communes":missing,"sources_total":len(rows),"indeed_critical":indeed_coverage,
            "source_inventory":source_coverage,
            "motor_a_review_handoff":a_handoff_report,
            "commune_status":per_commune,
            "communes_with_accessible_source":sum(v["sources_accessible"]>0 for v in per_commune.values()),
            "communes_without_accessible_source":[k for k,v in per_commune.items() if not v["sources_accessible"]],
            "sources_accessible":sum(r["status"].startswith("scanned") for r in rows),
            "sources_blocked":sum(r["status"] in ("http_restricted","network_error") for r in rows),
            "municipal_feed_sources_accessible":sum(
                sum(ch.get("status")=="usable" for ch in r.get("municipal_feed_checked",[]))
                for r in rows),
            "municipal_document_review_count":len(documents_for_review),
            "documents_for_review":documents_for_review,
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
