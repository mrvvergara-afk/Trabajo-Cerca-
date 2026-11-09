"""Read-only Motor D public-catalog check before publishing real batches.

A complete public feed can prove an existing URL/ID or exact semantic match.
It cannot by itself prove that a listing has been published by this run.
"""
import json
import re
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from motor_d_express import canonical_url, normalize

FEED = "https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro/api/listings"
URL_FIELDS = ("url", "sourceUrl", "originalPosterUrl", "applyUrl", "applicationUrl")


def source_identity(raw):
    """Unify Chiletrabajos URL slugs and /trabajo/<id> aliases."""
    clean = canonical_url(raw)
    if not clean:
        return None
    parsed = urlsplit(clean)
    host = (parsed.hostname or "").removeprefix("www.")
    if host == "chiletrabajos.cl":
        path = re.search(r"^/trabajo/([^/]+)/?$", parsed.path)
    elif host == "portal.chiletrabajos.cl":
        path = re.search(r"^/empresa/[^/]+/trabajo/([^/]+)/?$", parsed.path)
    else:
        path = None
    if path:
        number = re.search(r"(?:^|-)([0-9]{5,12})$", path.group(1))
        if number:
            return "chiletrabajos:" + number.group(1)
    return clean


def _fetch_page(cursor):
    query = {"fresh": "1"}
    if cursor:
        query["cursor"] = cursor
    url = FEED + "?" + urlencode(query)
    with urlopen(Request(url, headers={"Accept": "application/json",
                                       "User-Agent": "TrabajoCercaAudit/1.0"}), timeout=12) as response:
        if response.headers.get_content_type() != "application/json":
            raise ValueError("feed_not_json")
        return json.loads(response.read(1_200_000).decode("utf-8"))


def read_full_feed(page_reader=None, max_pages=30):
    """Fetch all pages or fail closed without claiming an offer is absent."""
    page_reader = page_reader or _fetch_page
    items = []
    cursors = set()
    cursor = None
    try:
        for _ in range(max_pages):
            page = page_reader(cursor)
            if (not isinstance(page, dict) or
                    page.get("feedRebuilding") is True or page.get("degraded") is True or
                    not isinstance(page.get("items"), list)):
                return [], False, "feed_rebuilding_or_invalid"
            items.extend(row for row in page["items"] if isinstance(row, dict))
            next_cursor = page.get("nextCursor")
            if not next_cursor:
                total = page.get("totalJobOffers")
                if isinstance(total, int) and len(items) < total:
                    return [], False, "feed_incomplete"
                return items, True, None
            if (not isinstance(next_cursor, str) or len(next_cursor) > 1500
                    or next_cursor in cursors):
                return [], False, "feed_cursor_loop_or_invalid"
            cursors.add(next_cursor)
            cursor = next_cursor
        return [], False, "feed_page_limit"
    except (ValueError, TypeError, OSError, TimeoutError) as exc:
        return [], False, type(exc).__name__
    except Exception as exc:
        # Network-level errors must be recorded and never interpreted as zero jobs.
        return [], False, type(exc).__name__


def check_ready_offers(offers, public_rows, feed_complete):
    """Only source identity or exact cargo+company+worksite count as duplicates."""
    if not feed_complete:
        return {str(x.get("id_fuente")): "catalog_unavailable" for x in offers}
    indexed_urls = set()
    jobs = []
    for row in public_rows:
        for key in URL_FIELDS:
            if isinstance(row.get(key), str):
                identity = source_identity(row[key])
                if identity:
                    indexed_urls.add(identity)
        if row.get("kind") not in (None, "job_offer"):
            continue
        sites = set()
        for key in ("workCommunes", "recruitmentCommunes"):
            values = row.get(key)
            if isinstance(values, list):
                sites.update(normalize(x) for x in values if isinstance(x, str))
        jobs.append((normalize(row.get("title")),
                     normalize(row.get("company")), sites))
    outcomes = {}
    for offer in offers:
        key = str(offer.get("id_fuente"))
        identifier = source_identity(offer.get("url_original"))
        if identifier and identifier in indexed_urls:
            status = "already_published_source_identity"
        else:
            sites = {normalize(x) for x in offer.get("comunas", [])}
            title, company = normalize(offer.get("cargo")), normalize(offer.get("empresa"))
            status = ("already_published_semantic" if
                      any(title == t and company == c and sites.intersection(s)
                          for t, c, s in jobs)
                      else "not_found_in_complete_feed")
        outcomes[key] = status
    return outcomes
