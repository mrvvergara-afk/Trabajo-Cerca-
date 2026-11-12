"""Honest Motor A source-coverage receipt for the morning watchdog.

Only counts sources actually attempted. A visited municipal homepage is
NOT evidence of exhaustive job coverage or successful publication.
"""
from datetime import datetime, timezone
import json
from pathlib import Path

ROOT = Path("output")
DEST = Path("automation/motor_a_review/source_coverage.json")
COMMUNES = {
    "Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén",
    "Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento"
}


def summarize(report, direct, verified):
    if not isinstance(report, dict) or not isinstance(report.get("diagnostics"), list):
        raise ValueError("motor_a_local_report_missing")
    if not isinstance(direct, dict) or not isinstance(direct.get("diagnostics"), list):
        raise ValueError("motor_a_chiletrabajos_report_missing")
    if not isinstance(verified, dict) or not isinstance(verified.get("results"), list):
        raise ValueError("motor_a_verification_report_missing")
    roots = [r for r in report["diagnostics"]
             if isinstance(r,dict) and r.get("source","").startswith(("Municipio ","Arauco ","CMPC ","SERFONAC ","SERFOCOL ","Brayben "))]
    municipalities = [r for r in roots if r["source"].startswith("Municipio ")]
    attempted = {r.get("commune_scope") for r in municipalities}
    readable = {r.get("commune_scope") for r in municipalities
                if isinstance(r.get("pages_scanned"),int) and r["pages_scanned"] > 0}
    failed = [
        {"source":r.get("source"),"commune":r.get("commune_scope"),
         "pages_scanned":r.get("pages_scanned",0),
         "status":r.get("status"),"errors":len(r.get("errors",[]))}
        for r in roots if (r.get("pages_scanned",0)==0 or r.get("status")=="partial")
    ]
    return {
        "schema_version":1,
        "checked_at":verified.get("checked_at"),
        "local_discovery_at":report.get("run_at"),
        "communes_expected":sorted(COMMUNES),
        "municipalities_attempted":sorted(attempted & COMMUNES),
        "municipalities_missing":sorted(COMMUNES-attempted),
        "municipalities_readable":sorted(readable & COMMUNES),
        "municipalities_unreadable":sorted(COMMUNES-readable),
        "local_sources_expected":17,
        "local_sources_attempted":len(roots),
        "local_candidates":len(report.get("candidates",[])),
        "chiletrabajos_queries_attempted":len(direct["diagnostics"]),
        "chiletrabajos_candidates":direct.get("candidate_count"),
        "job_details_checked":verified.get("checked",0),
        "ready_for_d_review":verified.get("review_ready",0),
        "publication_confirmed":False,
        "coverage_complete":False,
        "source_failures":failed,
        "note":"Index attempts and candidate counts do not prove full source access or publication."
    }


def main():
    def load(p):
        return json.loads(p.read_text(encoding="utf-8"))
    receipt = summarize(
        load(ROOT/"report.json"),
        load(ROOT/"chiletrabajos_direct.json"),
        load(ROOT/"verification_stage.json"))
    DEST.parent.mkdir(parents=True,exist_ok=True)
    DEST.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("MOTOR_A_SOURCE_COVERAGE "+json.dumps({
        key:receipt[key] for key in ("municipalities_attempted","municipalities_unreadable",
            "local_sources_attempted","local_candidates",
            "chiletrabajos_candidates","job_details_checked","ready_for_d_review")},
        ensure_ascii=False))


if __name__=="__main__":
    main()
