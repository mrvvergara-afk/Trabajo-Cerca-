"""Read-only reconciliation: Motor D batches -> exact public catalog evidence.

No repository writes, no import, no publication, no assumptions that a
historical import receipt equals a newly visible job. CI artifacts are evidence,
not the application database or the AppDeploy internal receipts.
"""
import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from motor_d_catalog_probe import URL_FIELDS, read_full_feed, source_identity
from motor_d_express import normalize

READY = Path(__file__).resolve().parent / "motor_d_ready"
BATCH_RE = re.compile(r"^\d{8}/motor-d-\d{8}-[a-f0-9]{18}\.json$")
# Legacy duplicates existed before this check was introduced. Record them,
# but never allow a NEW duplicate to be hidden behind this exception.
KNOWN_ACTIVE_OVERLAPS = {"chiletrabajos:3926105", "chiletrabajos:3732391"}


def _public_job(row):
    return (isinstance(row, dict)
            and row.get("kind") in (None, "job_offer")
            and row.get("active") is not False)


def load_batches(root=READY):
    manifest = json.loads((root / "index.json").read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1 or not isinstance(manifest.get("batches"), list):
        raise ValueError("invalid_manifest")
    quarantined = manifest.get("quarantined_batches", [])
    if not isinstance(quarantined, list):
        raise ValueError("invalid_quarantine")
    quarantine_ids = {str(x.get("batch_id")) for x in quarantined if isinstance(x, dict)}
    if len(quarantine_ids) != len(quarantined):
        raise ValueError("duplicate_or_invalid_quarantine_id")
    parsed, seen_batch_ids = [], set()
    for entry in manifest["batches"]:
        if not isinstance(entry, dict):
            raise ValueError("invalid_batch_entry")
        batch_id, path = entry.get("batch_id"), entry.get("file")
        if (not isinstance(batch_id, str) or not isinstance(path, str)
                or not BATCH_RE.fullmatch(path)
                or not path.endswith("/" + batch_id + ".json")
                or batch_id in seen_batch_ids):
            raise ValueError("invalid_or_duplicate_batch_path")
        seen_batch_ids.add(batch_id)
        payload = json.loads((root / path).read_text(encoding="utf-8"))
        offers = payload.get("offers")
        if (payload.get("schema_version") != 1 or payload.get("batch_id") != batch_id
                or payload.get("producer") != "motor_d_territorial"
                or not isinstance(offers, list) or not 1 <= len(offers) <= 15
                or len(offers) != entry.get("count")):
            raise ValueError("invalid_batch_content:" + batch_id)
        ids = [item.get("id_fuente") for item in offers]
        if any(not isinstance(i, str) or not i for i in ids) or len(ids) != len(set(ids)):
            raise ValueError("duplicate_or_empty_offer_ids_in_batch:" + batch_id)
        parsed.append({"batch_id":batch_id, "quarantined":batch_id in quarantine_ids,
                       "offers":offers, "count":len(offers)})
    if not quarantine_ids.issubset(seen_batch_ids):
        raise ValueError("quarantine_refs_missing_batch")
    return parsed


def reconcile(batches, public_rows, feed_complete, feed_error=None):
    """Return exact-source visibility, possible semantic matches and held batches.

    'visible_by_id' and 'visible_by_source' show current public presence only;
    they do not prove the current run originally published the record.
    """
    if not isinstance(batches, list):
        raise ValueError("invalid_batches")
    live, quarantined = [], []
    active_by_source, quarantine_by_source = defaultdict(list), defaultdict(list)
    for batch in batches:
        for offer in batch["offers"]:
            identity = source_identity(offer.get("url_original"))
            item = {
                "batch_id":batch["batch_id"],
                "id_fuente":offer["id_fuente"], "origin_identity":identity,
                "title":str(offer.get("cargo") or ""),
                "company":str(offer.get("empresa") or ""),
                "work_communes":list(offer.get("comunas") or []),
                "original_date":offer.get("fecha_publicacion"),
                "batch_quarantined":bool(batch["quarantined"]),
            }
            if batch["quarantined"]:
                quarantined.append(item)
                if identity:
                    quarantine_by_source[identity].append(item)
            else:
                live.append(item)
                if identity:
                    active_by_source[identity].append(item)

    active_overlaps = [
        {"origin_identity":key, "batch_ids":sorted(x["batch_id"] for x in value),
         "offer_ids":sorted(x["id_fuente"] for x in value),
         "legacy_known":key in KNOWN_ACTIVE_OVERLAPS}
        for key, value in active_by_source.items() if len(value) > 1
    ]
    active_overlaps.sort(key=lambda x:x["origin_identity"])
    quarantine_repeats = sorted(set(active_by_source) & set(quarantine_by_source))

    public_by_id, public_by_source, public_by_semantic = defaultdict(list), defaultdict(list), defaultdict(list)
    if feed_complete:
        for row in public_rows:
            if not _public_job(row):
                continue
            public_id = row.get("id")
            if isinstance(public_id, str) and public_id:
                public_by_id[public_id].append(row)
            for key in URL_FIELDS:
                value = row.get(key)
                ident = source_identity(value) if isinstance(value, str) else None
                if ident:
                    public_by_source[ident].append(row)
            site_values = row.get("workCommunes")
            if isinstance(site_values, list):
                for site in site_values:
                    if isinstance(site, str):
                        semantic = (normalize(row.get("title")), normalize(row.get("company")), normalize(site))
                        public_by_semantic[semantic].append(row)

    results = []
    for entry in live:
        matches = []
        how = "catalog_unavailable"
        if feed_complete:
            public_id_options = (entry["id_fuente"], "chatgpt_" + entry["id_fuente"])
            exact_by_id = [row for id_ in public_id_options for row in public_by_id.get(id_, [])]
            source = public_by_source.get(entry["origin_identity"], []) if entry["origin_identity"] else []
            if exact_by_id:
                matches = exact_by_id
                how = "visible_by_public_id"
            elif source:
                matches = source
                how = "visible_by_origin_identity"
            else:
                possible = [row for c in entry["work_communes"]
                            for row in public_by_semantic.get((
                                normalize(entry["title"]),normalize(entry["company"]),normalize(c)), [])]
                if possible:
                    matches=possible
                    how="possible_semantic_match_not_confirmed"
                else:
                    how="not_found_in_complete_public_feed"
        distinct_ids = sorted({str(row["id"]) for row in matches
                               if isinstance(row.get("id"), str)})
        results.append({**entry, "status":how, "public_ids":distinct_ids,
                        "multiple_public_ids":len(distinct_ids)>1})
    statuses = Counter(x["status"] for x in results)
    public_source_duplicates = [
        {"origin_identity":key,
         "public_ids":sorted({str(row.get("id")) for row in rows if row.get("id")}),
         "count":len({row.get("id") for row in rows if row.get("id")})}
        for key,rows in sorted(public_by_source.items())
        if len({row.get("id") for row in rows if row.get("id")}) > 1
    ]
    return {
        "schema":"trabajo-cerca.motor-d-manifest-reconciliation.v1",
        "feed_complete":bool(feed_complete), "feed_error":feed_error,
        "public_feed_rows":len(public_rows) if feed_complete else None,
        "batch_count":len(batches), "active_batches":sum(not x["quarantined"] for x in batches),
        "quarantined_batches":sum(x["quarantined"] for x in batches),
        "manifest_offer_records":len(live)+len(quarantined),
        "active_offer_records":len(live), "quarantined_offer_records":len(quarantined),
        "active_source_overlaps":active_overlaps,
        "unexpected_active_source_overlaps":[x for x in active_overlaps if not x["legacy_known"]],
        "held_sources_also_in_active_batches":quarantine_repeats,
        "active_status_counts":dict(sorted(statuses.items())),
        "public_source_duplicate_ids":public_source_duplicates,
        "active_records":results,
        "quarantined_records":[{**x,"status":"quarantined_not_authorized_for_import"} for x in quarantined],
        "created_publications_by_this_check":0,
    }


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",default="resultados/motor_d_reconciliacion.json")
    parser.add_argument("--manifest-root",default=str(READY))
    args=parser.parse_args(argv)
    batches=load_batches(Path(args.manifest_root))
    rows, complete, error=read_full_feed(max_pages=80)
    result=reconcile(batches,rows,complete,error)
    result["checked_at"]=datetime.now(ZoneInfo("America/Santiago")).isoformat()
    target=Path(args.output)
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    summary={key:result[key] for key in ("batch_count","active_offer_records",
        "quarantined_offer_records","feed_complete","public_feed_rows",
        "active_status_counts","active_source_overlaps",
        "unexpected_active_source_overlaps","public_source_duplicate_ids")}
    print("MOTOR_D_MANIFEST_RECONCILIATION "+json.dumps(summary,ensure_ascii=False))
    if not complete:
        print("MOTOR_D_RECONCILIATION_BLOCKED: feed incomplete, no missing claims")
        return 2
    if result["unexpected_active_source_overlaps"] or result["public_source_duplicate_ids"]:
        print("MOTOR_D_RECONCILIATION_ALERT: unexpected multiple publication origins")
        return 3
    return 0


if __name__=="__main__":
    raise SystemExit(main())
