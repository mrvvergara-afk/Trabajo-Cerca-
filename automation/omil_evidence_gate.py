"""OMIL poster intake: evidence -> public-feed comparison -> review receipt.

Read-only by design. Screenshots and social URLs do not become publication
approvals. The QR, employer, origin date and real worksite need verification.
"""
import argparse
import hashlib
import json
import re
from datetime import date
from pathlib import Path

from motor_d_catalog_probe import read_full_feed, check_ready_offers, source_identity
from motor_d_express import COMMUNES

HEX64 = re.compile(r"^[a-f0-9]{64}$")
ALLOWED_KEYS = ("origin_url", "url_original", "source_post_url")


def _iso_day(value):
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return None


def _worksite(entry):
    # A city's presence in a recruiting account or its search result is not
    # proof of the job's workplace; only explicit evidence qualifies.
    commune = entry.get("work_commune")
    if commune == "Mininco":
        commune = "Collipulli"
    elif commune in ("Coihue", "Coigüe"):
        commune = "Negrete"
    return commune if commune in COMMUNES else None


def evaluate(payload, public_rows, feed_complete, feed_error=None):
    if not isinstance(payload, dict) or not isinstance(payload.get("offers"), list):
        raise ValueError("Evidencia OMIL inválida")
    observed = _iso_day(payload.get("observed_at_chile"))
    office_day = _iso_day((payload.get("recruitment_office") or {}).get("application_date"))
    if not observed:
        raise ValueError("Fecha de observación de fuente inválida")
    candidates = []
    receipts = []
    for i, row in enumerate(payload["offers"]):
        if not isinstance(row, dict):
            raise ValueError("Registro de afiche inválido")
        origin = row.get("origin_url") or row.get("url_original")
        origin_identity = source_identity(origin)
        image_hash = row.get("screenshot_sha256") or row.get("document_sha256")
        image_hash_ok = isinstance(image_hash, str) and HEX64.fullmatch(image_hash) is not None
        original = _iso_day(row.get("original_published_date"))
        title = str(row.get("title") or "").strip()
        company = str(row.get("employer_from_portal") or row.get("employer") or "").strip()
        worksite = _worksite(row)
        stable = origin_identity or ("document:" + image_hash if image_hash_ok else None)
        identity = "omil_" + hashlib.sha256((stable or "invalid:" + str(i)).encode()).hexdigest()[:20]
        candidates.append({"id_fuente": identity, "url_original": origin,
                           "cargo": title, "empresa": company,
                           "comunas": [worksite] if worksite else []})
        reasons = []
        if not origin_identity:
            reasons.append("sin_ficha_original_segura_o_permalink_verificable")
        if not image_hash_ok:
            reasons.append("sin_hash_documental_comprobable")
        if not original:
            reasons.append("fecha_original_no_verificada")
        if original and original > observed:
            reasons.append("fecha_original_posterior_a_descubrimiento")
        if not title or not company:
            reasons.append("cargo_o_empresa_no_identificado")
        if not worksite:
            reasons.append("comuna_ejecucion_sin_prueba_explicita")
        if not row.get("qr_application_http_verified", False):
            reasons.append("ruta_de_postulacion_qr_no_verificada")
        if not payload.get("source_perma_posts_known"):
            reasons.append("permalink_red_social_no_verificado")
        receipts.append({
            "evidence_id": identity, "title": title,
            "origin_identity": origin_identity,
            "observed_at": observed,
            "original_published_date": original,
            "omil_application_day": office_day,
            "portal_expiration_date": _iso_day(row.get("portal_expiration_date")),
            "image_sha256": image_hash if image_hash_ok else None,
            "work_commune_confirmed": worksite,
            "reasons": reasons,
        })

    matches = check_ready_offers(candidates, public_rows, feed_complete)
    for record in receipts:
        status = matches[record["evidence_id"]]
        if not feed_complete:
            outcome = "catalog_unavailable"
        elif status.startswith("already_published"):
            outcome = "existing_public_offer"
        else:
            # No candidate may bypass the signed review simply because a
            # source or a human supplied a visually convincing poster.
            outcome = "manual_document_review_required"
        record["catalog_match"] = status
        record["decision"] = outcome
        record["publication_eligible"] = False

    return {
        "schema": "trabajo-cerca.omil-evidence-gate.v1",
        "observed_at": observed,
        "source_profile": payload.get("source_profile"),
        "feed_complete": bool(feed_complete),
        "feed_error": feed_error,
        "public_catalog_checked": len(public_rows) if feed_complete else None,
        "new_publications": 0,
        "existing_count": sum(x["decision"] == "existing_public_offer" for x in receipts),
        "review_count": sum(x["decision"] == "manual_document_review_required" for x in receipts),
        "blocked_count": sum(x["decision"] == "catalog_unavailable" for x in receipts),
        "records": receipts,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    source = json.loads(Path(args.input).read_text(encoding="utf-8"))
    rows, complete, error = read_full_feed(max_pages=80)
    report = evaluate(source, rows, complete, error)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("OMIL_EVIDENCE_GATE " + json.dumps({
        "existing": report["existing_count"],
        "needs_signed_review": report["review_count"],
        "feed_blocked": report["blocked_count"],
        "catalog_rows": report["public_catalog_checked"],
        "published": 0
    }, ensure_ascii=False))
    return 0 if complete else 2


if __name__ == "__main__":
    raise SystemExit(main())
