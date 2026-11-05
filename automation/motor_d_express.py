"""Motor D: primera pasada EXPRESS, sin inventar datos ni declarar publicación.
Produce lotes aprobados únicamente cuando la página individual aporta evidencia explícita.
El receptor AppDeploy debe verificar idempotencia y confirmar visibilidad pública.
"""
import hashlib
import ipaddress
import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path("automation/motor_d_discovery")
READY = Path("automation/motor_d_ready")
COMMUNES = {"Angol","Collipulli","Ercilla","Lumaco","Los Sauces","Purén",
            "Renaico","Traiguén","Victoria","Mulchén","Negrete","Nacimiento"}

def canonical_url(raw):
    try:
        parsed = urlsplit(str(raw))
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.port:
            return None
        host = parsed.hostname.lower().removeprefix("www.")
        if host == "localhost" or host.endswith((".local",".internal")):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            pass
        return "https://"+host+parsed.path.rstrip("/") + ("?"+parsed.query if parsed.query else "")
    except (ValueError,TypeError):
        return None

def classify(item, today=None):
    today = today or date.today()
    if not isinstance(item,dict):
        return "DESCARTADO","registro_invalido",None
    if item.get("evidence") in {"closed","internal_only","directory_not_offer"} or item.get("index_status") == "closed":
        return "DESCARTADO","cierre_o_no_es_oferta_publica",None
    url = canonical_url(item.get("url"))
    if not url:
        return "DESCARTADO","url_no_segura",None
    if item.get("evidence") != "individual_page_with_job_terms" or item.get("http") != 200:
        return "TERCERA_PASADA","no_hay_ficha_individual_legible",None
    work = item.get("work_commune")
    company = str(item.get("employer") or "").strip()
    title = str(item.get("title") or "").strip()
    published = item.get("date_source")
    if (work not in COMMUNES or item.get("source_commune_not_confirmed") is not False or
        len(company)<2 or len(title)<5 or item.get("application_evidence") is not True):
        return "SEGUNDA_PASADA","falta_empresa_comuna_o_postulacion_explicita",None
    try:
        if not isinstance(published,str) or not re.fullmatch(r"20\d{2}-\d{2}-\d{2}",published):
            raise ValueError()
        day = date.fromisoformat(published)
    except ValueError:
        return "SEGUNDA_PASADA","fecha_original_no_acreditada",None
    if not today-timedelta(days=1) <= day <= today:
        return "DESCARTADO","fuera_ventana_diaria_no_implica_cierre",None
    source_id = hashlib.sha256(url.encode()).hexdigest()[:20]
    offer = {
        "id_fuente":"d_"+source_id, "cargo":title[:180], "empresa":company[:140],
        "comunas":[work], "url_original":str(item["url"]), "fecha_publicacion":published,
        "fecha_cierre":None, "justificacion":"Motor D: ficha individual y fecha; empresa, lugar de trabajo y postulación explícitos en la fuente."
    }
    return "EXPRESS","evidencia_individual_completa",offer

def build(report,today=None):
    today=today or date.today()
    output={"EXPRESS":[],"SEGUNDA_PASADA":[],"TERCERA_PASADA":[],"DESCARTADO":[],"DUPLICADO":[]}
    keys=set()
    for item in report.get("candidates",[]):
        state,reason,offer=classify(item,today)
        if offer:
            key=(canonical_url(offer["url_original"]),offer["cargo"].casefold(),offer["empresa"].casefold(),tuple(offer["comunas"]))
            if key in keys:
                state,reason,offer="DUPLICADO","repetida_en_el_mismo_barrido",None
            else:
                keys.add(key)
        output[state].append({"url":item.get("url"),"reason":reason,"offer":offer})
    return output

def produce(report,root=READY,today=None):
    today=today or date.today()
    classified=build(report,today)
    root.mkdir(parents=True,exist_ok=True)
    approved=[x["offer"] for x in classified["EXPRESS"]]
    manifest=root/"index.json"
    saved=json.loads(manifest.read_text(encoding="utf8")) if manifest.exists() else {"schema_version":1,"batches":[]}
    batches=list(saved.get("batches",[]))
    for start in range(0,len(approved),15):
        chunk=approved[start:start+15]
        fingerprint=hashlib.sha256(json.dumps(chunk,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:18]
        batch_id=f"motor-d-{today:%Y%m%d}-{fingerprint}"
        path=f"{today:%Y%m%d}/{batch_id}.json"
        batch={"schema_version":1,"approval":"approved_for_publication",
               "producer":"motor_d_territorial","batch_id":batch_id,"offers":chunk}
        target=root/path
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(json.dumps(batch,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
        if not any(x.get("batch_id")==batch_id for x in batches):
            batches.append({"batch_id":batch_id,"file":path,"count":len(chunk)})
    if len(batches)>256:
        raise RuntimeError("Límite de manifiesto D: no eliminar lotes sin recibo de publicación")
    manifest.write_text(json.dumps({"schema_version":1,"batches":batches},ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    summary={state:len(items) for state,items in classified.items()}
    summary["published_confirmed"]=0  # Solo AppDeploy puede certificar este contador.
    return summary

def main():
    source=ROOT/"territorial_daily.json"
    if not source.exists():
        raise SystemExit("No existe inventario territorial D; no crear lotes de publicación")
    report=json.loads(source.read_text(encoding="utf8"))
    from zoneinfo import ZoneInfo
    local_day=datetime.now(ZoneInfo("America/Santiago")).date()
    print("MOTOR_D_EXPRESS "+json.dumps(produce(report,today=local_day),ensure_ascii=False))

if __name__=="__main__":
    main()
