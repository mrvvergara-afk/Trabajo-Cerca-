"""Read Motor A review queue as independent original-source D probes.

Source provenance is a lead, never a verified publication decision. All
candidates must be fetched and classified anew by Motor D.
"""
import datetime as dt
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

COMMUNES={"Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén",
          "Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento"}
DEFAULT=Path("automation/motor_a_review/pending.json")


def read(path=DEFAULT,now=None,max_probes=40):
    now=now or dt.datetime.now(dt.timezone.utc)
    if not path.exists():
        return {"status":"no_motor_a_review_queue_yet","total":0,"probes":[]}
    try:
        manifest=json.loads(path.read_text(encoding="utf8"))
    except (ValueError,OSError) as exc:
        raise ValueError("invalid_motor_a_review_data") from exc
    if manifest.get("schema_version")!=1 or not isinstance(manifest.get("items"),list):
        raise ValueError("invalid_motor_a_review_manifest")
    if manifest.get("automatically_published")!=0:
        raise ValueError("motor_a_handoff_must_be_review_only")
    result=[];seen=set();invalid=0;expired=0
    for item in manifest["items"]:
        if not isinstance(item,dict):
            invalid+=1;continue
        url=item.get("url")
        try:parts=urlsplit(url)
        except (ValueError,TypeError):invalid+=1;continue
        if (parts.scheme!="https" or parts.hostname not in
            ("www.chiletrabajos.cl","chiletrabajos.cl") or
            not re.fullmatch(r"/trabajo/[^/?#]+-\d{5,12}",parts.path) or
            parts.query or parts.fragment or parts.port):
            invalid+=1;continue
        if (item.get("work_commune") not in COMMUNES or
            item.get("status")!="recheck_original" or
            item.get("publication_eligible") is not False):
            invalid+=1;continue
        try:
            last=dt.datetime.fromisoformat(item["last_checked_at"].replace("Z","+00:00"))
        except (ValueError,TypeError,AttributeError):
            invalid+=1;continue
        if last>now+dt.timedelta(minutes=5):
            invalid+=1;continue
        if now-last>dt.timedelta(days=45):
            expired+=1;continue
        if url not in seen:
            seen.add(url);result.append((item["work_commune"],
                "Motor A · ficha original a verificar",url))
    # Deterministic rotation of a bounded integration list. Never mistake
    # missing HTTP evidence for a vacancy closed at its employer.
    result.sort(key=lambda row:row[2])
    offset=(int(now.timestamp()//(4*3600))*max_probes)%len(result) if result else 0
    chosen=(result+result)[offset:offset+min(max_probes,len(result))]
    return {"status":"review_only","total":len(result),"probes":chosen,
            "invalid":invalid,"expired":expired,"selected":len(chosen)}


if __name__=="__main__":
    value=read()
    print(json.dumps({k:v for k,v in value.items() if k!="probes"},ensure_ascii=False))
