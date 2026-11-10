"""Close municipal PDF review cycle against B/C pending cases and public feed.

No publication, OCR approval, reactivation of closed vacancies or queue
mutation. Readable public PDFs are evaluated through the existing safe reader
and leave an idempotent, reasoned review-only artifact.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from collections import Counter
from pathlib import Path
from zoneinfo import ZoneInfo

from motor_d_catalog_probe import URL_FIELDS, read_full_feed, source_identity
from qa_motor_d_second_pass import reconcile as reconcile_second_pass
from trabajo_cerca.municipal_feed import is_broad_municipal_index
from trabajo_cerca.trabajo_cerca_lector_documental import read_one

DEFAULT_INPUT = Path(__file__).resolve().parent / "motor_d_discovery" / "territorial_daily.json"
AUDIT_INPUT = Path(__file__).resolve().parent / "motor_d_discovery" / "municipal_external_audit_20261109.json"


def external_audit_registry(path=AUDIT_INPUT):
    """User-provided documentary audit; SHA and publisher must match bytes."""
    doc=json.loads(Path(path).read_text(encoding="utf-8"))
    if doc.get("schema")!="trabajo-cerca.municipal-external-audit-evidence.v1":
        raise ValueError("invalid_municipal_external_evidence")
    result={}
    for row in doc.get("items",[]):
        if not isinstance(row,dict) or not isinstance(row.get("sha256"),str):
            raise ValueError("external_evidence_invalid_item")
        key=_url_key(row.get("url"))
        if key in result:
            raise ValueError("external_evidence_duplicate_url")
        result[key]=row
    return result

BLOCKED = {"origen_no_autorizado", "robots_no_confirmado", "lectura_fallida",
           "requiere_render_js"}
NEEDS_OCR = {"sin_texto_o_requiere_ocr"}
REVIEW = {"candidato_para_revision", "candidato_fecha_pendiente",
          "documento_antiguo_revision_vigencia",
          "documento_parcial_revision_obligatoria"}
NONJOB_EVIDENCE = {"sin_evidencia_suficiente"}


def _date(value):
    if not isinstance(value, str):
        return None
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        return None


def _url_key(value):
    if not isinstance(value, str):
        return ""
    value=value.split("#",1)[0].strip()
    return value.replace("https://www.","https://").rstrip("/")


def _catalog_index(rows):
    by_identity={}
    for row in rows:
        if not isinstance(row,dict) or row.get("active") is False:
            continue
        if row.get("kind") not in (None, "job_offer"):
            continue
        for key in URL_FIELDS:
            raw=row.get(key)
            stable=source_identity(raw) if isinstance(raw,str) else None
            if stable:
                by_identity.setdefault(stable,set()).add(str(row.get("id")))
    return by_identity


def classify_document(entry, read, parent_case=None, published=None, today=None,
                      external_evidence=None):
    """Only explicit PDF content can prove a closing date."""
    today=today or dt.date.today()
    status=read.get("decision") if isinstance(read,dict) else "lectura_fallida"
    deadline=_date(read.get("deadline") if isinstance(read,dict) else None)
    content_sha=read.get("sha256") if isinstance(read,dict) else None
    parent_status=parent_case.get("status") if parent_case else None
    parent_owner=parent_case.get("owner") if parent_case else None

    audit_deadline=None
    audit_matched=False
    # External audit may provide a deadline the bounded PDF preview cannot
    # read. Tie it to the exact publisher PDF bytes and original article.
    if isinstance(external_evidence,dict) and isinstance(read,dict):
        sha_matches=(read.get("sha256")==external_evidence.get("sha256")
                     and len(str(read.get("sha256") or ""))==64)
        url_matches=_url_key(entry.get("url"))==_url_key(external_evidence.get("url"))
        parent_matches=_url_key(entry.get("publisher_page"))==_url_key(
            external_evidence.get("publisher_page"))
        if sha_matches and url_matches and parent_matches:
            audit_deadline=_date(external_evidence.get("reported_application_closed_date"))
            audit_matched=bool(audit_deadline and audit_deadline < today)
    if deadline and deadline < today:
        decision="expired_deadline_verified_in_document"
        owner=None
    elif audit_matched:
        decision="expired_reported_by_hash_matched_external_audit"
        owner=None
    elif status in BLOCKED:
        decision="reader_blocked_or_unavailable"
        owner=None
    elif status in NONJOB_EVIDENCE:
        # A weak preview is neither a job nor proof of an empty municipality.
        decision="no_job_signal_in_available_document_text"
        owner=None
    elif (status in NEEDS_OCR or
          status in REVIEW and read.get("extractor") in (
              "image_pdf_needs_ocr","pdf_preview_partial")):
        decision="document_ocr_or_full_review_required"
        owner=parent_owner or "B"
    elif status in REVIEW:
        decision="document_evidence_requires_signed_review"
        owner=parent_owner or "B"
    else:
        decision="document_evidence_unclassified"
        owner=None

    # The PDF may be evidence for an already tracked job, but is NOT
    # automatically another vacancy or another review queue case.
    if decision in ("document_ocr_or_full_review_required",
                    "document_evidence_requires_signed_review"):
        if published:
            decision="parent_offer_already_public_document_only"
            owner=None
        elif parent_case:
            decision="document_attached_to_existing_review"
            owner=None
    return {
        "url":entry.get("url"),
        "publisher_page":entry.get("publisher_page"),
        "source":entry.get("source"),"commune":entry.get("commune"),
        "reader_decision":status,
        "original_classification":read.get("original_classification") if isinstance(read,dict) else None,
        "extractor":read.get("extractor") if isinstance(read,dict) else None,
        "document_sha256":content_sha if isinstance(content_sha,str) and len(content_sha)==64 else None,
        "reader_http":read.get("http") if isinstance(read,dict) else None,
        "evidence_deadline":deadline.isoformat() if deadline else None,
        "external_reported_deadline":audit_deadline.isoformat() if audit_matched else None,
        "external_report_and_document_sha_match":audit_matched,
        "deadline_evidence_basis":("document_text" if deadline else
                                   "user_supplied_external_report_same_pdf_sha"
                                   if audit_matched else None),
        "evidence_source_date_unconfirmed":read.get("source_date_evidence") if isinstance(read,dict) else None,
        "linked_existing_review_id":parent_case.get("evidence_id") if parent_case else None,
        "linked_existing_review_owner":parent_owner,
        "linked_existing_public_ids":sorted(published or []),
        "status":decision,"owner":owner,
        "publication_eligible":False,
        "review_required":owner in ("B","C") or bool(parent_case),
    }


def closeout(report, second_pass, public_rows, feed_complete, reader=read_one, today=None,
             external_evidence=None):
    """Reconcile all PDF references without inventing source or publication dates."""
    if not isinstance(report,dict) or not isinstance(report.get("documents_for_review"),list):
        raise ValueError("territorial_document_report_invalid")
    if not isinstance(second_pass,dict) or not isinstance(second_pass.get("records"),list):
        raise ValueError("second_pass_receipt_invalid")
    today=today or dt.date.today()
    external_evidence=(external_audit_registry() if external_evidence is None
                       else external_evidence)
    parents={_url_key(row["url"]):row for row in second_pass["records"]
             if row.get("owner") in ("B","C")}
    # Read the complete catalog before any PDF can be treated as unrepresented.
    published=_catalog_index(public_rows) if feed_complete else {}
    reviewed=[]
    skipped=[]
    seen_urls=set()
    seen_hashes=set()
    new_queue=[]
    parent_evidence={key:[] for key in parents}
    for item in report["documents_for_review"]:
        if not isinstance(item,dict) or not isinstance(item.get("url"),str):
            raise ValueError("invalid_pdf_reference")
        url=item["url"]
        key=_url_key(url)
        if key in seen_urls:
            skipped.append({"url":url,"status":"duplicate_document_url"})
            continue
        seen_urls.add(key)
        parent=item.get("publisher_page")
        # Category pages are unverified lists; their stray maps, archives
        # and municipal budgeting files must not be sent to B/C.
        if is_broad_municipal_index(parent or ""):
            skipped.append({"url":url,"status":"broad_index_unrelated_pdf_not_queued"})
            continue
        if not feed_complete:
            reviewed.append({"url":url,"publisher_page":parent,"source":item.get("source"),
                             "commune":item.get("commune"),"status":"catalog_unavailable",
                             "publication_eligible":False,"owner":None})
            continue
        read=reader({"url":url,"kind":"document",
                     "source":item.get("source"),"publisher_page":parent},today=today)
        sha=read.get("sha256") if isinstance(read,dict) else None
        if isinstance(sha,str) and len(sha)==64 and sha in seen_hashes:
            skipped.append({"url":url,"status":"duplicate_document_content_sha256",
                            "sha256":sha})
            continue
        if isinstance(sha,str) and len(sha)==64:
            seen_hashes.add(sha)
        parent_case=parents.get(_url_key(parent))
        parent_stable=source_identity(parent) if isinstance(parent,str) else None
        public_ids=published.get(parent_stable,set()) if parent_stable else set()
        outcome=classify_document(
            item,read,parent_case,public_ids,today,
            external_evidence=external_evidence.get(_url_key(item["url"])))
        reviewed.append(outcome)
        if parent_case:
            parent_evidence[_url_key(parent)].append(outcome)
        if outcome["owner"] in ("B","C"):
            new_queue.append(outcome)
    owners=Counter(row.get("owner") for row in second_pass["records"]
                   if row.get("owner") in ("B","C"))
    all_cases=[]
    for row in second_pass["records"]:
        if row.get("owner") not in ("B","C"):
            continue
        linked=parent_evidence.get(_url_key(row["url"]),[])
        audit_expired=sum(x["status"]=="expired_reported_by_hash_matched_external_audit"
                          for x in linked)
        all_cases.append({**row,
            "linked_pdf_evidence_count":len(linked),
            "linked_pdf_evidence_urls":[x["url"] for x in linked],
            "linked_pdf_external_expiry_evidence_count":audit_expired,
            "documentary_review_recommendation":(
                "close_reported_expired_call_with_hash_matched_audit_evidence"
                if audit_expired and audit_expired==len(linked)
                else "continue_evidence_review"),
            "original_B_C_queue_modified":False,
        })
    result={
        "schema":"trabajo-cerca.municipal-pdf-closeout.v1",
        "report_day":str(report.get("date",""))[:10],
        "documents_reported":len(report["documents_for_review"]),
        "documents_examined_or_blocked":len(reviewed),
        "documents_skipped_before_read":len(skipped),
        "public_feed_complete":bool(feed_complete),
        "public_feed_rows":len(public_rows) if feed_complete else None,
        "second_pass_review_count":len(all_cases),
        "second_pass_review_owners":dict(sorted(owners.items())),
        "existing_reviews_with_pdf_evidence":sum(row["linked_pdf_evidence_count"]>0
                                               for row in all_cases),
        "expired_pdf_calls_supported_by_external_sha_audit":sum(
            row["status"]=="expired_reported_by_hash_matched_external_audit"
            for row in reviewed),
        "existing_B_C_cases_with_audited_expiry_evidence":sum(
            row["linked_pdf_external_expiry_evidence_count"]>0
            for row in all_cases),
        "new_pdf_cases_to_B":len(new_queue),
        "new_publications":0,
        "quarantine_modified":False,
        "review_receipts":reviewed,
        "excluded_or_deduplicated_pdf_refs":skipped,
        "status_counts":dict(sorted(Counter(x["status"] for x in reviewed+skipped).items())),
        "joined_existing_review_cases":all_cases,
        "new_document_review_queue":{
            "schema":"trabajo-cerca.document-evidence-review-only.v1",
            "review_only":True,"approved_for_publication":False,
            "items":new_queue,
        },
    }
    return result


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",default=str(DEFAULT_INPUT))
    parser.add_argument("--output",default="resultados/municipal_pdf_closeout.json")
    args=parser.parse_args(argv)
    report=json.loads(Path(args.input).read_text(encoding="utf-8"))
    today=dt.datetime.now(ZoneInfo("America/Santiago")).date()
    public,complete,error=read_full_feed(max_pages=80)
    second=reconcile_second_pass(report,public,complete,error)
    result=closeout(report,second,public,complete,today=today)
    result["public_feed_error"]=error
    out=Path(args.output)
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    queue=out.with_name("municipal_pdf_review_only.json")
    queue.write_text(json.dumps(result["new_document_review_queue"],ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("MUNICIPAL_PDF_CLOSEOUT "+json.dumps({
        k:result[k] for k in (
            "documents_reported","documents_examined_or_blocked",
            "documents_skipped_before_read","public_feed_complete",
            "public_feed_rows","second_pass_review_count",
            "second_pass_review_owners","existing_reviews_with_pdf_evidence",
            "new_pdf_cases_to_B","expired_pdf_calls_supported_by_external_sha_audit",
            "existing_B_C_cases_with_audited_expiry_evidence",
            "status_counts","new_publications")
    },ensure_ascii=False),flush=True)
    return 0 if complete else 2


if __name__=="__main__":
    raise SystemExit(main())
