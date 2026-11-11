"""Read-only full public catalog QA; all endpoints are GET, max 35 pages."""
import json
import os
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import quote

BASE = os.getenv("TRABAJO_CERCA_API", "https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro").rstrip("/")
MAX_PAGES = 35


def get(path):
    request = Request(BASE + path, headers={"Accept": "application/json",
                                            "User-Agent": "TrabajoCerca-ReadOnly-ReleaseQA/1.0"})
    with urlopen(request, timeout=18) as response:
        return json.load(response)


def inspect(fetch=get, max_pages=MAX_PAGES):
    ids, cursors, failures = set(), set(), []
    cursor = None
    manifest = None
    expected_items = expected_jobs = None
    items_count = jobs_count = pages = 0
    for _ in range(max_pages):
        path = "/api/listings?fresh=1" if cursor is None else "/api/listings?cursor=" + quote(cursor, safe="")
        page = fetch(path)
        pages += 1
        if not isinstance(page, dict):
            failures.append("invalid_page_json")
            break
        if page.get("degraded") or page.get("feedRebuilding") or page.get("totalsProvisional"):
            failures.append("feed_rebuilding_or_degraded")
            break
        rows = page.get("items")
        if not isinstance(rows, list):
            failures.append("missing_items_array")
            break
        reported_items, reported_jobs = page.get("totalItems"), page.get("totalJobOffers")
        if type(reported_items) is not int or type(reported_jobs) is not int or reported_items < 0 or reported_jobs < 0:
            failures.append("invalid_totals")
            break
        if expected_items is None:
            expected_items, expected_jobs = reported_items, reported_jobs
        elif (reported_items, reported_jobs) != (expected_items, expected_jobs):
            failures.append("totals_changed_midscan")
            break
        items_count += len(rows)
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"]:
                failures.append("invalid_item")
                continue
            if row["id"] in ids:
                failures.append("duplicate_id")
            ids.add(row["id"])
            if row.get("kind") == "job_offer":
                jobs_count += 1
        more = page.get("hasMore")
        if type(more) is not bool:
            failures.append("invalid_hasMore")
            break
        if not more:
            if expected_items != items_count or expected_jobs != jobs_count:
                failures.append("full_feed_count_mismatch")
            break
        token = page.get("nextCursor")
        if not isinstance(token, str) or not token.startswith("v2:") or token in cursors:
            failures.append("cursor_missing_invalid_or_repeated")
            break
        cursors.add(token)
        current = token.split(":")[1]
        if manifest is None:
            manifest = current
        elif current != manifest:
            failures.append("manifest_switched_midscan")
            break
        cursor = token
    else:
        failures.append("too_many_pages")
    if items_count == 0 or pages == 0:
        failures.append("no_public_items")
    if expected_jobs == 0:
        failures.append("zero_job_offers")
    return {"checkedAt": datetime.now(timezone.utc).isoformat(),
            "readOnly": True, "pages": pages, "items": items_count,
            "jobs": jobs_count, "reportedItems": expected_items,
            "reportedJobs": expected_jobs, "failures": sorted(set(failures))}


def main():
    try:
        report = inspect()
    except Exception as exc:
        report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "readOnly": True,
                  "failures": ["get_failed_" + type(exc).__name__], "message": str(exc)[:160]}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if report["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
