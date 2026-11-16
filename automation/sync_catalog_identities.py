#!/usr/bin/env python3
"""Mirror ONLY public, approved job identities from Trabajo Cerca to GitHub.

Never exports contacts, email addresses, advertiser records, internal queues or notes.
Fail closed when the source API is unreachable, paginated results are incomplete,
or the public feed reports a rebuild. On failure do not replace the last good copy.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

SOURCE = "https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro/api/listings/identities"
TARGET = pathlib.Path("automation/catalog_public_identities.json")
MAX_PAGES = 100
MAX_IDENTITIES = 20000


def canonical_url(raw: str) -> str:
    if not raw or not raw.startswith("https://"):
        return ""
    try:
        p = urllib.parse.urlsplit(raw.strip())
        hostname = (p.hostname or "").lower().removeprefix("www.")
        if not hostname or p.username or p.password or (p.port and p.port != 443):
            return ""
        path = p.path.rstrip("/") or "/"
        query = [
            (k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True)
            if not k.lower().startswith("utm_")
            and k.lower() not in {"fbclid", "gclid", "msclkid", "igshid", "mc_cid", "mc_eid"}
        ]
        return urllib.parse.urlunsplit(("https", hostname, path, urllib.parse.urlencode(sorted(query)), ""))
    except ValueError:
        return ""


def get_json(cursor: str | None):
    url = SOURCE + ("?cursor=" + urllib.parse.quote(cursor, safe="") if cursor else "")
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "TrabajoCerca-CatalogPublicMirror/1.0",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        if response.status != 200:
            raise RuntimeError("http_" + str(response.status))
        media_type = response.headers.get("Content-Type", "")
        if "json" not in media_type:
            raise RuntimeError("non_json_response")
        raw = response.read(1500000)
        if len(raw) >= 1500000:
            raise RuntimeError("response_too_large")
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise RuntimeError("not_an_object")
    return parsed


def main() -> None:
    print("Starting public identity mirroring (no personal data).", flush=True)
    cursor = None
    seen_cursors = set()
    ids = set()
    keys = set()
    rows = []
    expected_total = None
    pages = 0

    for page_no in range(MAX_PAGES):
        data = get_json(cursor)
        pages += 1
        if data.get("provisional") is True or data.get("degraded") is True or data.get("feedRebuilding") is True:
            raise RuntimeError("source_feed_incomplete_or_degraded")
        page_items = data.get("items")
        if not isinstance(page_items, list):
            raise RuntimeError("items_missing")
        page_total = data.get("totalItems")
        if isinstance(page_total, bool) or not isinstance(page_total, int):
            raise RuntimeError("totalItems_missing")
        if expected_total is None:
            expected_total = page_total
        elif expected_total != page_total:
            raise RuntimeError("catalog_changed_during_pagination")
        if page_total <= 0:
            raise RuntimeError("empty_catalog_not_mirrored_without_review")

        for item in page_items:
            if not isinstance(item, dict):
                raise RuntimeError("invalid_identity")
            raw_id = item.get("id")
            if not isinstance(raw_id, str) or not raw_id or len(raw_id) > 160:
                raise RuntimeError("invalid_id")
            title = item.get("title")
            company = item.get("company")
            if not isinstance(title, str) or not isinstance(company, str) or not title.strip() or not company.strip():
                raise RuntimeError("invalid_title_or_company")
            if raw_id in ids:
                raise RuntimeError("duplicate_identity_id")
            ids.add(raw_id)
            work = item.get("workCommunes") or []
            if not isinstance(work, list) or not all(isinstance(x, str) for x in work):
                raise RuntimeError("invalid_territory")
            raw_url = item.get("url") if isinstance(item.get("url"), str) else ""
            canonical = canonical_url(raw_url)
            digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest() if canonical else ""
            listed_digest = item.get("urlHashSha256")
            if listed_digest and digest and listed_digest != digest:
                raise RuntimeError("url_hash_disagreement_for_" + raw_id[:40])
            identity = {
                "id": raw_id,
                "title": title.strip()[:180],
                "company": company.strip()[:140],
                "workCommunes": sorted(set(work)),
                "url": canonical,
                "urlHashSha256": digest,
            }
            key = (identity["title"].casefold(), identity["company"].casefold(), tuple(identity["workCommunes"]), identity["url"])
            if key in keys:
                # Duplicate display identities in existing catalog are not our sync failure;
                # retain both IDs for forensic reconciliation.
                pass
            keys.add(key)
            rows.append(identity)

        has_more = data.get("hasMore")
        next_cursor = data.get("nextCursor")
        if not isinstance(has_more, bool):
            raise RuntimeError("missing_hasMore")
        if has_more:
            if not isinstance(next_cursor, str) or not next_cursor or next_cursor in seen_cursors or data.get("complete") is True:
                raise RuntimeError("pagination_loop_or_inconsistent_cursor")
            seen_cursors.add(next_cursor)
            cursor = next_cursor
        else:
            if data.get("complete") is not True or next_cursor:
                raise RuntimeError("no_complete_final_page")
            break
    else:
        raise RuntimeError("too_many_pages")

    if len(rows) == 0 or len(rows) > MAX_IDENTITIES or len(rows) > expected_total:
        raise RuntimeError("catalog_identity_count_invalid")

    # The endpoint returns job-only identities; totalItems can include other public kinds.
    rows.sort(key=lambda x: (x["id"], x["url"]))
    payload = {
        "schema_version": 1,
        "producer": "trabajo_cerca_public_feed",
        "source": SOURCE,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "complete": True,
        "totalItemsReported": expected_total,
        "jobIdentityCount": len(rows),
        "pagesChecked": pages,
        "fingerprint": hashlib.sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest(),
        "items": rows,
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(TARGET.parent), delete=False) as tmp:
        tmp.write(encoded)
        temp_name = tmp.name
    os.replace(temp_name, TARGET)
    print(
        f"CATALOG_SYNC_SUCCESS pages={pages} job_identities={len(rows)} "
        f"total_items={expected_total} fingerprint={payload['fingerprint'][:12]}",
        flush=True,
    )


if __name__ == "__main__":
    main()
