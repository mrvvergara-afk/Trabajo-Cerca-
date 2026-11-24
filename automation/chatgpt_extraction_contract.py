"""Contrato de extracción independiente; falla cerrado antes de poner ofertas en cola."""
from __future__ import annotations

import hashlib
import ipaddress
import re
import unicodedata
from datetime import date, datetime
from zoneinfo import ZoneInfo
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

COMMUNES = ("Angol", "Collipulli", "Ercilla", "Lumaco", "Los Sauces", "Purén",
            "Renaico", "Traiguén", "Victoria", "Mulchén", "Negrete", "Nacimiento")
ALIASES = {"mininco": "Collipulli", "coihue": "Negrete", "coigue": "Negrete",
           "capitan pastene": "Lumaco", "cohigue": "Negrete", "tijeral": "Renaico", "huelehueico": "Renaico"}
TRACKERS = {"fbclid", "gclid", "msclkid", "igshid", "mc_cid", "mc_eid"}
REQUIRED = {"id_fuente", "cargo", "empresa", "comunas", "ubicacion_trabajo",
            "modalidad", "salario", "url_original", "enlace_postulacion",
            "fecha_publicacion", "fecha_descubrimiento"}
OPTIONAL = {"fecha_cierre", "justificacion", "hash_url_sha256", "url_canonica", "vigencia_fuente", "fecha_verificacion"}
ALL_KEYS = REQUIRED | OPTIONAL
MODALITIES = {"presencial", "hibrida", "remota", "no_informada"}

def fold(value: str) -> str:
    return " ".join("".join(c for c in unicodedata.normalize("NFD", value.casefold())
                    if unicodedata.category(c) != "Mn").split())

CANON_COMMUNES = {fold(city): city for city in COMMUNES}

