"""Motor D: primera pasada EXPRESS + recuperación acotada de ofertas antiguas vigentes.
No declara publicación: AppDeploy debe deduplicar contra catálogo y confirmar visibilidad pública.
El histórico A/B/C/Gemini y sus colas no se leen ni se reabren aquí.
"""
import hashlib
from collections import Counter
import ipaddress
import json
import os
import tempfile
import re
import unicodedata
from datetime import date, datetime
from zoneinfo import ZoneInfo
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

def job_source_identity(raw):
    """Stable publisher job ID, independent of Chiletrabajos URL slug changes."""
    canonical = canonical_url(raw)
    if not canonical:
        return None
    parsed = urlsplit(canonical)
    if parsed.hostname == "chiletrabajos.cl":
        match = re.fullmatch(r"/trabajo/(?:[^/]*-)?([0-9]{5,12})",parsed.path)
    elif parsed.hostname == "portal.chiletrabajos.cl":
        # Employer subportals and the standard public listing share a
        # numbered Chiletrabajos job ID. Do not publish the same job twice.
        match = re.fullmatch(r"/empresa/[a-z0-9-]+/trabajo/(?:[^/]*-)?([0-9]{5,12})",parsed.path,re.I)
    else:
        match = None
    return "chiletrabajos:" + match.group(1) if match else None


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
    work = {"mininco": "Collipulli", "coihue": "Negrete", "coigue": "Negrete",
            "collipulli": "Collipulli", "negrete": "Negrete"}.get(
                normalize(item.get("work_commune")), item.get("work_commune"))
    company = str(item.get("employer") or "").strip()
    title = str(item.get("title") or "").strip()
    # A 2-character punctuation marker such as '..' is not a real employer.
    # Do not turn portal placeholders into verified company names.
    employer_key = normalize(company)
    if not employer_key or employer_key in {"n a", "s n", "sin nombre", "no informado", "desconocido"}:
        return "SEGUNDA_PASADA", "empleador_no_identificado", None
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
    candidates = report.get("candidates", [])
    if not isinstance(candidates, list):
        raise ValueError("El inventario debe contener una lista de candidatos")
    for item in candidates:
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
        output[state].append({"url":item.get("url") if isinstance(item, dict) else None,
                              "reason":reason,"offer":offer})
    return output

