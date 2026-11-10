"""Live read-only municipal adapter QA; access != vacancies != publications."""
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from trabajo_cerca.municipal_feed import SITES, discover_municipal


INDEXES={
    "Negrete":"https://www.muninegrete.cl/oficina-municipal-de-intermediacion-laboral-omil/",
    "Victoria":"https://victoriachile.cl/category/omil/",
    "Renaico":"https://municipalidadrenaico.cl/concursos-publicos/",
    "Purén":"https://munipuren.cl/llamados-a-concurso-2026/",
    "Traiguén":"https://mtraiguen.cl/category/bolsa-de-empleo-o-concurso/",
}

def main():
    if set(INDEXES)!={x[0] for x in SITES.values()} or "Quilaco" in INDEXES:
        raise ValueError("scope_changed")
    rows=[]
    for city,url in INDEXES.items():
        result=discover_municipal(url,limit=12,include_html=city in ("Renaico","Purén"))
        rows.append({"commune":city,"status":result["status"],
                     "endpoints":result["checked"],
                     "accessible_endpoints":result["sources_accessible"],
                     "blocked_endpoints":result["sources_blocked"],
                     "candidate_pages_unverified":len(result["pages"]),
                     "pdfs_for_document_review":len(result["documents_for_review"]),
                     "job_pages":[{"url":item["url"],"anchor":item["anchor"],
                                   "review_required":True} for item in result["pages"]],
                     "documents":[{"url":item["url"],"review_required":True}
                                  for item in result["documents_for_review"]]})
    summary={
        "schema":"trabajo-cerca.municipal-feeds-qa.v1",
        "checked_at":datetime.now(ZoneInfo("America/Santiago")).isoformat(),
        "communes_examined":len(rows),
        "accessible_source_endpoints":sum(x["accessible_endpoints"] for x in rows),
        "blocked_source_endpoints":sum(x["blocked_endpoints"] for x in rows),
        "unverified_page_leads":sum(x["candidate_pages_unverified"] for x in rows),
        "pdfs_pending_document_review":sum(x["pdfs_for_document_review"] for x in rows),
        "verified_new_vacancies":0,
        "published_by_this_job":0,
        "writes_to_app":0,
        "note":"A feed/HTML response only proves leads accessible. No employer, worksite, expiry, original post date or catalog publication is inferred.",
        "per_commune":rows,
    }
    output=Path("resultados/qa_municipal_feeds.json")
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("MUNICIPAL_FEEDS_REAL_QA "+json.dumps({
        k:v for k,v in summary.items() if k not in ("per_commune","note")
    },ensure_ascii=False))
    for city in rows:
        print("MUNICIPAL_FEED_STATUS "+json.dumps({
            key:city[key] for key in ("commune","status","accessible_endpoints",
            "blocked_endpoints","candidate_pages_unverified",
            "pdfs_for_document_review")
        },ensure_ascii=False))


if __name__=="__main__":
    main()
