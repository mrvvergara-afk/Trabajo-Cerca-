"""Motor D: primera pasada EXPRESS + recuperación acotada de ofertas antiguas vigentes.
No declara publicación: AppDeploy debe deduplicar contra catálogo y confirmar visibilidad pública.
El histórico A/B/C/Gemini y sus colas no se leen ni se reabren aquí.
"""
import hashlib
import ipaddress
import json
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlsplit, parse_qsl, urlencode

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
        query = urlencode(sorted((k,v) for k,v in parse_qsl(parsed.query) if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}))
        return "https://"+host+(parsed.path.rstrip("/") or "/") + ("?"+query if query else "")
    except (ValueError,TypeError):
        return None

def normalize(value):
    raw = unicodedata.normalize("NFD", str(value or "").casefold())
    raw = "".join(ch for ch in raw if unicodedata.category(ch) != "Mn")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", raw).split())

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

    if item.get("deadline"):
        try:
            if date.fromisoformat(item["deadline"]) < today:
                return "DESCARTADO", "plazo_vencido", None
        except (ValueError, TypeError):
            return "SEGUNDA_PASADA", "plazo_invalido", None
    work = {"Mininco": "Collipulli", "Coihue": "Negrete"}.get(item.get("work_commune"), item.get("work_commune"))
    company = str(item.get("employer") or "").strip()
    title = str(item.get("title") or "").strip()
    published = item.get("date_source")
    if not isinstance(published,str) or not re.fullmatch(r"20\d{2}-\d{2}-\d{2}",published):
        return "SEGUNDA_PASADA","fecha_original_no_acreditada; verificar fecha y vigencia",None
    try:
        day = date.fromisoformat(published)
    except ValueError:
        return "SEGUNDA_PASADA","fecha_original_invalida",None
    if day > today:
        return "SEGUNDA_PASADA","fecha_original_futura; revisar dato fuente",None

    normalized_title=normalize(title)
    explicit = re.search(r"\bcomuna (?:de )?(los angeles|los sauces|angol|lumaco|traiguen|renaico|nacimiento|negrete|mulchen|collipulli|victoria|puren|ercilla|temuco)\b", normalized_title)
    if explicit and explicit.group(1) != normalize(work):
        return "SEGUNDA_PASADA", "comuna_contradice_cargo", None
    if work not in COMMUNES and re.search(r"\bzona (?:valdivia|constitucion|coyhaique|santiago)\b",normalized_title):
        return "DESCARTADO","zona_de_trabajo_fuera_del_territorio",None
    if (work not in COMMUNES or item.get("source_commune_not_confirmed") is not False or
        len(company)<2 or len(title)<5 or item.get("application_evidence") is not True):
        return "SEGUNDA_PASADA","falta_empresa_comuna_o_postulacion_explicita",None

    age_days=(today-day).days
    batch_type="daily" if age_days <= 1 else "recovery"
    source_id = hashlib.sha256(url.encode()).hexdigest()[:20]
    offer = {
        "id_fuente":"d_"+source_id,
        "cargo":title[:180],
        "empresa":company[:140],
        "comunas":[work],
        "url_original":str(item["url"]),
        "fecha_publicacion":published,
        "fecha_descubrimiento":today.isoformat(),
        "tipo_lote":"radar_diario" if batch_type=="daily" else "recuperacion_vigente",
        "fecha_cierre":item.get("deadline"),
        **{k:item[k] for k in ("review_id", "promotion_id", "ocr_revalidate_after", "ocr_document_sha256") if item.get(k)},
        "justificacion":(
            "Motor D: ficha individual, fecha original, empresa, lugar de trabajo y postulación explícitos. "
            + ("Publicación de hoy o ayer." if batch_type=="daily" else
               "Publicación anterior recuperada durante pruebas; no se detectó cierre explícito y la ficha conserva evidencia de postulación.")
        )
    }
    if batch_type=="daily":
        return "EXPRESS","evidencia_individual_completa_hoy_ayer",offer
    return "RECUPERACION","oferta_antigua_vigente_no_descartar",offer

