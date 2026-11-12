"""Motor D second pass: reconcile candidates, then route only real residual evidence.

The report is repeatable, deterministic for a given source report and public
catalog, and read-only. It does not approve OCR, import offers or write to app.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

from motor_d_catalog_probe import URL_FIELDS, read_full_feed, source_identity
from motor_d_express import build, classify, normalize

ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "motor_d_discovery" / "territorial_daily.json"
OUT_OF_TERRITORY = re.compile(
    r"\b(?:valdivia|constitucion|chillan|concepcion|nueva aldea|"
    r"marina arauco|zona norte rm|colina rm|la union|san fernando|"
    r"san vicente|rengo|rancagua|quilpue|villa alemana|"
    r"valparaiso|vina del mar)\b"
)
TARGET_NAMES = re.compile(
    r"\b(?:angol|collipulli|mininco|ercilla|lumaco|capitan pastene|"
    r"los sauces|puren|renaico|traiguen|victoria|mulchen|"
    r"negrete|coihue|coigue|nacimiento)\b"
)
INFORMATIONAL = re.compile(
    r"^(?:postulacion|bodega municipal|tesoreria|equipo de trabajo|"
    r"como postular a los cargos|taller de pro empleo|"
    r"municipalidad de victoria gestiona aumento|"
    r"frontel informa nueva convocatoria a beneficio de subsidio electrico|"
    r"equipo synautis de la araucania obtiene|modifica criterios de concurso)"
)
DOCUMENTAL = re.compile(
    r"\b(?:bases? (?:para |de |del )?(?:llamado|concurso)|"
    r"concursos publicos|oferta laboral|llamado a concurso)\b"
)


def _public(row):
    return isinstance(row, dict) and row.get("kind") in (None, "job_offer") and row.get("active") is not False


def _index_catalog(rows):
    identities, semantic = {}, {}
    for item in rows:
        if not _public(item):
            continue
        for field in URL_FIELDS:
            value = item.get(field)
            ident = source_identity(value) if isinstance(value, str) else None
            if ident:
                identities.setdefault(ident, {})[str(item.get("id"))] = item
        # Recruitment location is not actual worksite. Never use it here.
        sites = item.get("workCommunes")
        if isinstance(sites, list):
            for site in sites:
                if isinstance(site, str):
                    key = (normalize(item.get("title")), normalize(item.get("company")), normalize(site))
                    semantic.setdefault(key, {})[str(item.get("id"))] = item
    return identities, semantic


def _issues(item):
    issues = []
    if not normalize(item.get("employer")):
        issues.append("employer_not_verified")
    if not item.get("date_source"):
        issues.append("original_publication_date_unknown")
    if not item.get("work_commune") or item.get("source_commune_not_confirmed") is not False:
        issues.append("worksite_not_verified")
    if item.get("application_evidence") is not True:
        issues.append("application_route_not_verified")
    return issues



def _safco_card_reviews(report, public_rows, feed_complete):
    """Preserve individual SAFCO role cards without treating their shared URL
    as four distinct fully verified job postings.
    """
    groups = {}
    for row in report["candidates"]:
        if not isinstance(row, dict):
            continue
        if (row.get("source_evidence_method") != "official_employer_embedded_available_card"
                or row.get("url") != "https://safcoltda.cl/"
                or row.get("employer") != "SAFCO Limitada"
                or row.get("work_commune") != "Collipulli"
                or row.get("status_open_marker") != "Disponible"
                or row.get("index_status") != "open" or row.get("http") != 200
                or row.get("date_source") is not None
                or row.get("application_evidence") is not False
                or row.get("needs_individual_date_application_validation") is not True):
            continue
        identifier = row.get("id")
        title = row.get("title")
        if not isinstance(identifier, str) or not re.fullmatch(r"[0-9a-f]{20}", identifier):
            continue
        if not isinstance(title, str) or not (5 <= len(title.strip()) <= 180):
            continue
        groups.setdefault(identifier, []).append(row)
    _, semantic = _index_catalog(public_rows) if feed_complete else ({}, {})
    records = []
    for identifier, variants in sorted(groups.items()):
        first = variants[0]
        title = first["title"].strip()
        conflict = len({(normalize(row["title"]), normalize(row.get("excerpt")))
                        for row in variants}) > 1
        similar = semantic.get(
            (normalize(title), normalize("SAFCO Limitada"), normalize("Collipulli")), {}
        ) if feed_complete else {}
        possible = sorted(x for x in similar if x and x != "None")
        if not feed_complete:
            status, owner = "catalog_unavailable", None
        elif conflict:
            status, owner = "source_card_conflicting_observations_review", "C"
        elif possible:
            status, owner = "possible_semantic_duplicate_needs_review", "C"
        else:
            status, owner = "official_embedded_card_missing_individual_proof", "C"
        records.append({
            "evidence_id": identifier, "source_card_id": identifier,
            "source": first.get("source") or "SAFCO Limitada",
            "url": "https://safcoltda.cl/", "origin_identity": None,
            "title": title, "company": "SAFCO Limitada",
            "work_commune": "Collipulli",
            "original_publication_date": None,
            "discovery_report_date": str(report.get("date") or "")[:10],
            "deadline": None, "source_observations": len(variants),
            "conflicting_source_evidence": conflict,
            "reason_previous": "official_employer_embedded_open_card_without_individual_job_url",
            "missing_evidence": [
                "original_publication_date_unknown",
                "role_specific_application_route_not_verified",
                "individual_job_url_unavailable",
            ],
            "status": status, "owner": owner,
            # A common employer homepage is not an exact job identity.
            "public_ids_exact_origin": [],
            "public_ids_possible_semantic": possible,
            "publication_eligible": False,
        })
    return records

def reconcile(report, public_rows, feed_complete, feed_error=None):
    if not isinstance(report, dict) or not isinstance(report.get("candidates"), list):
        raise ValueError("motor_d_source_report_invalid")
    observed = str(report.get("date") or "")[:10]
    day = date.fromisoformat(observed)
    grouped = build(report, day)
    pending = grouped["SEGUNDA_PASADA"]
    # The same original URL can appear in several commune searches or source
    # indexes. Preserve every observation, but create ONE review receipt per URL.
    observations = {}
    for row in report["candidates"]:
        if isinstance(row, dict) and isinstance(row.get("url"), str):
            observations.setdefault(row["url"], []).append(row)
    by_identity, by_semantic = _index_catalog(public_rows) if feed_complete else ({}, {})
    receipts = []
    handled = set()
    for entry in pending:
        url = entry["url"]
        if not isinstance(url, str) or not url:
            raise ValueError("motor_d_candidate_missing_from_report")
        if url in handled:
            continue
        handled.add(url)
        variants = observations.get(url, [])
        # Keep the matching second-pass observation as the source for the
        # recorded classification reason. Never upgrade review to publication.
        item = next((row for row in variants
                     if classify(row, day)[:2] == ("SEGUNDA_PASADA", entry["reason"])), None)
        if item is None:
            raise ValueError("motor_d_candidate_missing_from_report")
        significant = lambda row: (
            normalize(row.get("title")), normalize(row.get("employer")),
            normalize(row.get("work_commune")), str(row.get("date_source") or ""),
            row.get("application_evidence") is True,
        )
        conflict = len({significant(row) for row in variants}) > 1
        ident = source_identity(entry["url"])
        direct = by_identity.get(ident, {}) if ident else {}
        title, employer = str(item.get("title") or ""), str(item.get("employer") or "")
        work, title_key = item.get("work_commune"), normalize(title)
        semantic_key = (normalize(title), normalize(employer), normalize(work))
        similar = by_semantic.get(semantic_key, {}) if work and employer else {}
        issues = _issues(item)
        public_ids = sorted(x for x in direct if x and x != "None")
        possible_ids = sorted(x for x in similar if x and x != "None")
        owner = None
        if not feed_complete:
            # A transient feed outage must not flood B/C with 51
            # duplicates or masquerade as a missing public record.
            state = "catalog_unavailable"
            owner = None
        elif len(public_ids) > 1:
            state = "public_source_duplicate_needs_resolution"
            owner = "C"
        elif public_ids:
            state = "already_public_confirmed"
        elif conflict:
            state = "source_evidence_conflict_review"
            owner = "C"
        elif possible_ids:
            state = "possible_semantic_duplicate_needs_review"
            owner = "C"
        elif INFORMATIONAL.search(title_key):
            state = "informational_page_not_individual_job"
        elif OUT_OF_TERRITORY.search(title_key) and not TARGET_NAMES.search(title_key):
            state = "outside_12_communes_explicit_title"
        elif DOCUMENTAL.search(title_key):
            state = "document_or_multi_position_review"
            owner = "B"
        elif entry["reason"] == "comuna_contradice_cargo":
            state = "territorial_conflict_review"
            owner = "C"
        elif (item.get("source","").startswith("Fashion's Park")
              and item.get("work_commune") in {"Angol","Victoria"}
              and employer and item.get("application_evidence") is True
              and not item.get("date_source")):
            # Official live ATS can be recoverable without original date.
            # Keep that date null: never manufacture it from discovery day.
            state = "official_ats_original_date_unknown_review"
            owner = "C"
        else:
            state = "missing_source_evidence_review"
            owner = "B" if "employer_not_verified" in issues and item.get("source","").startswith(("Municipio","OMIL","Salud","Hospital")) else "C"
        receipts.append({
            "evidence_id":hashlib.sha256(entry["url"].encode()).hexdigest()[:20],
            "source":item.get("source"),
            "url":entry["url"],
            "origin_identity":ident,
            "title":title,
            "company":item.get("employer"),
            "work_commune":work,
            "original_publication_date":item.get("date_source"),
            "discovery_report_date":observed,
            "deadline":item.get("deadline"),
            "reason_previous":entry["reason"],
            "source_observations":len(variants),
            "conflicting_source_evidence":conflict,
            "missing_evidence":issues,
            "status":state,
            "owner":owner,
            "public_ids_exact_origin":public_ids,
            "public_ids_possible_semantic":possible_ids,
            "publication_eligible":False,
        })
    embedded_cards = _safco_card_reviews(report, public_rows, feed_complete)
    distribution = dict(sorted(Counter(item["status"] for item in receipts).items()))
    card_counts = dict(sorted(Counter(item["status"] for item in embedded_cards).items()))
    owner_counts = dict(sorted(Counter(item["owner"] for item in
                                      receipts + embedded_cards if item["owner"]).items()))
    return {
        "schema":"trabajo-cerca.motor-d-second-pass.v1",
        "report_day":observed,
        "source_candidates":len(report["candidates"]),
        "second_pass_raw_count":len(pending),
        "collapsed_duplicate_second_pass_records":len(pending)-len(receipts),
        "second_pass_count":len(receipts),
        "third_pass_outside_this_cycle":len(grouped["TERCERA_PASADA"]),
        "public_feed_complete":bool(feed_complete),
        "public_feed_rows":len(public_rows) if feed_complete else None,
        "public_feed_error":feed_error,
        "status_counts":distribution,
        "review_owner_counts":owner_counts,
        "embedded_card_review_count":len(embedded_cards),
        "embedded_card_status_counts":card_counts,
        "embedded_card_reviews":embedded_cards,
        "published_by_this_check":0,
        "quarantine_touched":False,
        "records":receipts,
    }


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",default=str(REPORT))
    parser.add_argument("--output",default="resultados/motor_d_second_pass.json")
    args=parser.parse_args(argv)
    source=json.loads(Path(args.input).read_text(encoding="utf8"))
    public, complete, error=read_full_feed(max_pages=80)
    result=reconcile(source,public,complete,error)
    dest=Path(args.output)
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    # B and C consume only the currently actionable remainder. Recreate files
    # atomically on each run, never append stale historical queues.
    for motor in ("B","C"):
        selected=[item for item in result["records"] + result["embedded_card_reviews"]
                  if item["owner"]==motor]
        queue={
            "schema":"trabajo-cerca.motor-d-evidence-queue.v1",
            "owner":motor,
            "report_day":result["report_day"],
            "catalog_complete":result["public_feed_complete"],
            "review_only":True,
            "approved_for_publication":False,
            "count":len(selected),
            "items":selected,
        }
        queue_path=dest.with_name(dest.stem+"_motor_"+motor.lower()+dest.suffix)
        queue_path.write_text(json.dumps(queue,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("MOTOR_D_SECOND_PASS "+json.dumps({
        key:result[key] for key in ("report_day","source_candidates","second_pass_count",
        "embedded_card_review_count","embedded_card_status_counts",
        "public_feed_complete","public_feed_rows","status_counts",
        "review_owner_counts","published_by_this_check")
    },ensure_ascii=False))
    return 0 if complete else 2


if __name__=="__main__":
    raise SystemExit(main())
