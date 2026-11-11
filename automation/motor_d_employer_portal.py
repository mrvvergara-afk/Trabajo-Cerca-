"""Strict extraction for public company-specific Chiletrabajos vacancy pages.

Do not confuse the recruiter city with the actual worksite or a relative
"posted N days ago" label with the original posting date.
"""
from __future__ import annotations

from datetime import date
import re
import unicodedata
from urllib.parse import urlsplit

_PATH = re.compile(r"^/empresa/([a-z0-9-]{2,75})/trabajo/([a-z0-9-]{4,200}-\d{5,12})/?$",re.I)
_DATE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")


def _norm(value):
    text=unicodedata.normalize("NFD",str(value or "").casefold())
    text="".join(ch for ch in text if unicodedata.category(ch)!="Mn")
    return re.sub(r"[^a-z0-9]+"," ",text).strip()


def _valid(raw,as_of,allow_future=False):
    if not isinstance(raw,str) or not _DATE.fullmatch(raw):
        return None
    try:
        value=date.fromisoformat(raw)
    except ValueError:
        return None
    if value.year<2020 or (not allow_future and value>as_of):
        return None
    return value.isoformat()


def read_employer_vacancy(soup,url,label,worksite_parser,as_of=None):
    """Read an individual verified HTML job page; None means unsupported URL.

    A malformed or contradictory employer/date retains the vacancy in review:
    never turn a relative date into a calendar posting date.
    """
    as_of=as_of or date.today()
    parsed=urlsplit(url)
    if parsed.scheme!="https" or parsed.hostname!="portal.chiletrabajos.cl":
        return None
    path=_PATH.fullmatch(parsed.path)
    if not path or parsed.query or parsed.fragment:
        return None
    slug=path.group(1)
    heading=soup.find(["h2","h3"])
    company=heading.get_text(" ",strip=True)[:140] if heading else ""
    company_normal=_norm(company)
    slug_normal=_norm(slug)
    # A page with a missing/mismatched employer header is NOT evidence that
    # a specific company published this particular position.
    reliable_company=(company if slug_normal and
        (company_normal==slug_normal or company_normal.startswith(slug_normal+" ")) else None)

    page=soup.get_text(" ",strip=True)
    # The official page prints "Serfonac 2026-11-05 Los Ángeles hace 6 dias".
    # The first date immediately AFTER the employer header is original;
    # dates in job descriptions and expiry dates are never alternatives.
    date_source=None
    if reliable_company:
        marker=re.search(r"(?<!\w)"+re.escape(company)+r"\s+(20\d{2}-\d{2}-\d{2})\b",page[:1800],re.I)
        if marker:
            date_source=_valid(marker.group(1),as_of)
    expired=None
    expiry=re.search(r"\bFecha\s+expiraci[oó]n\s*[:\-]?\s*(20\d{2}-\d{2}-\d{2})\b",page,re.I)
    if expiry:
        expired=_valid(expiry.group(1),as_of,allow_future=True)
    title=label.strip()[:180] if isinstance(label,str) else ""
    path_terms={w for w in _norm(path.group(2).rsplit("-",1)[0]).split() if len(w)>3}
    title_terms=set(_norm(title).split())
    if not title or len(title)<7 or len(title_terms & path_terms)<min(2,len(path_terms)):
        title=""
    # The H1/H2 normally contains only the employer, not the vacancy title.
    # A non-identifiable title must not be replaced by the employer name.
    if not title:
        paper=soup.title.get_text(" ",strip=True) if soup.title else ""
        title=paper.rsplit(" - ",1)[0][:180] if " - " in paper else paper[:180]
        title_terms=set(_norm(title).split())
        if len(title)<7 or len(title_terms & path_terms)<min(2,len(path_terms)):
            title=""
    work=worksite_parser(page)  # Only explicit worksite cues in the vacancy.
    application=any(
        re.fullmatch(r"(?:postular|postularme|postúlate)",link.get_text(" ",strip=True),re.I)
        for link in soup.select("a[href]")
    )
    return {
        "employer":reliable_company,
        "title":title or None,
        "date_source":date_source,
        "date_source_method":"explicit_employer_card" if date_source else "unverified",
        "work_commune":work,
        "application_evidence":application,
        "deadline":expired,
        "source_closed":bool(expired and date.fromisoformat(expired)<as_of),
        "recruitment_commune":None,  # Los Ángeles / Temuco are NOT automatic jobsites.
    }
