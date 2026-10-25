#!/usr/bin/env python3
"""Trabajo Cerca: lector experimental GRATUITO y de SOLO LECTURA.
Entrada: exportación de GET /api/ops/free-public-sources (documentWork.items).
Salida: candidatos locales para revisión; NUNCA crea publicaciones o altera datos.
No extrae contenido privado de redes sociales; respeta robots.txt y lista permitida.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import io
import json
import re
import ssl
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser

USER_AGENT = "TrabajoCercaDocumentReader/0.1 (read-only)"
# URL de API confirmada en la respuesta real de @appdeploy/client (2026-10-25).
# Solo diagnóstico público de enlaces; la ruta admin está protegida y no se consulta.
ENDPOINT = "https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro/api/ops/free-public-sources"
ALLOWED_HOSTS = frozenset("""
noticias.angol.cl munilumaco.cl munilossauces.cl mtraiguen.cl
municipalidadrenaico.cl nacimiento.cl muninegrete.cl munimulchen.cl
municipalidadcollipulli.cl victoriachile.cl munipuren.cl muniercilla.cl
malleco7.cl radionativa.cl radioviaducto.cl lasnoticiasdemalleco.cl
ssan.redsalud.gob.cl traiguencity.cl
""".split())
WORK_TOWNS = ("Angol", "Collipulli", "Ercilla", "Renaico", "Mininco",
              "Los Sauces", "Purén", "Traiguén", "Lumaco", "Nacimiento",
              "Negrete", "Mulchén", "Victoria")
MONTHS = dict(zip(("enero febrero marzo abril mayo junio julio agosto septiembre "
                   "octubre noviembre diciembre").split(), range(1, 13)))
OPENER = build_opener(type("NoRedirect", (HTTPRedirectHandler,), {"redirect_request": lambda *args: None})())


def allowed(url: str) -> bool:
    try:
        u = urlsplit(url)
        host = (u.hostname or "").lower().removeprefix("www.")
        return bool(u.scheme == "https" and host in ALLOWED_HOSTS and
                    not u.username and not u.password and u.port is None and
                    len(url) <= 2000 and u.path.startswith("/") and
                    not re.search(r"(?i)(?:access_token|api_key|token|session)=", u.query))
    except (ValueError, TypeError):
        return False


def maximum_for_url(url: str) -> int:
    """Solo PDF autorizados pueden alcanzar 16 MiB; imágenes y HTML, 6 MB."""
    return 16 * 1024 * 1024 if urlsplit(url).path.lower().endswith(".pdf") else 6000000


def fetch_bytes(url: str, maximum: int = 6000000) -> tuple[bytes, str]:
    # No redirects. Network-level proxy must also deny private IP targets.
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/pdf,text/html,text/plain"})
    with OPENER.open(req, timeout=12) as resp:
        if resp.status != 200:
            raise ValueError("http_" + str(resp.status))
        if int(resp.headers.get("Content-Length", "0") or "0") > maximum:
            raise ValueError("file_too_large")
        content = resp.read(maximum + 1)
        if len(content) > maximum:
            raise ValueError("file_too_large")
        return content, resp.headers.get_content_type().lower()


_ROBOTS: dict[str, RobotFileParser | None] = {}


def robots_ok(url: str) -> bool:
    u = urlsplit(url)
    host = u.hostname
    if host not in _ROBOTS:
        r = RobotFileParser()
        try:
            body, mime = fetch_bytes(f"https://{host}/robots.txt", 65000)
            if mime != "text/plain":
                _ROBOTS[host] = None
            else:
                r.parse(body.decode("utf-8", "replace").splitlines())
                _ROBOTS[host] = r
        except HTTPError as exc:
            if exc.code == 404:
                r.parse([])
                _ROBOTS[host] = r
            else:
                _ROBOTS[host] = None
        except (URLError, OSError, ValueError):
            _ROBOTS[host] = None
    parser = _ROBOTS[host]
    return parser is not None and parser.can_fetch(USER_AGENT, url)


class HtmlText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def clean_text(raw: str) -> str:
    parser = HtmlText()
    parser.feed(raw)
    return re.sub(r"\s+", " ", " ".join(parser.parts)).strip()


def ocr_bytes(body: bytes) -> str:
    """OCR español local, acotado. No utiliza APIs, no almacena imágenes."""
    try:
        import pytesseract  # type: ignore
        from PIL import Image, ImageOps  # type: ignore
        Image.MAX_IMAGE_PIXELS = 8_000_000
        with Image.open(io.BytesIO(body)) as original:
            original.load()
            if original.width * original.height > 8_000_000:
                return ""
            img = ImageOps.grayscale(original)
            try:
                return re.sub(r"\s+", " ", pytesseract.image_to_string(
                    img, lang="spa+eng", config="--psm 6", timeout=18)).strip()[:14000]
            finally:
                img.close()
    except Exception:
        return ""


def extract_text(body: bytes, mime: str, url: str) -> tuple[str, str]:
    if mime == "application/pdf" or body.startswith(b"%PDF-"):
        try:
            import fitz  # type: ignore
        except ImportError:
            return "", "pdf_dependency_missing"
        try:
            with fitz.open(stream=body, filetype="pdf") as doc:
                total = len(doc)
                if not total:
                    return "", "pdf_empty"
                # Large public files receive a bounded six-page PREVIEW.
                # A preview is NEVER sufficient to approve or publish a job.
                limit = min(total, 6 if total > 30 else 30)
                text = " ".join(doc[i].get_text() for i in range(limit))
                partial = total > 30
                if len(text.strip()) >= 140:
                    return re.sub(r"\s+", " ", text).strip(), ("pdf_preview_partial" if partial else "pdf_text")
                snippets = []
                for i in range(min(limit, 3)):
                    pix = doc[i].get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
                    snippets.append(ocr_bytes(pix.tobytes("png")))
                combined = re.sub(r"\s+", " ", text + " " + " ".join(snippets)).strip()
                mode = ("pdf_preview_partial" if partial else
                        "pdf_ocr_local" if any(snippets) else "image_pdf_needs_ocr")
                return combined, mode
        except Exception:
            return "", "pdf_unreadable"
    if mime in ("image/jpeg", "image/png", "image/webp"):
        extracted = ocr_bytes(body)
        return extracted, "imagen_ocr_local" if extracted else "imagen_no_legible"
    if mime in ("text/html", "application/xhtml+xml"):
        return clean_text(body.decode("utf-8", "replace")), "html_text"
    return "", "unsupported_mime"


def parse_deadline(text: str) -> dt.date | None:
    cues = r"(?:hasta\s+(?:el\s+)?|cierre\s+(?:de\s+)?postulaci[oó]n(?:es)?\s*[:\-]?\s*|plazo\s+[:\-]?\s*)"
    numeric = re.search(cues + r"(\d{1,2})[/-](\d{1,2})[/-](20\d{2})", text, re.I)
    if numeric:
        try:
            return dt.date(int(numeric.group(3)), int(numeric.group(2)), int(numeric.group(1)))
        except ValueError:
            return None
    prose = re.search(cues + r"(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de(?:l)?\s+)?(20\d{2})", text, re.I)
    if prose:
        try:
            month = MONTHS[prose.group(2).lower()]
            return dt.date(int(prose.group(3)), month, int(prose.group(1)))
        except (KeyError, ValueError):
            return None
    return None


def parse_source_date(text: str) -> dt.date | None:
    """Detecta fecha de encabezado inequívoca, no menciones históricas genéricas."""
    first = re.sub(r"\s+", " ", text[:1800])
    cities = r"(?:Lumaco|Angol|Victoria|Renaico|Traigu[eé]n|Negrete|Nacimiento|Pur[eé]n|Mulch[eé]n|Collipulli|Ercilla)"
    weekdays = r"(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+)?"
    marker = rf"{cities}\s*,\s*(?:a\s+)?{weekdays}"
    marker += r"(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de(?:l)?\s+)?(20\d{2})"
    found = re.search(marker, first, re.I)
    if not found:
        return None
    month = MONTHS.get(found.group(2).lower())
    if month is None:
        return None
    try:
        return dt.date(int(found.group(3)), month, int(found.group(1)))
    except ValueError:
        return None


def classify(text: str, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    text = re.sub(r"\s+", " ", text).strip()
    folded = text.casefold()
    cues = [x for x in ("oferta laboral", "se necesita", "se busca", "vacante",
                         "convocatoria laboral", "llamado a concurso", "postular",
                         "requisitos del cargo", "enviar currículum")
            if x in folded]
    places = [x for x in WORK_TOWNS if re.search(r"\b" + re.escape(x) + r"\b", text, re.I)]
    expires = parse_deadline(text)
    source_date = parse_source_date(text)
    if not text:
        state = "sin_texto_o_requiere_ocr"
    elif expires and expires < today:
        state = "plazo_vencido_no_publicar"
    elif source_date and source_date < today - dt.timedelta(days=20):
        state = "documento_antiguo_no_publicar"
    elif len(cues) >= 2 and not source_date:
        state = "candidato_fecha_pendiente"
    elif len(cues) >= 2:
        state = "candidato_para_revision"
    else:
        state = "sin_evidencia_suficiente"
    # No personal data from an unverified source is exported in previews.
    excerpt = re.sub(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", "[correo]", text[:420])
    excerpt = re.sub(r"(?:\+56\s?)?(?:\d[\s-]?){9,12}", "[teléfono]", excerpt)
    return {"decision": state, "signals": cues, "possible_communes": places,
            "deadline": expires.isoformat() if expires else None,
            "source_date_evidence": source_date.isoformat() if source_date else None,
            "publication_date_confirmed": False,
            "preview": excerpt}


class ArticleDateParser(HTMLParser):
    """Use only explicit author-published HTML metadata or article time tags."""
    def __init__(self):
        super().__init__()
        self.published: dt.date | None = None

    def handle_starttag(self, tag, attrs):
        if self.published:
            return
        data = dict(attrs)
        stamp = None
        if tag == "meta" and (data.get("property") in ("article:published_time", "datePublished") or
                              data.get("name") in ("pubdate", "datePublished")):
            stamp = data.get("content")
        elif tag == "time" and data.get("datetime"):
            stamp = data["datetime"]
        if isinstance(stamp, str):
            try:
                self.published = dt.date.fromisoformat(stamp[:10])
            except ValueError:
                pass


def verified_article_date(html: str) -> dt.date | None:
    parsed = ArticleDateParser()
    parsed.feed(html[:120000])
    return parsed.published


def read_one(entry: dict, today: dt.date | None = None) -> dict:
    url = entry.get("url") or ""
    base = {"url": url, "source": str(entry.get("source", ""))[:120],
            "kind": entry.get("kind"), "publisher_page": entry.get("publisher_page")}
    if not allowed(url):
        return {**base, "decision": "origen_no_autorizado"}
    if entry.get("kind") == "rendered_page":
        return {**base, "decision": "requiere_render_js"}
    if not robots_ok(url):
        return {**base, "decision": "robots_no_confirmado"}
    try:
        content, mime = fetch_bytes(url, maximum_for_url(url))
        text, extraction = extract_text(content, mime, url)
        result = classify(text, today)
        if mime in ("text/html", "application/xhtml+xml"):
            original = verified_article_date(content.decode("utf-8", "replace"))
            if original:
                current = today or dt.date.today()
                previous = result["decision"]
                if original > current:
                    status = "fecha_original_futura_no_publicar"
                elif original < current - dt.timedelta(days=20):
                    status = "documento_antiguo_no_publicar"
                elif previous == "plazo_vencido_no_publicar":
                    status = previous
                elif previous in ("candidato_fecha_pendiente", "candidato_para_revision"):
                    status = "candidato_para_revision"
                else:
                    status = previous
                result.update(decision=status, publication_date_evidence=original.isoformat(),
                              publication_date_confirmed=True)
        if extraction == "pdf_preview_partial":
            # Not even a strong signal can authorize a partial PDF.
            result = {**result, "original_classification": result["decision"],
                      "decision": "documento_parcial_revision_obligatoria"}
        return {**base, **result, "extractor": extraction,
                "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
                "read_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        return {**base, "decision": "lectura_fallida", "error":type(exc).__name__,
                "failure_reason":str(exc)[:70] if isinstance(exc, ValueError) else None,
                "http": getattr(exc, "code", None)}


def read_manifest(path: str | None) -> dict:
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    with OPENER.open(Request(ENDPOINT, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}), timeout=12) as response:
        if response.status != 200:
            raise ValueError("read_only_endpoint_http_" + str(response.status))
        content_type = response.headers.get_content_type()
        if content_type not in ("application/json", "application/problem+json"):
            raise ValueError("endpoint_non_json_" + content_type.replace("/", "_")[:50])
        return json.loads(response.read(600000).decode("utf-8"))


def likely_older_than_days(url: str, days: int = 20, today: dt.date | None = None) -> bool:
    """URL mes/año solo permite excluir del lote prioritario meses concluidos.
    No acredita publicación original ni justifica borrar un documento.
    """
    today = today or dt.date.today()
    match = re.search(r"/(20\d{2})/(0?[1-9]|1[0-2])/", urlsplit(url).path)
    if not match:
        return False
    year, month = int(match.group(1)), int(match.group(2))
    try:
        first_next = dt.date(year + (month == 12), (month % 12) + 1, 1)
    except ValueError:
        return False
    return first_next - dt.timedelta(days=1) < today - dt.timedelta(days=days)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="JSON descargado del endpoint de diagnóstico; sin --input se lee API pública")
    ap.add_argument("--output", default="reporte_documental.json")
    ap.add_argument("--max-items", type=int, default=8)
    ap.add_argument("--offset", type=int, default=0, help="Saltarse N referencias de la cola pública")
    ap.add_argument("--priority-window", action="store_true",
                    help="Priorizar solo URLs cuyo mes no demuestra una antigüedad superior a 20 días; no elimina datos.")
    args = ap.parse_args()
    if not 1 <= args.max_items <= 20 or not 0 <= args.offset <= 100:
        ap.error("--max-items debe estar entre 1 y 20 y --offset entre 0 y 100")
    try:
        source = read_manifest(args.input)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
        # A factual failure receipt, not a fabricated successful run.
        receipt = {"schema": "trabajo-cerca.document-reader.v0.1",
                   "status": "endpoint_unavailable", "read_only": True,
                   "app_writes": 0, "paid_provider_calls": 0, "items_processed": 0,
                   "error_type": type(exc).__name__,
                   "failure_reason": str(exc)[:80] if isinstance(exc, ValueError) else "network_or_access_error",
                   "http_status": getattr(exc, "code", None),
                   "created_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        Path(args.output).write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(receipt, ensure_ascii=False))
        raise SystemExit(2)
    work = source.get("documentWork", source)
    entries = work.get("items", []) if isinstance(work, dict) else []
    if not isinstance(entries, list):
        raise RuntimeError("No hay una lista documentWork.items válida")
    priority = [x for x in entries if isinstance(x,dict) and
                not likely_older_than_days(str(x.get("url", "")), 20)]
    chosen = priority if args.priority_window else entries
    results = []
    for entry in chosen[args.offset:args.offset+args.max_items]:
        if isinstance(entry, dict):
            results.append(read_one(entry))
            time.sleep(0.5)
    report = {"schema": "trabajo-cerca.document-reader.v0.1",
              "read_only": True, "app_writes": 0, "paid_provider_calls": 0,
              "source_items_total": len(entries), "priority_window": args.priority_window,
              "priority_items_total": len(priority),
              "excluded_from_this_run": (len(entries)-len(priority)) if args.priority_window else 0,
              "offset": args.offset,
              "items_requested": args.max_items, "items_processed": len(results),
              "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
              "results": results}
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"queue_total":len(entries), "offset":args.offset,
                      "items_processed":len(results),
                      "candidates":sum(x.get("decision")=="candidato_para_revision" for x in results),
                      "expired":sum(x.get("decision")=="plazo_vencido_no_publicar" for x in results),
                      "output":args.output, "paid_provider_calls":0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
