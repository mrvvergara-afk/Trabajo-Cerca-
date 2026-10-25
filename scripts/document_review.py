"""Page-bound municipal review proposals; never verified offers."""
import datetime as dt
import hashlib
import re

from .common import normalized,parse_date
from .local_history import DATE,literal_date


def review_document(pages,*,source_url,document_url,document_sha256,published_at,now):
    roles={};employers={};windows={};applications=[];starts={};ends={}
    readings=[]
    for original in pages:
        readings.append({**original,'reading':'primary'})
        for i,alternative in enumerate(original.get('alternate_readings',[])):
            readings.append({**original,**alternative,'reading':'alternate_readings:'+str(i)})
    for page in readings:
        lines=page['text'].splitlines()
        def evidence(literal):
            return {'page':page['page'],'text_object_sha256':page['text_object_sha256'],'literal':literal,'reading':page['reading']}
        for i,line in enumerate(lines):
            employer=re.search(r'\bMunicipalidad de\s+([A-Za-zÁÉÍÓÚÑáéíóúñ ]{2,60}?)\s+(?:requiere contratar|llama a concurso)',line,re.I)
            if employer:employers['Municipalidad de '+employer[1]]=evidence(line)
            role=re.match(r'^\s*[0-9IlT]+\s*\|\s*([^|\n]{2,90}?)(?:\s*[‘’\'—–-]?\s*A\s+Honorarios|\s*\|\s*A\s+Honorarios)',line,re.I)
            if role:
                title=role[1].strip(' \t—–-‘’\'')
                salary=re.search(r'\$\s*([0-9.]+)\s+mensual',line,re.I)
                roles.setdefault(normalized(title),{'title':title,'role_evidence':evidence(line),
                    'contract_literal':'A Honorarios','salary_literal':salary[0] if salary else None})
            profile=re.search(r'^\s*(?:\d+[.)]\s*)?Perfil de Cargo:\s*([^\n]{3,100})$',line,re.I)
            heading=re.search(r'BASES GENERALES Y ESPEC[IÍ]FICAS PARA PROVEER CARGO DE\s*\n([^\n]{3,120}?)\s+CATEGOR[IÍ]A',
                              '\n'.join(lines[i:i+3]),re.I)
            title=profile[1].strip() if profile else heading[1].strip() if heading else None
            if title:
                literal=profile[0] if profile else heading[0]
                roles.setdefault(normalized(title),{'title':title,'role_evidence':evidence(literal),
                    'contract_literal':None,'salary_literal':None})
            if re.search(r'Inicio\s+Recepci[oó]n de Antecedentes',line,re.I):
                match=re.search(DATE,line,re.I)
                date=literal_date(match[0]) if match else None
                if date:starts[date.isoformat()]=evidence(line)
            if re.search(r'Cierre\s+de\s+per[ií]odo\s+de\s+recepci[oó]n\s+de\s+postulaciones',line,re.I):
                match=re.search(DATE,line,re.I)
                date=literal_date(match[0],True) if match else None
                if date:ends[date.isoformat()]=evidence(line)
            if re.search(r'recepci[oó]n de antecedentes|postulaciones',line,re.I):
                window=re.search(r'(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de\s+)?(20\d{2})',line,re.I)
                if window:
                    start=literal_date(window[1]+' de '+window[3]+' '+window[4])
                    end=literal_date(window[2]+' de '+window[3]+' '+window[4],True)
                    if start and end and start<=end:windows[(start.isoformat(),end.isoformat())]=evidence(line)
            if re.search(r'Oficina(?: de Partes)?',line,re.I):
                block='\n'.join(lines[max(0,i-1):i+6])
                if (re.search(r'Oficina\s+de Partes',block,re.I) and re.search(r'postulaci|postulante|antecedentes|sobre',block,re.I)
                        and re.search(r'\bcalle\b|\bavenida\b|ubicad[oa] en [^\n]+\n?#?\d+',block,re.I)):
                    applications.append({'kind':'in_person','instructions':block,'evidence':evidence(block)})
    if len(starts)==1 and len(ends)==1:
        start=next(iter(starts));end=next(iter(ends))
        if parse_date(start)<=parse_date(end):
            windows[(start,end)]={'start':starts[start],'end':ends[end]}
    # Conflicting readings remain explicit ambiguity; never select the newest date.
    if len(starts)>1 or len(ends)>1:windows.clear()
    published=parse_date(published_at)
    date_status=('unknown' if not published else 'future' if published>now else
        'within_45_days' if now-published<=dt.timedelta(days=45) else 'older_than_45_days')
    window=next(iter(windows)) if len(windows)==1 else None
    records=[]
    for role in list(roles.values())[:12]:
        identity=hashlib.sha256((source_url+'\0'+document_sha256+'\0'+normalized(role['title'])).encode()).hexdigest()
        records.append({**role,'review_id':identity,'source_url':source_url,'document_url':document_url,
            'document_sha256':document_sha256,'source_published_at':published_at,'source_date_status':date_status,
            'employer':next(iter(employers)) if len(employers)==1 else None,
            'employer_evidence':next(iter(employers.values())) if len(employers)==1 else None,
            'work_commune':None,'workplace_requires_review':True,
            # A shared reception block may belong to a different set of bases
            # inside the same PDF. Profile headings alone do not establish scope.
            'application':applications[0] if len(applications)==1 and (len(roles)==1 or role['contract_literal']=='A Honorarios') else None,
            'application_options':applications,
            'original_application_window':{'start':window[0],'end':window[1],'deadline_precision':'date_only','evidence':windows[window]} if window else None,
            'original_deadline_status':('expired' if parse_date(window[1])<=now else 'not_expired') if window else 'not_confirmed',
            'status':'pending_review','verified':False,'active':False,'published':False})
    return {'schema':'trabajo-cerca.document-review.v1','document_sha256':document_sha256,
            'records':records,'publication_approved':False}
