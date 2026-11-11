"""Read-only, independent candidate-vs-public-feed audit for release acceptance.
Never writes offers. Only reads the public listing API.
Candidate metadata independently inspected 2026-11-11.
"""
import json
import difflib
import time
from datetime import datetime, timezone
from motor_d_catalog_probe import read_full_feed, check_ready_offers, normalize

PRIMARY = {
    "angol", "collipulli", "ercilla", "lumaco", "los sauces", "puren",
    "renaico", "traiguen", "victoria", "mulchen", "negrete", "nacimiento"
}
ALIASES = {"mininco": "collipulli", "coihue": "negrete", "coigue": "negrete",
           "capitan pastene": "lumaco"}
# Specific independently seen public postings, not simulated data.
CANDIDATES = [
    {
        "id_fuente": "externa_conaf_144722",
        "cargo": "Guardaparque para el Monumento Natural Contulmo",
        "empresa": "Corporación Nacional Forestal",
        "comunas": ["Purén"],
        "fecha_publicacion": "2026-11-10",
        "url_original": "https://www.empleospublicos.cl/pub/convocatorias/convpostularavisoTrabajo.aspx?c=0&i=144722&j=0&tipo=convpostularavisoTrabajo",
        "source_url": "https://trabajopublico.cl/bases-concurso-para-la-provision-de-cargo-de-una-144722",
        "deadline": "2026-11-23",
    },
    {
        "id_fuente": "externa_conaf_144768",
        "cargo": "Guardaparque para el Parque Nacional Nahuelbuta",
        "empresa": "Corporación Nacional Forestal",
        "comunas": ["Angol"],
        "fecha_publicacion": "2026-11-10",
        "url_original": "https://www.empleospublicos.cl/pub/convocatorias/convpostularavisoTrabajo.aspx?c=0&i=144768&j=0&tipo=convpostularavisoTrabajo",
        "source_url": "https://www.trabajopublico.cl/bases-concurso-para-la-provision-de-cargo-de-una-144768",
        "deadline": "2026-11-23",
    },
    {
        "id_fuente": "externa_serfocol_mulchen_3074287",
        "cargo": "Ayudante de Cancha/Teclero (Vacaciones) Mulchén",
        "empresa": "SERFOCOL S.A.",
        "comunas": ["Mulchén"],
        "fecha_publicacion": "2026-11-09",
        "url_original": "https://www.mipleo.cl/ofertas-de-trabajo/oferta-de-trabajo-en-biobio/ayudante-de-cancha-teclero-vacaciones-mulchen-3074287.html",
        "source_url": "https://www.mipleo.cl/ofertas-de-trabajo/oferta-de-trabajo-en-biobio/ayudante-de-cancha-teclero-vacaciones-mulchen-3074287.html",
        "deadline": None,
    },
    {
        "id_fuente": "externa_serfocol_mulchen_horquilla",
        "cargo": "Operador/a Cargador Frontal con Horquilla (Vacaciones)",
        "empresa": "SERFOCOL S.A.",
        "comunas": ["Mulchén"],
        "fecha_publicacion": "2026-11-10",
        "url_original": "https://www.kitempleo.cl/empleo/113176726/operador-a-cargador-frontal-con-horquilla-vacaciones-mulchen-mulchen",
        "source_url": "https://www.kitempleo.cl/empleo/113176726/operador-a-cargador-frontal-con-horquilla-vacaciones-mulchen-mulchen",
        "deadline": None,
    },
    {
        "id_fuente": "externa_papa_johns_angol",
        "cargo": "Repartidor 20 y 30hrs Local Angol",
        "empresa": "Papa Johns",
        "comunas": ["Angol"],
        # Re-listed 10 Nov by aggregator; older dated copies exist. NOT a confirmed new 10-Nov posting.
        "fecha_publicacion": None,
        "url_original": "https://cl.indeed.com/viewjob?jk=864b255a8d0beac3",
        "source_url": "https://dametrabajo.com/aviso/repartidor-20-y-30hrs-local-angol-papa-johns-c1b6512cdf180c03",
        "deadline": None,
    },
    {
        "id_fuente": "externa_omil_mulchen_8",
        "cargo": "Manipulador de Alimentos / Chef / Maestro de Cocina (08 cupos)",
        "empresa": "Empresa local (OMIL Mulchén)",
        "comunas": ["Mulchén"],
        "fecha_publicacion": None,
        "url_original": "https://www.munimulchen.cl/oferta-laboral-manipulador-de-alimentos-chef-maestro-de-cocina-08-cupos/",
        "source_url": "https://www.munimulchen.cl/oferta-laboral-manipulador-de-alimentos-chef-maestro-de-cocina-08-cupos/",
        "deadline": None,
    },
]


def place(c):
    norm = normalize(c)
    return ALIASES.get(norm, norm)


def candidate_crosscheck(rows):
    statuses = check_ready_offers(CANDIDATES, rows, True)
    local = []
    for row in rows:
        if row.get("kind") != "job_offer":
            continue
        locs = (row.get("workCommunes") or []) + (row.get("recruitmentCommunes") or [])
        if any(place(str(c)) in PRIMARY for c in locs):
            local.append(row)
    records = []
    for item in CANDIDATES:
        result = statuses[item["id_fuente"]]
        possible = []
        for row in local:
            if not any(place(str(c)) in set(place(x) for x in item["comunas"])
                       for c in (row.get("workCommunes") or []) + (row.get("recruitmentCommunes") or [])):
                continue
            title = difflib.SequenceMatcher(None, normalize(item["cargo"]), normalize(row.get("title"))).ratio()
            employer = difflib.SequenceMatcher(None, normalize(item["empresa"]), normalize(row.get("company"))).ratio()
            if title >= .55 or (title >= .36 and employer >= .72):
                possible.append({"id": row.get("id"), "title": str(row.get("title"))[:100],
                                 "company": str(row.get("company"))[:70],
                                 "titleSimilarity": round(title, 3), "employerSimilarity": round(employer, 3)})
        possible.sort(key=lambda x:(x["titleSimilarity"]+x["employerSimilarity"]), reverse=True)
        records.append({"id_fuente": item["id_fuente"], "cargo": item["cargo"],
                        "comuna": item["comunas"][0], "fecha_publicacion": item["fecha_publicacion"],
                        "url_fuente": item["source_url"], "catalog_status": result,
                        "possible_semantic_matches": possible[:3]})
    return {"checkedAt": datetime.now(timezone.utc).isoformat(), "read_only": True,
            "feed_items": len(rows), "feed_jobs": sum(1 for r in rows if r.get("kind") == "job_offer"),
            "local_unique_offers": len(local), "catalog_complete": True, "candidates": records}


def main():
    feed = []; complete = False; error = "not_started"
    for attempt in range(3):
        feed, complete, error = read_full_feed(max_pages=30)
        if complete:
            break
        print("CATALOG_READ_RETRY", json.dumps({"attempt": attempt + 1, "error": error}))
        time.sleep(2 * (attempt + 1))
    if not complete:
        print(json.dumps({"status":"blocked", "reason":"incomplete_public_feed",
                          "error":error, "read_only":True},ensure_ascii=False))
        return 1
    print("INDEPENDENT_JOB_CROSSCHECK", json.dumps(candidate_crosscheck(feed),
                                                  ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
