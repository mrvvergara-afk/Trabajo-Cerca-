"""QA de solo lectura: disponibilidad del feed y recuperación territorial B/C.

No crea ofertas, no llama endpoints administrativos y no despliega.
Uso: python automation/qa_feed_bc_consolidado.py
"""
import json
import os
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE = os.environ.get("TRABAJO_CERCA_API", "https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro").rstrip("/")


def get(path):
    request = Request(BASE + path, headers={
        "Accept": "application/json",
        "User-Agent": "TrabajoCerca-Consolidated-ReadOnly-QA/1.0",
    })
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def main():
    failures = []
    results = {}
    for name, path in (
        ("feed", "/api/listings?fresh=1"),
        ("motor_a", "/api/ops/free-public-sources"),
        ("motor_bc", "/api/ops/fast-bc"),
    ):
        try:
            results[name] = get(path)
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            failures.append(name + ": " + str(exc))
            results[name] = {}

    feed = results["feed"]
    items = feed.get("items")
    degraded = bool(feed.get("degraded") or feed.get("feedRebuilding"))
    if not isinstance(items, list):
        failures.append("feed: items no es una lista")
    if degraded and not items:
        failures.append("feed: reconstruccion devuelve catalogo vacio (riesgo visible)")
    if not degraded and isinstance(items, list):
        total = feed.get("totalJobOffers")
        if not isinstance(total, int) or total < 0:
            failures.append("feed: totalJobOffers invalido")
        if feed.get("hasMore") and not feed.get("nextCursor"):
            failures.append("feed: falta nextCursor")
        if feed.get("hasMore") and feed.get("nextCursor"):
            try:
                next_page = get("/api/listings?cursor=" + __import__("urllib.parse", fromlist=["quote"]).quote(str(feed["nextCursor"]), safe=""))
                if not isinstance(next_page.get("items"), list):
                    failures.append("feed: segunda pagina sin items")
            except (HTTPError, URLError, TimeoutError, ValueError) as exc:
                failures.append("feed: paginacion: " + str(exc))

    a = results["motor_a"]
    bc = results["motor_bc"]
    summary = a.get("summary") or {}
    batch = bc.get("htmlLastBatch") or {}
    for key in ("found", "checked", "verified"):
        if key in batch and (not isinstance(batch[key], int) or batch[key] < 0):
            failures.append("B/C: metrica invalida " + key)
    if batch.get("verified", 0) > batch.get("checked", 0):
        failures.append("B/C: verificadas supera revisadas")
    if batch.get("legacyRecovered", 0) > batch.get("checked", 0):
        failures.append("B/C: recuperadas supera revisadas")
    if bc.get("historicalQueuesReopened") is True:
        failures.append("B/C: colas historicas reabiertas")

    print(json.dumps({
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "feed": {
            "degraded": degraded,
            "pageItems": len(items) if isinstance(items, list) else None,
            "totalJobOffers": feed.get("totalJobOffers"),
            "hasMore": feed.get("hasMore"),
        },
        "A": {
            "checkedAt": a.get("checkedAt"),
            "verified": summary.get("verified"),
            "stored": summary.get("stored"),
            "published": summary.get("published"),
            "pending": a.get("pending"),
        },
        "BC": {
            "lastRunAt": bc.get("lastRunAt"),
            "htmlLastBatch": batch,
        },
        "failures": failures,
    }, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
