"""Municipal WordPress/RSS source adapter, read-only and fail-closed.

Feed posts are leads, not approved jobs. A municipal press release, its
date, or its recruiting address cannot establish a vacancy's worksite or
original publication date. Embedded PDFs always go to documentary review.

P0 scope: Negrete, Victoria, Renaico, Purén and Traiguén. All 12 communes
remain in the territorial engine; blocked/unconnected sources are recorded.
"""
from __future__ import annotations

import html
import json
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

try:
    from .trabajo_cerca_lector_documental import allowed, fetch_bytes, robots_ok
except ImportError:
    from trabajo_cerca_lector_documental import allowed, fetch_bytes, robots_ok


SITES = {
    "muninegrete.cl": ("Negrete", ("/wp-json/wp/v2/posts?per_page=20", "/feed/")),
    "victoriachile.cl": ("Victoria", (
        "/category/omil/feed/", "/category/concursos-publicos/feed/",
        "/wp-json/wp/v2/posts?per_page=20", "/feed/")),
    "municipalidadrenaico.cl": ("Renaico", (
        "/wp-json/wp/v2/posts?per_page=20", "/feed/")),
    "munipuren.cl": ("Purén", (
        "/wp-json/wp/v2/posts?per_page=20", "/feed/")),
    # Traiguén's WordPress API requires credentials; only the public
    # listing HTML is consumed, with PDF applications sent to review.
    "mtraiguen.cl": ("Traiguén", ("/category/bolsa-de-empleo-o-concurso/",)),
}
# Signal needs to indicate a job/selection process. Bare "concurso", "beca",
# a municipality name or "pro empleo" is insufficient.
JOB_SIGNAL = re.compile(
    r"\b(?:oferta(?:s)?\s+laboral(?:es)?|vacante(?:s)?\s+(?:laboral(?:es)?|de\s+empleo)|"
    r"bolsa\s+de\s+empleo|(?:se\s+(?:necesita|requiere|busca))\s+(?:personal|"
    r"operari[oa]s?|profesionales?|t[eé]cnic[oa]s?|conductor(?:es)?|"
    r"trabajador(?:es)?|auxiliares?)|"
    r"llamado\s+a\s+concurso\s+p[uú]blico|"
    r"concurso\s+p[uú]blico\s+(?:para|de|por)|"
    r"bases\s+(?:para\s+)?(?:el\s+)?llamado\s+a\s+concurso|"
    r"convocatoria\s+(?:laboral|de\s+(?:personal|profesionales?|trabajadores?))|"
    r"postulaci[oó]n(?:es)?\s+(?:laboral(?:es)?|a\s+(?:cargo|vacante)))\b", re.I)
NOT_JOBS = re.compile(
    r"\b(?:concurso\s+(?:literario|fotogr[aá]fico|de\s+(?:innovaci[oó]n|"
    r"emprendimiento|dibujo))|taller(?:es)?\s+de\s+pro\s+empleo|"
    r"feria\s+laboral|fondos?\s+concursables?|"
    r"subsidio\s+el[eé]ctrico|capacitaci[oó]n(?:es)?|"
    r"proyecto(?:s)?\s+de\s+emprendimiento)\b", re.I)


def _host(url: str) -> str:
    try:
        part = urlsplit(url)
        return (part.hostname or "").lower().removeprefix("www.")
    except (ValueError, TypeError):
        return ""


def municipal_url(raw: str, index_url: str, pdf_only=False) -> str | None:
    """Only same-host allowlisted HTTPS URLs without credentials or tokens."""
    if not isinstance(raw, str) or not raw or len(raw) > 2000:
        return None
    absolute = urljoin(index_url, html.unescape(raw.strip()))
    if (_host(absolute) != _host(index_url) or
            _host(index_url) not in SITES or not allowed(absolute)):
        return None
    parsed = urlsplit(absolute)
    if parsed.fragment or any(key in parsed.query.lower() for key in (
        "access_token=", "api_key=", "session=", "token=")):
        return None
    if pdf_only and not parsed.path.lower().endswith(".pdf"):
        return None
    if not pdf_only and (
            parsed.path.lower().endswith((".pdf", ".jpg", ".png", ".zip")) or
            re.search(r"/(?:wp-json|category|tag|feed|wp-admin|login)(?:/|$)",parsed.path,re.I)):
        return None
    return absolute