def atomic_json_write(path, payload):
    """Never leave a truncated ready batch or manifest after an interrupted run."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=".motor_d_", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(json.dumps(payload, ensure_ascii=False, indent=2) + chr(10))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)

def produce(report,root=None,today=None,publication_statuses=None):
    """Stage only eligible unseen offers.

    production main passes COMPLETE-FEED statuses; calling produce directly in
    unit tests / PR dry-runs cannot publish and maintains legacy pure staging.
    """
    root=Path(root) if root is not None else READY
    if publication_statuses is not None and not isinstance(publication_statuses,dict):
        raise ValueError("catalog_statuses_invalid")
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
        stable_source = job_source_identity(offer.get("url_original"))
        if stable_source:
            keys.add("source:" + stable_source)
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
    already_in_public_catalog=0
    for batch_type,state in (("daily","EXPRESS"),("recovery","RECUPERACION")):
        approved=[]
        for entry in classified[state]:
            offer = entry["offer"]
            if publication_statuses is not None:
                public_status=publication_statuses.get(offer["id_fuente"])
                if public_status in ("already_published_source_identity",
                                     "already_published_semantic"):
                    already_in_public_catalog+=1
                    continue
                if public_status!="not_found_in_complete_feed":
                    # Fail closed. Unknown statuses never become new batches.
                    raise ValueError("unverified_public_catalog_status")
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
            is_new_batch = not any(x.get("batch_id")==batch_id for x in batches)
            if is_new_batch and len(batches) >= 256:
                raise RuntimeError("Límite de manifiesto D: no crear lotes huérfanos sin recibo")
            target.parent.mkdir(parents=True,exist_ok=True)
            atomic_json_write(target, batch)
            if is_new_batch:
                batches.append({"batch_id":batch_id,"file":path,"count":len(chunk),
                                "batch_type":batch_type})
            seen_ids.update(offer["id_fuente"] for offer in chunk)
            batch_counts[batch_type]+=len(chunk)
    if len(batches)>256:
        raise RuntimeError("Límite de manifiesto D: no eliminar lotes sin recibo de publicación")
    atomic_json_write(manifest, {"schema_version":1,"batches":batches,
        "seen_offer_ids":sorted(seen_ids), "seen_identity_keys":sorted(seen_keys),
        "quarantined_batches":saved.get("quarantined_batches", [])})
    summary={state:len(items) for state,items in classified.items()}
    # Preserve actionable reasons for why discovery did not become a publishable offer.
    summary["review_reasons"] = {
        state: dict(sorted(Counter(
            entry["reason"] for entry in classified[state]
        ).items()))
        for state in ("SEGUNDA_PASADA", "TERCERA_PASADA", "DESCARTADO", "DUPLICADO")
    }
    summary["public_catalog_duplicates_skipped"]=already_in_public_catalog
    summary["complete_public_catalog_checked"]=publication_statuses is not None
    summary["daily_batch_offers"]=batch_counts["daily"]
    summary["recovery_batch_offers"]=batch_counts["recovery"]
    summary["published_confirmed"]=0  # Solo AppDeploy puede certificar este contador.
    return summary

def validate_inventory_freshness(report, today):
    """Only a fresh territorial scan may create new ready-to-publish batches."""
    if not isinstance(report, dict):
        raise ValueError("Inventario territorial inválido")
    raw = report.get("date")
    if not isinstance(raw, str):
        raise ValueError("Inventario sin fecha de rastreo verificable")
    try:
        scanned = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if scanned.tzinfo is None:
            raise ValueError("Fecha de rastreo sin zona horaria")
        from zoneinfo import ZoneInfo
        scan_day = scanned.astimezone(ZoneInfo("America/Santiago")).date()
    except (ValueError, TypeError, OverflowError) as exc:
        raise ValueError("Fecha de rastreo inválida") from exc
    if not 0 <= (today - scan_day).days <= 1:
        raise ValueError("Inventario territorial vencido o fechado en el futuro")
    return scan_day

def record_publication_gate(report,local_day,state,eligible=0,
                            checked=0,duplicates=0,staged=0,error=None):
    """Persist a truthful per-scan publication decision, even on feed failure."""
    receipt={
        "schema_version":1,
        "scan_date":report.get("date"),
        "checked_at":datetime.now(ZoneInfo("America/Santiago")).isoformat(),
        "run_local_date":local_day.isoformat(),
        "state":state,
        "eligible_before_catalog":eligible,
        "public_catalog_records_checked":checked,
        "already_published_skipped":duplicates,
        "ready_batch_offers_staged":staged,
        "feed_error":error,
        "feed_complete":state in ("completed","no_ready_candidates"),
    }
    atomic_json_write(ROOT/"publication_gate.json",receipt)
    print("MOTOR_D_PUBLICATION_GATE "+json.dumps(receipt,ensure_ascii=False),
          flush=True)
    return receipt


def main():
    source=ROOT/"territorial_daily.json"
    if not source.exists():
        raise SystemExit("No existe inventario territorial D; no crear lotes de publicación")
    report=json.loads(source.read_text(encoding="utf8"))
    local_day=datetime.now(ZoneInfo("America/Santiago")).date()
    validate_inventory_freshness(report, local_day)
    from motor_d_catalog_probe import read_full_feed,check_ready_offers
    from time import sleep
    classified=build(report,local_day)
    offers=[entry["offer"] for name in ("EXPRESS","RECUPERACION")
            for entry in classified[name] if entry["offer"]]
    if not offers:
        summary=produce(report,today=local_day)
        record_publication_gate(report,local_day,"no_ready_candidates")
        print("MOTOR_D_EXPRESS "+json.dumps(summary,ensure_ascii=False))
        return
    rows=[];complete=False;error="not_checked"
    for attempt in range(3):
        rows,complete,error=read_full_feed(max_pages=30)
        if complete:break
        print("MOTOR_D_CATALOG_GATE_RETRY "+json.dumps({
            "attempt":attempt+1,"reason":error,"published":0
        },ensure_ascii=False),flush=True)
        if attempt<2:sleep(2*(attempt+1))
    if not complete:
        # Preserve the completed source scan; no unknown duplicate can be staged
        # from an unavailable or partially paginated public feed.
        record_publication_gate(report,local_day,
            "blocked_catalog_incomplete",eligible=len(offers),error=error)
        return
    statuses=check_ready_offers(offers,rows,True)
    summary=produce(report,today=local_day,publication_statuses=statuses)
    summary["public_feed_records_checked"]=len(rows)
    record_publication_gate(report,local_day,"completed",
        eligible=len(offers),checked=len(rows),
        duplicates=summary["public_catalog_duplicates_skipped"],
        staged=summary["daily_batch_offers"]+summary["recovery_batch_offers"])
    print("MOTOR_D_EXPRESS "+json.dumps(summary,ensure_ascii=False))

if __name__=="__main__":
    from zoneinfo import ZoneInfo
    main()
