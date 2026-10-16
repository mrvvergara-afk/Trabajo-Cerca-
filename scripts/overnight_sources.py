"""Read prioritized regional sources without publishing or paid providers.

The output separates discovery clues from offers that could later be verified.
No record is sent to Trabajo Cerca from this module.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
import urllib.parse
from pathlib import Path

OUTPUT = Path("output/public-sources")
MALLECO7_INDEX = "https://www.malleco7.cl/ediciones-digitales-malleco7/"
MALLECO7_EDITION = "https://www.malleco7.cl/wp-content/uploads/2026/10/1486.pdf"
OMIL_NACIMIENTO = "https://www.facebook.com/profile.php?id=102913642090515"

SEEDS = [
    ("omil-angol", "https://noticias.angol.cl/index.php/noticias"),
    ("omil-collipulli", "https://municipalidadcollipulli.cl/concursos-publicos/"),
    ("omil-nacimiento-facebook", OMIL_NACIMIENTO),
    ("malleco7-index", MALLECO7_INDEX),
]

HIRING = re.compile(
    r"ofertas?\s+laboral(?:es)?|vacantes?|se\s+(?:busca|necesita|requiere)|"
    r"buscamos\s+personal|enviar?\s+(?:cv|curr[ií]culum)|postulaci[oó]n|omil",
    re.I,
)
CLOSED = re.compile(
    r"(?:postulaciones?|convocatoria)\s+(?:cerrad[ao]s?|finalizad[ao]s?)|"
    r"plazo\s+(?:vencido|cerrado)|cierre\s+de\s+postulaci[oó]n",
    re.I,
)
AGGREGATE = re.compile(r"feria\s+laboral|\b(?:\d+|varios?)\s+cupos\b", re.I)
DATE = re.compile(r"\b(?:0?[1-9]|[12]\d|3[01])[-/.](?:0?[1-9]|1[0-2])[-/.](?:20)?\d{2}\b")


def classify_snippet(text: str, *, page: int, source_url: str) -> dict | None:
    """Return a conservative clue; never upgrades a snippet to a verified offer."""
    normalized = re.sub(r"[ \t]+", " ", text).strip()
    if not HIRING.search(normalized):
        return None
    if AGGREGATE.search(normalized):
        kind = "aggregate_event_not_individual_offer"
    elif CLOSED.search(normalized):
        kind = "historical_closed_notice"
    else:
        kind = "candidate_requires_original_verification"
    return {
        "kind": kind,
        "page": page,
        "source_url": source_url,
        "dates_seen": sorted(set(DATE.findall(normalized)))[:8],
        "excerpt": normalized[:700],
        "verified": False,
        "published": False,
    }


def page_clues(text: str, source_url: str) -> list[dict]:
    clues = []
    for page, value in enumerate(text.split("\f"), 1):
        lines = [line.strip() for line in value.splitlines() if line.strip()]
        aggregate_page = bool(
            re.search(r"\bferia\b", value, re.I)
            and re.search(r"\b(?:empresas|cupos|perfiles\s+laborales)\b", value, re.I)
        )
        for index, line in enumerate(lines):
            if not HIRING.search(line):
                continue
            start, end = max(0, index - 4), min(len(lines), index + 8)
            clue = classify_snippet("\n".join(lines[start:end]), page=page, source_url=source_url)
            if clue and aggregate_page:
                clue["kind"] = "aggregate_event_not_individual_offer"
            if clue and not any(existing["page"] == page and existing["excerpt"] == clue["excerpt"] for existing in clues):
                clues.append(clue)
                if aggregate_page:
                    break
    return clues[:40]


def read_pdf_all(url: str, budget) -> dict:
    from .local_source_audit import fetch_public, tesseract_text
    data, final, mime, status = fetch_public(url, budget, max_bytes=20 * 1024 * 1024)
    if mime != "application/pdf":
        raise ValueError("unexpected_edition_media_type")
    with tempfile.TemporaryDirectory() as directory:
        pdf = Path(directory) / "edition.pdf"
        pdf.write_bytes(data)
        if not shutil.which("pdfinfo") or not shutil.which("pdftotext"):
            raise RuntimeError("local_pdf_reader_not_installed")
        info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True, timeout=10)
        matched = re.search(r"^Pages:\s*(\d+)", info.stdout, re.M)
        pages = int(matched.group(1)) if matched else None
        if not pages or pages > 24:
            raise ValueError("edition_page_count_out_of_bounds")
        plain = subprocess.run(
            ["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True,
            check=True, timeout=min(45, max(1, budget.remaining())),
        ).stdout
        engine = "pdftotext-local"
        if len(plain.strip()) < 500:
            if not shutil.which("pdftoppm"):
                raise RuntimeError("local_pdf_rasterizer_not_installed")
            prefix = Path(directory) / "page"
            subprocess.run(
                ["pdftoppm", "-f", "1", "-l", str(pages), "-scale-to", "1800", "-png", str(pdf), str(prefix)],
                capture_output=True, check=True, timeout=min(120, max(1, budget.remaining())),
            )
            values = [tesseract_text(image, budget)["text"] for image in sorted(Path(directory).glob("page-*.png"))]
            plain = "\f".join(values)
            engine = "tesseract-local"
        return {
            "url": url,
            "final_url": final,
            "http_status": status,
            "mime": mime,
            "bytes": len(data),
            "page_count": pages,
            "pages_read": pages,
            "complete_document": True,
            "engine": engine,
            "clues": page_clues(plain, final),
        }


def read_seed(name: str, url: str, budget) -> dict:
    from .local_source_audit import Document, fetch_public, source_error
    row = {"name": name, "url": url, "read_only": True, "paid_provider_calls": 0}
    try:
        data, final, mime, status = fetch_public(url, budget, max_bytes=1_500_000)
        raw = data.decode("utf-8", "replace")
        document = Document(); document.feed(raw)
        row.update(final_url=final, http_status=status, mime=mime, title=document.title[:180])
        links = []
        for href, label in document.links:
            target = urllib.parse.urljoin(final, href)
            if "malleco7.cl/wp-content/uploads/" in target and target.lower().endswith(".pdf"):
                links.append({"url": target, "label": label[:160], "kind": "edition_discovery"})
        row["discoveries"] = links[:20]
        row["verified_offers"] = []
    except Exception as exc:
        row["error"] = source_error(exc)
        row["verified_offers"] = []
    return row


def main() -> None:
    from .common import Budget, utcnow, write_json
    from .local_source_audit import source_error
    OUTPUT.mkdir(parents=True, exist_ok=True)
    budget = Budget(600)
    sources = [read_seed(name, url, budget) for name, url in SEEDS]
    try:
        edition = read_pdf_all(MALLECO7_EDITION, budget)
    except Exception as exc:
        edition = {"url": MALLECO7_EDITION, "error": source_error(exc), "clues": []}
    report = {
        "schema": "trabajo-cerca.overnight-public-sources.v1",
        "checked_at": utcnow().isoformat(),
        "read_only": True,
        "paid_provider_calls": 0,
        "publication_attempted": False,
        "sources": sources,
        "edition": edition,
        "counts": {
            "candidates": sum(item["kind"] == "candidate_requires_original_verification" for item in edition.get("clues", [])),
            "historical_closed": sum(item["kind"] == "historical_closed_notice" for item in edition.get("clues", [])),
            "aggregate_events": sum(item["kind"] == "aggregate_event_not_individual_offer" for item in edition.get("clues", [])),
            "verified_current_offers": 0,
            "published_ids": 0,
        },
    }
    write_json(OUTPUT / "overnight-sources.json", report)
    print("OVERNIGHT_SOURCES " + json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
