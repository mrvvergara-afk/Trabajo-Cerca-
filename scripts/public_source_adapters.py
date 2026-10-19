"""Public source identities, mirrored and parity-tested against the app adapter."""
import re
import urllib.parse

try:
    from .common import canonical_url
except ImportError:
    from common import canonical_url

LOCAL_PUBLISHERS = {
    'ssan.redsalud.gob.cl':'Servicio de Salud Araucanía Norte',
    'noticias.angol.cl':'Municipalidad de Angol', 'munilumaco.cl':'Municipalidad de Lumaco',
    'munilossauces.cl':'Municipalidad de Los Sauces', 'mtraiguen.cl':'Municipalidad de Traiguén',
    'municipalidadrenaico.cl':'Municipalidad de Renaico', 'nacimiento.cl':'Municipalidad de Nacimiento',
    'muninegrete.cl':'Municipalidad de Negrete', 'munimulchen.cl':'Municipalidad de Mulchén',
    'municipalidadcollipulli.cl':'Municipalidad de Collipulli', 'malleco7.cl':'Malleco 7',
    'radionativa.cl':'Radio Nativa', 'cmpc.com':'CMPC', 'arauco.com':'Arauco',
    'radioviaducto.cl':'Radio Viaducto', 'lasnoticiasdemalleco.cl':'Las Noticias de Malleco',
}


def offer_identity(value,document_key=None):
    adapter=source_adapter(value)
    if not adapter or adapter['family']=='aggregator':raise ValueError('unsupported_offer_identity')
    if document_key is None:return adapter['identityUrl']
    if adapter['family']!='local' or not isinstance(document_key,str) or not re.fullmatch('[a-f0-9]{64}',document_key):
        raise ValueError('invalid_document_unit_identity')
    return adapter['identityUrl']+'\0document-unit-v1\0'+document_key


def source_adapter(value):
    try:
        url = urllib.parse.urlsplit(canonical_url(value))
        if url.port or any(re.fullmatch(r'access_token|token|api_key|apikey|session|authorization',key,re.I)
                           for key,_ in urllib.parse.parse_qsl(url.query)):
            return None
    except (ValueError, TypeError):
        return None
    host, path = url.hostname.removeprefix('www.'), url.path
    query = urllib.parse.parse_qs(url.query)
    name, identity, family = '', '', 'portal'
    if host in ('bne.gob.cl','bne.cl') and (match := re.fullmatch(r'/oferta/(20\d{2}-\d{1,9})/?',path)):
        name, identity = 'Bolsa Nacional de Empleo', 'https://www.bne.gob.cl/oferta/'+match[1]
    elif host == 'chiletrabajos.cl' and re.fullmatch(r'/trabajo/[^/]+/?',path):
        name, identity = 'Chiletrabajos', 'https://www.chiletrabajos.cl'+path.rstrip('/')
    elif host in ('indeed.com','cl.indeed.com') and path in ('/viewjob','/rc/clk') and re.fullmatch(r'[a-f0-9]{16}',query.get('jk',[''])[0],re.I):
        name, identity = 'Indeed', 'https://cl.indeed.com/viewjob?jk='+query['jk'][0].lower()
    elif host in ('cl.computrabajo.com','computrabajo.cl') and (match := re.fullmatch(r'/ofertas-de-trabajo/(oferta-de-trabajo-de-[^/]+)/?',path)):
        name, identity = 'Computrabajo', 'https://cl.computrabajo.com/ofertas-de-trabajo/'+match[1]
    elif host in ('linkedin.com','cl.linkedin.com') and (match := re.fullmatch(r'/jobs/view/(?:[^/]*-)?(\d{6,})/?',path)):
        name, identity = 'LinkedIn', 'https://www.linkedin.com/jobs/view/'+match[1]
    elif host == 'laborum.cl' and (match := re.fullmatch(r'/empleos/[^/]+-(\d{5,})\.html/?',path)):
        name, identity = 'Laborum', 'https://www.laborum.cl/empleos/oferta-'+match[1]+'.html'
    elif host == 'opcionempleo.cl' and (match := re.fullmatch(r'/jobad/([a-z0-9]{12,})(?:\.html)?/?',path,re.I)):
        name, identity, family = 'Opción Empleo', 'https://www.opcionempleo.cl/jobad/'+match[1].lower(), 'aggregator'
    elif host == 'jobs.arauco.com' and (match := re.fullmatch(r'/(?:Chile/)?job/(?:[^/]+/)?(\d{5,})/?',path,re.I)):
        name, identity = 'Arauco · portal de empleo', 'https://jobs.arauco.com/job/'+match[1]
    elif host=='cmpc.csod.com' and (match := re.fullmatch(r'/ux/ats/careersite/4/home/requisition/(\d{1,9})/?',path)) and query=={'c':['cmpc']}:
        name,identity='CMPC · portal de empleo','https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/'+match[1]+'?c=cmpc'
    elif host in LOCAL_PUBLISHERS and path.strip('/') and not url.query and not re.fullmatch(r'/(?:noticias?|concursos-publicos|direccion-de-fomento-productivo|category|categoria|tag|page|wp-json|feed)(?:/\d+)?/?',path):
        name, identity, family = LOCAL_PUBLISHERS[host], 'https://'+host+path.rstrip('/'), 'local'
    method = ' public career page + official requisition response' if host=='cmpc.csod.com' and name else ' individual page + official labelled offer' if name == 'Bolsa Nacional de Empleo' else ' individual page + matching JobPosting'
    return {'name':name,'family':family,'identityUrl':identity,'verificationMethod':name+method} if name else None


def same_job(left, right):
    first, second = source_adapter(left), source_adapter(right)
    return bool(first and second and first['identityUrl']==second['identityUrl'])
