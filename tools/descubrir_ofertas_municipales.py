#!/usr/bin/env python3
"""PoC de descubrimiento territorial sin APIs pagadas ni escritura en Trabajo Cerca."""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import re
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from trabajo_cerca_lector_documental import allowed, fetch_bytes, robots_ok, read_one

# Se descubren URLs, no se publican avisos. Una página índice jamás cuenta como vacante.
SIGNAL = re.compile(r"(?:oferta[s]?(?:-| )laboral(?:es)?|oportunidad(?:es)?(?:-| )laboral(?:es)?|"
                    r"oferta(?:-| )de(?:-| )trabajo|convocatoria(?:-| )(?:laboral|abierta)|"
                    r"vacante[s]?|llamado(?:-| )a(?:-| )concurso|"
                    r"postulaci[oó]n|trabaja(?:-| )con(?:-| )nosotros|"
                    r"(?:se(?:-| )(?:necesita|busca|requiere))|"
                    r"(?:requiere(?:-| )(?:docentes|profesionales|personal))|"
                    r"(?:abre(?:-| )(?:concurso|convocatoria|postulaciones))|"
                    r"(?:empleo|trabajo)(?:-| )(?:para|en)(?:-| ))", re.I)
IGNORE = re.compile(r"(?:/category/|/categoria/|/tag/|/author/|/page/\d+/?|"
                    r"/wp-json/|/feed/?|/api/|/login|/wp-admin/)", re.I)
OLD_DATE = re.compile(r"/(?:201\d|202[0-5])(?:/|$)")


class AnchorReader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ignored = 0
        self.current = None
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("nav", "header", "footer", "aside"):
            self.ignored += 1
        if tag == "a" and not self.ignored:
            self.current = [attrs.get("href", ""), []]

    def handle_data(self, data):
        if self.current is not None and not self.ignored:
            self.current[1].append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.current is not None:
            href, parts = self.current
            self.links.append((href, re.sub(r"\s+", " ", " ".join(parts)).strip()))
            self.current = None
        if tag in ("nav", "header", "footer", "aside") and self.ignored:
            self.ignored -= 1


def candidate_links(index_url: str, html: str, limit=5):
    parser = AnchorReader()
    parser.feed(html)
    found = {}
    origin = urlsplit(index_url).hostname.removeprefix("www.")
    for href, label in parser.links:
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        url = urljoin(index_url, href)
        if not allowed(url):
            continue
        parsed = urlsplit(url)
        if parsed.hostname.removeprefix("www.") != origin:
            continue
        if IGNORE.search(parsed.path) or OLD_DATE.search(parsed.path):
            continue
        if parsed.path.rstrip("/") in ("", urlsplit(index_url).path.rstrip("/")):
            continue
        text = parsed.path.replace("-", " ").replace("_", " ") + " " + label
        if not SIGNAL.search(text):
            continue
        if url not in found:
            found[url] = {"url": url, "anchor": label[:120],
                          "kind": "document" if parsed.path.lower().endswith(".pdf") else "local_page"}
    return list(found.values())[:limit]


def attached_public_pdfs(article_url: str, html: str, limit=1) -> list[dict]:
    """PDF visible y directamente vinculado al artículo; nunca en otro dominio."""
    anchors = AnchorReader()
    anchors.feed(html)
    host = urlsplit(article_url).hostname.removeprefix("www.")
    candidates: list[dict] = []
    for href, label in anchors.links:
        if not href:
            continue
        resolved = urljoin(article_url, href)
        if not allowed(resolved):
            continue
        parts = urlsplit(resolved)
        if parts.hostname.removeprefix("www.") != host:
            continue
        if not re.search(r"\.pdf$", parts.path, re.I):
            continue
        if OLD_DATE.search(parts.path):
            continue
        if resolved not in [x["url"] for x in candidates]:
            candidates.append({"url": resolved, "kind": "document", "anchor": label[:120]})
        if len(candidates) >= limit:
            break
    return candidates


def discover(index: dict, max_links: int = 5) -> dict:
    url = str(index.get("url") or "")
    row = {"index_url": url, "source": str(index.get("source") or "")[:120],
           "links_found": 0, "checked": [], "status": "pending"}
    if not allowed(url) or not robots_ok(url):
        row["status"] = "index_not_authorized_or_robots_unknown"
        return row
    try:
        body, mime = fetch_bytes(url, 650000)
        if mime not in ("text/html", "application/xhtml+xml"):
            row["status"] = "index_not_html"
            return row
        html = body.decode("utf-8", "replace")
        links = candidate_links(url, html, max_links)
        row.update(status="index_read", links_found=len(links),
                   index_sha256=hashlib.sha256(body).hexdigest())
        for item in links:
            item["source"] = row["source"]
            item["publisher_page"] = url
            checked = read_one(item)
            # En la página índice hay textos generales; solo el detalle se evalúa.
            row["checked"].append(checked)
            if item["kind"] == "local_page":
                try:
                    # Un único PDF por artículo para evitar procesar anexos masivos.
                    article_bytes, article_mime = fetch_bytes(item["url"], 650000)
                    if article_mime in ("text/html", "application/xhtml+xml"):
                        for pdf in attached_public_pdfs(item["url"], article_bytes.decode("utf-8", "replace")):
                            pdf["source"] = row["source"]
                            pdf["publisher_page"] = item["url"]
                            row["checked"].append(read_one(pdf))
                except Exception:
                    checked["attachment_scan"] = "not_available"
            time.sleep(0.25)
    except Exception as error:
        row["status"] = "index_fetch_failed"
        row["error_type"] = type(error).__name__
    return row


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="reporte_descubrimiento.json")
    parser.add_argument("--max-indexes", type=int, default=3)
    parser.add_argument("--max-links", type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.max_indexes <= 5 or not 1 <= args.max_links <= 5:
        parser.error("Límites excedidos")
    source = json.loads(Path(args.input).read_text(encoding="utf-8"))
    indices = source["documentWork"]["items"]
    # Solo índices municipales, sin documentos ni páginas externas a la lista blanca.
    items = [item for item in indices if item.get("kind")=="local_page"][:args.max_indexes]
    results = [discover(item, args.max_links) for item in items]
    report = {"schema":"trabajo-cerca.municipal-discovery.v0.1",
              "read_only":True,"paid_provider_calls":0,"app_writes":0,
              "created_at":dt.datetime.now(dt.timezone.utc).isoformat(),
              "indexes_checked":len(results),
              "links_found":sum(item["links_found"] for item in results),
              "individual_pages_checked":sum(len(item["checked"]) for item in results),
              "pdfs_checked":sum(1 for row in results for x in row["checked"] if x.get("kind")=="document"),
              "candidate_for_review":sum(1 for row in results for x in row["checked"]
                                           if x.get("decision")=="candidato_para_revision"),
              "results":results}
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({key:report[key] for key in
                      ("indexes_checked","links_found","individual_pages_checked","pdfs_checked","candidate_for_review",
                       "paid_provider_calls","app_writes")},ensure_ascii=False))


if __name__ == "__main__":
    main()
