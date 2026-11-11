"""Motor D: audit a daily coverage manifest without treating missing evidence as coverage."""
import argparse
import json
from datetime import date
from pathlib import Path

COMMUNES = ("Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén","Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento")
REQUIRED = ("commune","planned_sources","visited_sources","blocked_sources","unvisited_sources","sources")

def audit(manifest):
    errors=[]
    rows=manifest.get("communes",[])
    if not isinstance(rows,list): return {"ok":False,"errors":["communes_not_array"]}
    names=[r.get("commune") for r in rows if isinstance(r,dict)]
    if sorted(names)!=sorted(COMMUNES): errors.append("territory_not_exactly_12")
    planned=visited=blocked=unvisited=0
    for row in rows:
        if not isinstance(row,dict): errors.append("invalid_commune_row");continue
        name=row.get("commune","?")
        for key in REQUIRED:
            if key not in row: errors.append(f"{name}:missing_{key}")
        sources=row.get("sources",[])
        if not isinstance(sources,list): errors.append(f"{name}:invalid_sources");continue
        counts={"visited":0,"blocked":0,"unvisited":0}
        for item in sources:
            if not isinstance(item,dict): errors.append(f"{name}:invalid_source");continue
            status=item.get("status")
            if status not in counts: errors.append(f"{name}:invalid_status");continue
            if not item.get("url") or not item.get("category"): errors.append(f"{name}:missing_source_identity")
            if status=="visited" and (not item.get("checked_at") or not item.get("result")):
                errors.append(f"{name}:visited_without_evidence")
            counts[status]+=1
        for key,status in (("visited_sources","visited"),("blocked_sources","blocked"),("unvisited_sources","unvisited")):
            if row.get(key)!=counts[status]: errors.append(f"{name}:{key}_mismatch")
        if row.get("planned_sources")!=len(sources): errors.append(f"{name}:planned_sources_mismatch")
        planned+=len(sources);visited+=counts["visited"];blocked+=counts["blocked"];unvisited+=counts["unvisited"]
    try: date.fromisoformat(manifest["run_date"])
    except (KeyError,ValueError,TypeError): errors.append("invalid_run_date")
    return {"ok":not errors,"errors":errors,"planned":planned,"visited":visited,"blocked":blocked,"unvisited":unvisited,"coverage_percent":round(100*visited/planned,2) if planned else 0,"exhaustive":not errors and planned>0 and blocked==0 and unvisited==0}

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("manifest",type=Path)
    args=parser.parse_args()
    result=audit(json.loads(args.manifest.read_text(encoding="utf-8")))
    print(json.dumps(result,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result["ok"] else 1)
