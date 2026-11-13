"""Prepara lotes ChatGPT independientes de Motor D para commit GitHub atómico."""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import re
from datetime import date, datetime, timezone
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlsplit

COMMUNES = {"Angol", "Collipulli", "Ercilla", "Lumaco", "Los Sauces", "Purén", "Renaico",
            "Traiguén", "Victoria", "Mulchén", "Negrete", "Nacimiento"}
ALIASES = {"Mininco": "Collipulli", "Coihue": "Negrete", "Coigüe": "Negrete"}

def prepare(payload: dict, index: dict, day: str | None = None):
    if payload.get("schema_version") != 1 or payload.get("approval") != "approved_for_publication" or payload.get("producer") != "chatgpt_territorial":
        raise ValueError("invalid_chatgpt_approval")
    if index.get("schema_version") != 1 or index.get("producer") != "chatgpt_territorial":
        raise ValueError("invalid_chatgpt_index")
    offers = payload.get("offers")
    if not isinstance(offers, list) or not 1 <= len(offers) <= 15:
        raise ValueError("invalid_batch_size")
    offers = copy.deepcopy(offers)
    prior = set(index.get("seen_offer_ids", []))
    unique = set()
    for offer in offers:
        if not isinstance(offer, dict):
            raise ValueError("invalid_offer")
        key = offer.get("id_fuente")
        if not isinstance(key, str) or not re.fullmatch(r"cg_[a-f0-9]{20}", key) or key in prior or key in unique:
            raise ValueError("duplicate_or_invalid_chatgpt_id")
        unique.add(key)
        for field in ("cargo", "empresa", "url_original", "fecha_publicacion", "fecha_descubrimiento"):
            if not isinstance(offer.get(field), str) or not offer[field].strip():
                raise ValueError("missing_" + field)
        if len(offer["cargo"]) < 5 or len(offer["empresa"]) < 2:
            raise ValueError("invalid_title_or_company")
        url = offer["url_original"]
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or any(ch.isspace() for ch in url):
            raise ValueError("invalid_url")
        host = parsed.hostname.lower()
        if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            raise ValueError("unsafe_url")
        try:
            if not ip_address(host).is_global:
                raise ValueError("unsafe_url")
        except ValueError as exc:
            if str(exc) == "unsafe_url":
                raise
        places = offer.get("comunas")
        if not isinstance(places, list) or not places or not all(isinstance(p, str) for p in places):
            raise ValueError("missing_territory")
        offer["comunas"] = list(dict.fromkeys(ALIASES.get(p, p) for p in places))
        if any(p not in COMMUNES for p in offer["comunas"]):
            raise ValueError("outside_territory")
        for field in ("fecha_publicacion", "fecha_descubrimiento"):
            try:
                parsed_date = date.fromisoformat(offer[field])
            except (ValueError, TypeError):
                raise ValueError("invalid_" + field)
            if parsed_date > datetime.now(timezone.utc).date():
                raise ValueError("future_" + field)
        if date.fromisoformat(offer["fecha_descubrimiento"]) < date.fromisoformat(offer["fecha_publicacion"]):
            raise ValueError("discovery_before_publication")
        if offer.get("fecha_cierre"):
            try:
                closing = date.fromisoformat(offer["fecha_cierre"])
            except (ValueError, TypeError):
                raise ValueError("invalid_fecha_cierre")
            if closing < datetime.now(timezone.utc).date():
                raise ValueError("expired_offer")
    day = day or datetime.now(timezone.utc).strftime("%Y%m%d")
    if not re.fullmatch(r"20[0-9]{6}", day):
        raise ValueError("invalid_day")
    suffix = hashlib.sha256(json.dumps(offers, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:18]
    batch_id = f"chatgpt-{day}-{suffix}"
    relative = f"{day}/{batch_id}.json"
    if any(row.get("batch_id") == batch_id for row in index.get("batches", [])):
        raise ValueError("already_indexed")
    batch = {"schema_version": 1, "approval": "approved_for_publication", "producer": "chatgpt_territorial",
             "batch_id": batch_id, "offers": offers}
    updated = {**index, "batches": [*index["batches"],
                {"batch_id": batch_id, "file": relative, "count": len(offers)}],
               "seen_offer_ids": sorted(prior | unique)}
    return relative, batch, updated

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("reviewed_json", type=Path)
    parser.add_argument("--root", type=Path, default=Path("automation/chatgpt_ready"))
    args = parser.parse_args()
    root = args.root
    rel, batch, updated = prepare(json.loads(args.reviewed_json.read_text(encoding="utf-8")),
                                  json.loads((root / "index.json").read_text(encoding="utf-8")))
    target = root / rel
    if target.exists():
        raise SystemExit("batch_exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(batch, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (root / "index.json").write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"batch_file": str(target), "batch_id": batch["batch_id"], "count": len(batch["offers"]),
                      "publication_confirmed": False, "requires_atomic_git_commit_of_both_files": True}))

if __name__ == "__main__":
    main()
