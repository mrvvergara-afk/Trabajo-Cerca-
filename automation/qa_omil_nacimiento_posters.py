"""Read-only, full-catalog check of three OMIL Nacimiento posts.

User-provided Nov 9 stories are human evidence, not three new unique jobs:
the identical Chiletrabajos listings are dated Nov 5, 2026. No publishing.
"""
import json
from motor_d_catalog_probe import read_full_feed,check_ready_offers,source_identity
from motor_d_express import normalize

POSTS=[
    {"id_fuente":"omil_nacimiento_3923358",
     "cargo":"Mecánico/a Soldador/a de Maquinaria – Nacimiento",
     "empresa":"Serfonac","comunas":["Nacimiento"],
     "url_original":"https://www.chiletrabajos.cl/trabajo/mecanico-a-soldador-a-de-maquinaria-nacimiento-3923358",
     "application_url":"https://forms.gle/7WEpyxwob93bsmb38"},
    {"id_fuente":"omil_nacimiento_3923364",
     "cargo":"Mecánico/a Automotriz – Nacimiento",
     "empresa":"Serfonac","comunas":["Nacimiento"],
     "url_original":"https://www.chiletrabajos.cl/trabajo/mecanico-a-automotriz-nacimiento-3923364",
     "application_url":"https://forms.gle/w4t414rHY8uqWXPb8"},
    {"id_fuente":"omil_nacimiento_3923758",
     "cargo":"Conductor de Transporte de Carga y Personal - Nacimiento",
     "empresa":"Serfonac Ltda","comunas":["Nacimiento"],
     "url_original":"https://www.chiletrabajos.cl/trabajo/conductor-de-transporte-de-carga-y-personal-nacimiento-3923758",
     "application_url":"https://forms.gle/21y5vNEeBhfGkiBZ8"},
]

def audit(rows,complete):
    checks=check_ready_offers(POSTS,rows,complete)
    output=[]
    for offer in POSTS:
        identity=source_identity(offer["url_original"])
        matches=[]
        for row in rows:
            source_fields=("url","sourceUrl","originalPosterUrl","applyUrl","applicationUrl")
            if any(source_identity(row.get(key))==identity for key in source_fields
                   if isinstance(row.get(key),str)):
                matches.append({"id":row.get("id"),"title":row.get("title"),
                                "company":row.get("company"),"sourceUrl":row.get("url"),
                                "active":row.get("active"),"kind":row.get("kind")})
        output.append({"source_id":offer["id_fuente"],
                       "origin_job_id":identity,"title":offer["cargo"],
                       "status":checks[offer["id_fuente"]],
                       "matching_public_records":matches,
                       "public_duplicate_rows_for_same_id":max(0,len(matches)-1),
                       "qr_form_verified_by_http":False})
    return output

def main():
    records,complete,error=read_full_feed(max_pages=80)
    results=audit(records,complete)
    print("OMIL_NACIMIENTO_CATALOG_AUDIT "+json.dumps({
        "feed_complete":complete,"feed_rows":len(records),
        "feed_error":error,"screenshot_observed_at":"2026-11-09",
        "original_portal_publication_date":"2026-11-05",
        "omil_in_person_application_date":"2026-11-12",
        "offers":results,
        "offers_published_by_this_audit":0
    },ensure_ascii=False))
    if not complete:
        raise SystemExit("OMIL_NACIMIENTO_CATALOG_UNAVAILABLE: no absence claims")

if __name__=="__main__":
    main()