def normalized_commune(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("invalid_territory")
    key = fold(value)
    if key in ALIASES:
        return ALIASES[key]
    if key not in CANON_COMMUNES:
        raise ValueError("outside_territory")
    return CANON_COMMUNES[key]

def canonical_source_url(raw: str) -> str:
    if not isinstance(raw, str) or len(raw) > 700 or not raw or any(x.isspace() for x in raw):
        raise ValueError("invalid_url")
    try:
        u = urlsplit(raw)
        host = (u.hostname or "").lower().removeprefix("www.")
        port = u.port
    except ValueError as exc:
        raise ValueError("invalid_url") from exc
    if u.scheme != "https" or not host or "." not in host or u.username or u.password or port not in (None, 443):
        raise ValueError("invalid_url")
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise ValueError("unsafe_url")
    try:
        if not ipaddress.ip_address(host).is_global:
            raise ValueError("unsafe_url")
    except ValueError as exc:
        if str(exc) == "unsafe_url":
            raise
    path = u.path.rstrip("/") or "/"
    qs = sorted(((k, v) for k, v in parse_qsl(u.query, keep_blank_values=True)
                 if not k.lower().startswith("utm_") and k.lower() not in TRACKERS))
    return urlunsplit(("https", host, path, urlencode(qs), ""))

def source_identity(raw: str) -> str:
    """A Chiletrabajos numeric ID is stable across URL slugs and host aliases."""
    url=canonical_source_url(raw)
    parsed=urlsplit(url)
    if parsed.hostname=="chiletrabajos.cl":
        match=re.fullmatch(r"/trabajo/(?:[^/]*-)?(\d{5,12})",parsed.path)
        if match:
            return "ct:"+match.group(1)
    return url



def workplace_without_employer_names(value: str) -> str:
    """Never infer location from CMPC / Arauco corporate business names."""
    text = re.sub(r"[^a-z0-9 ]", " ", fold(value))
    text = re.sub(r"\b(?:cmpc\s+)?forestal\s+mininco(?:\s+(?:spa|sa))?\b", " ", text)
    text = re.sub(r"\b(?:bosques?|paneles|remanufactura|maderas|celulosa)\s+arauco(?:\s+(?:spa|sa))?\b", " ", text)
    text = re.sub(r"\barauco\s+(?:spa|sa)\b", " ", text)
    return " ".join(text.split())


def genuine_worksite_mention(source_location: str, name: str) -> bool:
    for match in re.finditer(r"(?<!\w)"+re.escape(fold(name))+r"(?!\w)",source_location):
        before=source_location[:match.start()]
        after=source_location[match.end():]
        if fold(name)=="victoria" and (
            re.search(r"\bnueva\s+$",before) or
            re.match(r"\s*['’]?s\s+secret\b",after)
        ):
            continue
        return True
    return False


def url_hash(raw: str) -> str:
    return hashlib.sha256(canonical_source_url(raw).encode("utf-8")).hexdigest()

def _date(value: str, field: str) -> date:
    if not isinstance(value, str) or not re.fullmatch(r"20\d{2}-\d{2}-\d{2}", value):
        raise ValueError("invalid_" + field)
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("invalid_" + field) from exc

def validate_offer(raw: dict, *, today: date | None = None) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("invalid_offer")
    if set(raw) - ALL_KEYS or REQUIRED - set(raw):
        raise ValueError("invalid_strict_offer_keys")
    offer = raw.copy()
    if not isinstance(offer["id_fuente"], str) or not re.fullmatch(r"cg_[a-f0-9]{20}", offer["id_fuente"]):
        raise ValueError("invalid_chatgpt_id")
    for field, low, high in (("cargo", 5, 180), ("empresa", 2, 140), ("ubicacion_trabajo", 3, 240)):
        value = offer[field]
        if not isinstance(value, str) or not low <= len(value.strip()) <= high:
            raise ValueError("invalid_" + field)
        offer[field] = value.strip()
    if not isinstance(offer["comunas"], list) or not 1 <= len(offer["comunas"]) <= 12:
        raise ValueError("missing_territory")
    communes = list(dict.fromkeys(normalized_commune(c) for c in offer["comunas"]))
    # A location must actually name every declared commune or a known sublocality.
    source_location = workplace_without_employer_names(offer["ubicacion_trabajo"])
    location_communes = {normalized_commune(name) for name in (*COMMUNES, "Mininco", "Coihue", "Coigüe", "Cohigue", "Capitán Pastene", "Tijeral", "Huelehueico")
                         if genuine_worksite_mention(source_location, name)}
    if not set(communes).issubset(location_communes):
        raise ValueError("territory_not_evidenced_in_work_location")
    offer["comunas"] = communes
    if offer["modalidad"] not in MODALITIES:
        raise ValueError("invalid_modalidad")
    if offer["salario"] is not None and (not isinstance(offer["salario"], str) or
                                          not 1 <= len(offer["salario"].strip()) <= 100):
        raise ValueError("invalid_salario")
    if offer["enlace_postulacion"] is not None:
        canonical_source_url(offer["enlace_postulacion"])
    canonical = canonical_source_url(offer["url_original"])
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    if offer.get("hash_url_sha256") not in (None, digest):
        raise ValueError("url_hash_mismatch")
    if offer.get("url_canonica") not in (None, canonical):
        raise ValueError("canonical_url_mismatch")
    offer["url_canonica"] = canonical
    offer["hash_url_sha256"] = digest
    publish = None if offer["fecha_publicacion"] is None else _date(offer["fecha_publicacion"], "fecha_publicacion")
    discover = _date(offer["fecha_descubrimiento"], "fecha_descubrimiento")
    today = today or datetime.now(ZoneInfo("America/Santiago")).date()
    if publish is None:
        if offer.get("vigencia_fuente") != "postulacion_abierta_verificada":
            raise ValueError("undated_needs_open_application_evidence")
        verified = _date(offer.get("fecha_verificacion"), "fecha_verificacion")
        if verified > today or (today - verified).days > 2:
            raise ValueError("stale_or_future_undated_evidence")
    if (publish is not None and publish > today) or discover > today:
        raise ValueError("future_date")
    if publish is not None and discover < publish:
        raise ValueError("discovery_before_publication")
    if offer.get("fecha_cierre"):
        if _date(offer["fecha_cierre"], "fecha_cierre") < today:
            raise ValueError("expired_offer")
    elif "fecha_cierre" in offer and offer["fecha_cierre"] is not None:
        raise ValueError("invalid_fecha_cierre")
    if "justificacion" in offer and (not isinstance(offer["justificacion"], str) or len(offer["justificacion"]) > 500):
        raise ValueError("invalid_justificacion")
    return offer

def validate_batch(offers: list, prior_hashes: set[str] | None = None, *,
                   today: date | None = None,
                   prior_source_identities: set[str] | None = None) -> list[dict]:
    if not isinstance(offers, list) or not 1 <= len(offers) <= 15:
        raise ValueError("invalid_batch_size")
    result = [validate_offer(raw, today=today) for raw in offers]
    hashes = [x["hash_url_sha256"] for x in result]
    if len(hashes) != len(set(hashes)) or set(hashes).intersection(prior_hashes or set()):
        raise ValueError("duplicate_canonical_url_hash")
    origins=[source_identity(x["url_original"]) for x in result]
    if len(origins)!=len(set(origins)) or set(origins).intersection(prior_source_identities or set()):
        raise ValueError("duplicate_original_source_identity")
    ids = [x["id_fuente"] for x in result]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate_chatgpt_id")
    return result
