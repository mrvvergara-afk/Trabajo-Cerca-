#!/usr/bin/env python3
"""Análisis estructural y sin PII de las 52 referencias públicas del radar."""
import collections
import datetime as dt
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from trabajo_cerca_lector_documental import read_manifest

TODAY=dt.date(2026,10,25)

def classify_date(url: str) -> str:
    path=urlsplit(url).path
    match=re.search(r'/(20\d{2})/(0?[1-9]|1[0-2])/',path)
    if not match:
        return "fecha_publicacion_no_deducible"
    year,month=int(match.group(1)),int(match.group(2))
    if (year,month)<(TODAY.year,TODAY.month):
        return "mes_anterior_al_plazo_20d"
    if (year,month)==(TODAY.year,TODAY.month):
        return "mes_actual_revisar_dia_original"
    return "mes_futuro_inconsistente"

def main():
    payload=read_manifest(None)
    dw=payload.get("documentWork",{})
    rows=dw.get("items",[])
    if not isinstance(rows,list):
        raise ValueError("No hay cola")
    counts=collections.Counter(classify_date(str(x.get("url") or "")) for x in rows)
    hosts=collections.Counter(urlsplit(str(x.get("url") or "")).hostname or "(sin host)" for x in rows)
    kinds=collections.Counter(str(x.get("kind","?")) for x in rows)
    # Los conteos son de rutas/meses, no son fechas originales acreditadas ni vacantes.
    output={"schema":"trabajo-cerca.queue-audit.v0.1",
            "checked_at":dt.datetime.now(dt.timezone.utc).isoformat(),
            "queue_total":len(rows),
            "by_date_bucket":dict(counts),
            "by_host":dict(hosts),
            "by_kind":dict(kinds),
            "no_candidate_claimed":True,
            "no_publication_writes":True,
            "paid_calls":0}
    Path("reporte_cola.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(output,ensure_ascii=False,indent=2))

if __name__=="__main__":
    main()
