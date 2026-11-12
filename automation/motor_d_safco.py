"""Extract explicitly open SAFCO forest-job cards as REVIEW-ONLY leads.

Official SAFCO homepage exposes individual role cards, but not original
posting dates or a stable per-role vacancy URL. Capture their existence and
worksite without inventing dates, expiry, or publication eligibility.
"""
import hashlib
import re
import unicodedata
from urllib.parse import urlsplit


BASE="https://safcoltda.cl/"

def fold(value):
    raw=unicodedata.normalize("NFD",str(value or "").casefold())
    return " ".join("".join(c for c in raw if unicodedata.category(c)!="Mn").split())

def allowed_source(url):
    try:
        u=urlsplit(url)
        return (u.scheme=="https" and u.hostname in ("safcoltda.cl","www.safcoltda.cl")
            and u.path in ("","/") and not u.query and not u.fragment
            and u.port is None and not u.username and not u.password)
    except (TypeError,ValueError):
        return False

def extract_open_safco_cards(soup,source_url):
    """Read available role cards from the recruitment section only.

    Company address alone is NOT evidence that every role works in Collipulli.
    The worksite must appear on each card. The source page is not an individual
    listing and its generic contact form is not an application for that role.
    """
    if not allowed_source(source_url):
        raise ValueError("unsupported_safco_source")
    tokens=[x.strip() for x in soup.stripped_strings if x and x.strip()]
    anchors=[i for i,t in enumerate(tokens)
             if fold(t)=="trabaje con nosotros" and
             any(fold(s)=="disponible" for s in tokens[i+1:i+20])]
    if not anchors:
        return []
    tokens=tokens[anchors[-1]+1:]
    results=[];seen=set()
    for pos,token in enumerate(tokens[:240]):
        normalized=fold(token)
        if normalized in ("vacante disponible","postular a este cargo"):
            break
        if normalized!="disponible" or pos+3>=len(tokens):
            continue
        title=tokens[pos+1].strip()
        city=tokens[pos+2].strip()
        if (fold(city)!="collipulli" or len(title)<5
                or re.search(r"https?://|[@<>]",title)):
            continue
        desc=[]
        for entry in tokens[pos+3:pos+15]:
            if fold(entry) in ("ver detalles","disponible","vacante disponible",
                               "postular a este cargo"):
                break
            desc.append(entry.strip())
        if not desc:
            continue
        signature=fold(title)+"|collipulli"
        if signature in seen:
            continue
        seen.add(signature)
        results.append({
            "id":hashlib.sha256(("safco:"+signature).encode()).hexdigest()[:20],
            "url":BASE,"label":title[:180],"title":title[:180],
            "employer":"SAFCO Limitada",
            "work_commune":"Collipulli","explicit_worksite_commune":"Collipulli",
            "source_commune_not_confirmed":False,
            "source_evidence_method":"official_employer_embedded_available_card",
            "status_open_marker":"Disponible",
            "date_source":None,"deadline":None,
            "application_evidence":False,
            "evidence":"embedded_public_job_card",
            "http":200,"index_status":"open",
            "excerpt":" ".join(desc)[:420],
            "needs_individual_date_application_validation":True
        })
    return results