def build(report,today=None):
    today=today or date.today()
    output={"EXPRESS":[],"RECUPERACION":[],"SEGUNDA_PASADA":[],"TERCERA_PASADA":[],"DESCARTADO":[],"DUPLICADO":[]}
    seen_source_ids=set()
    seen_urls=set()
    seen_job_keys=set()
    for item in report.get("candidates",[]):
        state,reason,offer=classify(item,today)
        if offer:
            canonical=canonical_url(offer["url_original"])
            job_key=(normalize(offer["cargo"]),normalize(offer["empresa"]),
                     tuple(sorted(normalize(x) for x in offer["comunas"])))
            source_id=offer["id_fuente"]
            if source_id in seen_source_ids or canonical in seen_urls or job_key in seen_job_keys:
                state,reason,offer="DUPLICADO","coincide_id_fuente_url_o_cargo_empresa_territorio",None
            else:
                seen_source_ids.add(source_id)
                seen_urls.add(canonical)
                seen_job_keys.add(job_key)
        output[state].append({"url":item.get("url"),"reason":reason,"offer":offer})
    return output

def produce(report,root=READY,today=None):
    today=today or date.today()
    classified=build(report,today)
    root.mkdir(parents=True,exist_ok=True)
    manifest=root/"index.json"
    saved=json.loads(manifest.read_text(encoding="utf8")) if manifest.exists() else {"schema_version":1,"batches":[]}
    batches=list(saved.get("batches",[]))
    seen_ids=set(saved.get("seen_offer_ids",[]))
    def identities(offer):
        keys = {"url:" + str(canonical_url(offer.get("url_original"))),
                "job:" + json.dumps([normalize(offer.get("cargo")), normalize(offer.get("empresa")),
                                    sorted(normalize(x) for x in offer.get("comunas", []))])}
        keys.update(k + ":" + str(offer[k]) for k in ("review_id", "promotion_id") if offer.get(k))
        return keys
    seen_keys = set(saved.get("seen_identity_keys", []))
    # Migrate old manifests from their actual batches, including HTML offers.
    for entry in batches:
        relative = entry.get("file", "")
        if not re.fullmatch(r"\d{8}/motor-d-\d{8}-[a-f0-9]{18}\.json", relative):
            raise ValueError("Referencia de lote inválida")
        previous = json.loads((root / relative).read_text(encoding="utf8"))
        for offer in previous["offers"]:
            seen_keys.update(identities(offer))
    batch_counts={"daily":0,"recovery":0}
    for batch_type,state in (("daily","EXPRESS"),("recovery","RECUPERACION")):
        approved=[]
        for entry in classified[state]:
            offer = entry["offer"]
            keys = identities(offer)
            if offer["id_fuente"] not in seen_ids and not keys & seen_keys:
                approved.append(offer)
                seen_keys.update(keys)
        for start in range(0,len(approved),15):
            chunk=approved[start:start+15]
            fingerprint=hashlib.sha256(json.dumps(
                {"batch_type":batch_type,"offers":chunk},sort_keys=True,ensure_ascii=False
            ).encode()).hexdigest()[:18]
            batch_id=f"motor-d-{today:%Y%m%d}-{fingerprint}"
            path=f"{today:%Y%m%d}/{batch_id}.json"
            batch={"schema_version":1,"approval":"approved_for_publication",
                   "producer":"motor_d_territorial","batch_id":batch_id,
                   "batch_type":batch_type,"offers":chunk}
            target=root/path
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_text(json.dumps(batch,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
            if not any(x.get("batch_id")==batch_id for x in batches):
                batches.append({"batch_id":batch_id,"file":path,"count":len(chunk),
                                "batch_type":batch_type})
            seen_ids.update(offer["id_fuente"] for offer in chunk)
            batch_counts[batch_type]+=len(chunk)
    if len(batches)>256:
        raise RuntimeError("Límite de manifiesto D: no eliminar lotes sin recibo de publicación")
    manifest.write_text(json.dumps({"schema_version":1,"batches":batches,
        "seen_offer_ids":sorted(seen_ids), "seen_identity_keys":sorted(seen_keys),
        "quarantined_batches":saved.get("quarantined_batches", [])},ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    summary={state:len(items) for state,items in classified.items()}
    summary["daily_batch_offers"]=batch_counts["daily"]
    summary["recovery_batch_offers"]=batch_counts["recovery"]
    summary["published_confirmed"]=0  # Solo AppDeploy puede certificar este contador.
    return summary

def main():
    source=ROOT/"territorial_daily.json"
    if not source.exists():
        raise SystemExit("No existe inventario territorial D; no crear lotes de publicación")
    report=json.loads(source.read_text(encoding="utf8"))
    local_day=datetime.now(ZoneInfo("America/Santiago")).date()
    print("MOTOR_D_EXPRESS "+json.dumps(produce(report,today=local_day),ensure_ascii=False))

if __name__=="__main__":
    from zoneinfo import ZoneInfo
    main()
