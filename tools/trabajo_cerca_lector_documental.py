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
# URL pública basada en la app real, no en una ruta interna supuesta.
ENDPOINT = "https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/api/ops/free-public-sources"
ALLOWED_HOSTS = frozenset("""
noticias.angol.cl munilumaco.cl munilossauces.cl mtraiguen.cl
municipalidadrenaico.cl nacimiento.cl muninegrete.cl munimulchen.cl
municipalidadcollipulli.cl victoriachile.cl munipuren.cl muniercilla.cl
malleco7.cl radionativa.cl radioviaducto.cl lasnoticiasdemalleco.cl
ssan.redsalud.gob.cl
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
            doc = fitz.open(stream=body, filetype="pdf")
            if len(doc) > 30:
                return "", "pdf_over_page_budget"
            text = " ".join(page.get_text() for page in doc)
            if len(text.strip()) >= 140:
                return re.sub(r"\s+", " ", text).strip(), "pdf_text"
            # First three pages only. The remaining pages require a separate review.
            snippets = []
            for page in list(doc)[:3]:
                pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
                snippets.append(ocr_bytes(pix.tobytes("png")))
            combined = re.sub(r"\s+", " ", text + " " + " ".join(snippets)).strip()
            return combined, "pdf_ocr_local" if any(snippets) else "image_pdf_needs_ocr"
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
    if not text:
        state = "sin_texto_o_requiere_ocr"
    elif expires and expires < today:
        state = "plazo_vencido_no_publicar"
    elif len(cues) >= 2:
        state = "candidato_para_revision"
    else:
        state = "sin_evidencia_suficiente"
    # No personal data from an unverified source is exported in previews.
    excerpt = re.sub(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", "[correo]", text[:420])
    excerpt = re.sub(r"(?:\+56\s?)?(?:\d[\s-]?){9,12}", "[teléfono]", excerpt)
    return {"decision": state, "signals": cues, "possible_communes": places,
            "deadline": expires.isoformat() if expires else None,
            "preview": excerpt}


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
        content, mime = fetch_bytes(url)
        text, extraction = extract_text(content, mime, url)
        result = classify(text, today)
        return {**base, **result, "extractor": extraction,
                "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
                "read_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        return {**base, "decision": "lectura_fallida", "error":type(exc).__name__,
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="JSON descargado del endpoint de diagnóstico; sin --input se lee API pública")
    ap.add_argument("--output", default="reporte_documental.json")
    ap.add_argument("--max-items", type=int, default=8)
    args = ap.parse_args()
    if not 1 <= args.max_items <= 20:
        ap.error("--max-items debe estar entre 1 y 20")
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
    results = []
    for entry in entries[:args.max_items]:
        if isinstance(entry, dict):
            results.append(read_one(entry))
            time.sleep(0.5)
    report = {"schema": "trabajo-cerca.document-reader.v0.1",
              "read_only": True, "app_writes": 0, "paid_provider_calls": 0,
              "source_items_total": len(entries), "items_processed": len(results),
              "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
              "results": results}
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"items_processed":len(results),
                      "candidates":sum(x.get("decision")=="candidato_para_revision" for x in results),
                      "expired":sum(x.get("decision")=="plazo_vencido_no_publicar" for x in results),
                      "output":args.output, "paid_provider_calls":0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