def clean_title(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", value or ""))).strip()[:180]


def has_job_signal(text: str) -> bool:
    return bool(JOB_SIGNAL.search(text or "") and not NOT_JOBS.search(text or ""))


def parse_wp_posts(body: bytes, base: str, limit=20) -> list[dict]:
    """Parse real WordPress REST posts; no publishable date inferred."""
    records = json.loads(body.decode("utf-8"))
    if not isinstance(records, list):
        raise ValueError("wp_json_invalid")
    output=[]
    for row in records[:limit*2]:
        if not isinstance(row, dict) or row.get("status","publish") not in ("publish",None):
            continue
        title = clean_title((row.get("title") or {}).get("rendered","")
                            if isinstance(row.get("title"),dict) else "")
        excerpt = clean_title((row.get("excerpt") or {}).get("rendered","")
                              if isinstance(row.get("excerpt"),dict) else "")
        if not has_job_signal(title+" "+excerpt[:260]):
            continue
        url=municipal_url(row.get("link"),base)
        if url:
            output.append({"url":url,"anchor":title,"kind":"local_page",
                           "origin":"wordpress","review_required":True,
                           "feed_date_unverified":row.get("date")})
        if len(output)>=limit:
            break
    return output


def parse_rss(body: bytes, base: str, limit=20) -> list[dict]:
    """Read RSS or Atom safely; XML alone never proves an open vacancy."""
    if len(body)>650_000 or b"<!DOCTYPE" in body.upper() or b"<!ENTITY" in body.upper():
        raise ValueError("xml_unsafe_or_oversized")
    root=ET.fromstring(body)
    items=root.findall("./channel/item")
    if not items:
        items=root.findall(".//{http://www.w3.org/2005/Atom}entry")
    output=[]
    for row in items[:limit*2]:
        title=clean_title(row.findtext("title") or row.findtext(
            "{http://www.w3.org/2005/Atom}title") or "")
        desc=clean_title(row.findtext("description") or row.findtext(
            "{http://www.w3.org/2005/Atom}summary") or "")
        if not has_job_signal(title+" "+desc[:260]):
            continue
        link=row.findtext("link") or ""
        if not link:
            atom=row.find("{http://www.w3.org/2005/Atom}link")
            link=atom.attrib.get("href","") if atom is not None else ""
        url=municipal_url(link,base)
        if url:
            output.append({"url":url,"anchor":title,"kind":"local_page",
                           "origin":"rss","review_required":True,
                           "feed_date_unverified":row.findtext("pubDate")})
        if len(output)>=limit:
            break
    return output


class _ArticleLinks(HTMLParser):
    """Public article links, excluding menu and unrelated navigation."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.current=None
        self.links=[]
        self.ignored=0

    def handle_starttag(self,tag,attrs):
        if tag in ("nav","header","footer"):
            self.ignored+=1
        if tag=="a" and not self.ignored and self.current is None:
            self.current=[dict(attrs).get("href",""),[]]

    def handle_data(self,text):
        if self.current is not None and not self.ignored:
            self.current[1].append(text)

    def handle_endtag(self,tag):
        if tag=="a" and self.current is not None:
            self.links.append((self.current[0]," ".join(self.current[1])))
            self.current=None
        if tag in ("nav","header","footer"):
            self.ignored=max(0,self.ignored-1)


def parse_html_posts(body: bytes, base: str, limit=20) -> list[dict]:
    parser=_ArticleLinks()
    parser.feed(body[:650_000].decode("utf-8","replace"))
    result=[]
    seen=set()
    for href,label in parser.links:
        url=municipal_url(href,base)
        if not url or url in seen:
            continue
        title=clean_title(label)
        # Public municipal posts may have title in URL slug, but a weak
        # generic label alone is not sufficient to create a job lead.
        signal=title+" "+urlsplit(url).path.replace("-"," ").replace("_"," ")
        if not has_job_signal(signal):
            continue
        seen.add(url)
        result.append({"url":url,"anchor":title or "Publicación municipal",
                       "kind":"local_page","origin":"municipal_html",
                       "review_required":True,"feed_date_unverified":None})
        if len(result)>=limit:
            break
    return result


class _PdfLinks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.candidates=[]
        self.anchor=None

    def handle_starttag(self,tag,attrs):
        props=dict(attrs)
        if tag=="a":
            self.anchor=[props.get("href",""),[]]
        for key in (("src","data-emsrc") if tag in ("iframe","embed") else
                    ("data","data-emsrc") if tag=="object" else
                    ("data-emsrc",) if tag=="div" else ()):
            if props.get(key):
                self.candidates.append((props[key],"documento_embebido"))

    def handle_data(self,text):
        if self.anchor is not None:
            self.anchor[1].append(text)

    def handle_endtag(self,tag):
        if tag=="a" and self.anchor is not None:
            href,labels=self.anchor
            self.candidates.append((href," ".join(labels)[:120]))
            self.anchor=None


def documents_from_page(article_url: str, markup: str | bytes, limit=3) -> list[dict]:
    """Same-publisher PDF links, including iframe/embed/object/data-emsrc."""
    if isinstance(markup, bytes):
        markup=markup.decode("utf-8","replace")
    parser=_PdfLinks()
    parser.feed(markup[:750_000])
    results=[]
    seen=set()
    for raw,label in parser.candidates:
        # data-emsrc may hold a viewer URL ending in ?file=... or encoded
        # payload. Only direct same-host PDFs are safe to enqueue.
        url=municipal_url(raw,article_url,pdf_only=True)
        if not url or url in seen:
            continue
        seen.add(url)
        results.append({"url":url,"kind":"document","anchor":label[:120],
                        "publisher_page":article_url,"review_required":True,
                        "date_source":None,"deadline":None,
                        "reader_status":"requires_document_reader_and_signed_review"})
        if len(results)>=limit:
            break
    return results


def merge_page_links(first: list[dict], second: list[dict], limit=35) -> list[dict]:
    """Deduplicate by resolved URL while preserving the index-first ordering."""
    result, seen=[],set()
    for item in list(first)+list(second):
        if not isinstance(item,dict):
            continue
        url=item.get("url")
        if not isinstance(url,str) or url in seen:
            continue
        result.append(item)
        seen.add(url)
        if len(result)>=limit:
            break
    return result


def discover_municipal(index_url: str, limit=12, fetcher=None, include_html=False) -> dict:
    """Probe fixed endpoints read-only; 403/robots never count as zero jobs.

    fetcher(url) -> (body: bytes, mime: str). Default honors robots and
    allowlist via the existing document reader.
    """
    host=_host(index_url)
    result={"index_url":index_url,"commune":SITES.get(host,(None,))[0],
            "status":"not_configured","checked":[],"pages":[],
            "documents_for_review":[],"sources_accessible":0,
            "sources_blocked":0,"links_found":0}
    if host not in SITES:
        return result
    if not allowed(index_url):
        result["status"]="blocked"
        result["sources_blocked"]=1
        return result
    origin="https://"+host
    endpoints=SITES[host][1]
    if include_html:
        endpoints=tuple(endpoints)+(urlsplit(index_url).path,)
    if not endpoints:
        result["status"]="not_checked"
        return result
    if fetcher is None:
        def fetcher(url):
            if not allowed(url) or not robots_ok(url):
                raise PermissionError("robots_disallowed_or_unknown")
            return fetch_bytes(url,650_000)
    found=[]
    any_access=False
    for path in endpoints:
        endpoint=urljoin(origin,path)
        if not allowed(endpoint):
            continue
        try:
            raw,mime=fetcher(endpoint)
            if len(raw)>650_000:
                raise ValueError("feed_oversized")
            mime=str(mime).split(";",1)[0].lower()
            if "/wp-json/" in endpoint:
                if mime!="application/json":
                    raise ValueError("wp_mime_invalid")
                pages=parse_wp_posts(raw,index_url,limit)
            elif "/feed/" in endpoint:
                if mime not in ("application/rss+xml","application/xml","text/xml","application/atom+xml","text/html"):
                    raise ValueError("rss_mime_invalid")
                pages=parse_rss(raw,index_url,limit)
            elif mime in ("text/html","application/xhtml+xml"):
                # The Traiguén category is accessible HTML, unlike its
                # private WordPress API. Extract article leads and separate
                # any linked/embedded PDF evidence (never auto-publish).
                pages=parse_html_posts(raw,endpoint,limit=limit)
                result["documents_for_review"]=merge_page_links(
                    result["documents_for_review"],documents_from_page(endpoint,raw,limit=8),limit=12)
            else:
                raise ValueError("unexpected_mime")
            found=merge_page_links(found,pages,limit=limit)
            any_access=True
            result["sources_accessible"]+=1
            result["checked"].append({"url":endpoint,"status":"usable",
                                      "candidate_pages":len(pages)})
        except Exception as exc:
            blocked=isinstance(exc,PermissionError) or (
                hasattr(exc,"code") and getattr(exc,"code",0) in (401,403,406,429))
            result["sources_blocked"]+=int(blocked)
            result["checked"].append({"url":endpoint,
                "status":"blocked" if blocked else "failed",
                "error_type":type(exc).__name__})
    result["pages"]=found
    result["links_found"]=len(found)
    result["status"]=("ok" if found or result["documents_for_review"] else
                      "no_job_items" if any_access else
                      "blocked" if result["sources_blocked"] else "failed")
    return result
