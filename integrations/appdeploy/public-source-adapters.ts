export type PublicAdapter = {
  name:string;
  family:'portal' | 'local' | 'aggregator';
  identityUrl:string;
  verificationMethod:string;
};

const LOCAL_PUBLISHERS:Record<string,string> = {
  'noticias.angol.cl':'Municipalidad de Angol',
  'munilumaco.cl':'Municipalidad de Lumaco',
  'munilossauces.cl':'Municipalidad de Los Sauces',
  'mtraiguen.cl':'Municipalidad de Traiguén',
  'municipalidadrenaico.cl':'Municipalidad de Renaico',
  'nacimiento.cl':'Municipalidad de Nacimiento',
  'muninegrete.cl':'Municipalidad de Negrete',
  'munimulchen.cl':'Municipalidad de Mulchén',
  'municipalidadcollipulli.cl':'Municipalidad de Collipulli',
  'malleco7.cl':'Malleco 7',
  'radionativa.cl':'Radio Nativa',
  'cmpc.com':'CMPC',
  'arauco.com':'Arauco',
  'radioviaducto.cl':'Radio Viaducto',
  'lasnoticiasdemalleco.cl':'Las Noticias de Malleco',
};

export function publicPublisher(value:string):{ name:string; host:string; group:string } | null {
  const clean = safePublicUrl(value);
  if (!clean) return null;
  const host = new URL(clean).hostname.replace(/^www\./,'');
  if (LOCAL_PUBLISHERS[host]) return { name:LOCAL_PUBLISHERS[host],host,group:host };
  const portals:Record<string,[string,string]> = {
    'indeed.com':['Indeed','indeed'], 'cl.indeed.com':['Indeed','indeed'],
    'cl.computrabajo.com':['Computrabajo','computrabajo'], 'computrabajo.cl':['Computrabajo','computrabajo'],
    'linkedin.com':['LinkedIn','linkedin'], 'cl.linkedin.com':['LinkedIn','linkedin'],
    'laborum.cl':['Laborum','laborum'], 'opcionempleo.cl':['Opción Empleo','opcionempleo'],
    'chiletrabajos.cl':['Chiletrabajos','chiletrabajos'],
    'bne.gob.cl':['Bolsa Nacional de Empleo','bne'], 'bne.cl':['Bolsa Nacional de Empleo','bne'],
    'cmpc.trabajando.cl':['CMPC · portal de empleo','cmpc_jobs'],
    'jobs.arauco.com':['Arauco · portal de empleo','arauco_jobs'],
  };
  return portals[host] ? { name:portals[host][0],host,group:portals[host][1] } : null;
}

export function safePublicUrl(value:string, base?:string):string | null {
  try {
    if (typeof value!=='string' || value.length>2000) return null;
    const url = new URL(value, base);
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if ([...url.searchParams.keys()].some(key => /^(access_token|token|api_key|apikey|session|authorization)$/i.test(key))) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ['fbclid','gclid','trk','trackingId'].includes(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString().length<=2000 ? url.toString() : null;
  } catch { return null; }
}

export function publicSourceAdapter(value:string):PublicAdapter | null {
  const clean = safePublicUrl(value);
  if (!clean) return null;
  const url = new URL(clean), host = url.hostname.replace(/^www\./,'');
  let name = '', identityUrl = '', family:PublicAdapter['family'] = 'portal';
  let match:RegExpMatchArray | null;
  if (['bne.gob.cl','bne.cl'].includes(host) && (match=url.pathname.match(/^\/oferta\/(20\d{2}-\d{1,9})\/?$/))) {
    name='Bolsa Nacional de Empleo';identityUrl='https://www.bne.gob.cl/oferta/'+match[1];
  } else if (host === 'chiletrabajos.cl' && /^\/trabajo\/[^/]+\/?$/.test(url.pathname)) {
    name = 'Chiletrabajos'; identityUrl = 'https://www.chiletrabajos.cl'+url.pathname.replace(/\/$/,'');
  } else if (['indeed.com','cl.indeed.com'].includes(host) && ['/viewjob','/rc/clk'].includes(url.pathname) && /^[a-f0-9]{16}$/i.test(url.searchParams.get('jk') || '')) {
    name = 'Indeed'; identityUrl = 'https://cl.indeed.com/viewjob?jk='+url.searchParams.get('jk')!.toLowerCase();
  } else if (['cl.computrabajo.com','computrabajo.cl'].includes(host) && (match = url.pathname.match(/^\/ofertas-de-trabajo\/(oferta-de-trabajo-de-[^/]+)\/?$/))) {
    name = 'Computrabajo'; identityUrl = 'https://cl.computrabajo.com/ofertas-de-trabajo/'+match[1];
  } else if (['linkedin.com','cl.linkedin.com'].includes(host) && (match = url.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d{6,})\/?$/))) {
    name = 'LinkedIn'; identityUrl = 'https://www.linkedin.com/jobs/view/'+match[1];
  } else if (host === 'laborum.cl' && (match = url.pathname.match(/^\/empleos\/[^/]+-(\d{5,})\.html\/?$/))) {
    name = 'Laborum'; identityUrl = 'https://www.laborum.cl/empleos/oferta-'+match[1]+'.html';
  } else if (host === 'opcionempleo.cl' && (match = url.pathname.match(/^\/jobad\/([a-z0-9]{12,})(?:\.html)?\/?$/i))) {
    name = 'Opción Empleo'; family = 'aggregator'; identityUrl = 'https://www.opcionempleo.cl/jobad/'+match[1].toLowerCase();
  } else if (host==='jobs.arauco.com' && (match=url.pathname.match(/^\/(?:Chile\/)?job\/(?:[^/]+\/)?(\d{5,})\/?$/i))) {
    name='Arauco · portal de empleo';identityUrl='https://jobs.arauco.com/job/'+match[1];
  } else if (LOCAL_PUBLISHERS[host] && url.pathname.split('/').filter(Boolean).length &&
      !/^\/(?:noticias?|concursos-publicos|direccion-de-fomento-productivo|category|categoria|tag|page|wp-json|feed)(?:\/\d+)?\/?$/.test(url.pathname) && !url.search) {
    name = LOCAL_PUBLISHERS[host]; family = 'local'; identityUrl = 'https://'+host+url.pathname.replace(/\/$/,'');
  }
  return name ? { name, family, identityUrl, verificationMethod:name+(name==='Bolsa Nacional de Empleo'?' individual page + official labelled offer':' individual page + matching JobPosting') } : null;
}

export function samePublicJob(left:string, right:string) {
  const first = publicSourceAdapter(left), second = publicSourceAdapter(right);
  return Boolean(first && second && first.identityUrl === second.identityUrl);
}

// Keep legacy URL identities unchanged. Several reviewed jobs may share a document.
export function publicOfferIdentity(value:string, documentKey?:string):string | null {
  const adapter=publicSourceAdapter(value);
  if (!adapter || adapter.family==='aggregator') return null;
  if (documentKey===undefined) return adapter.identityUrl;
  if (adapter.family!=='local' || typeof documentKey!=='string' || !/^[a-f0-9]{64}$/.test(documentKey)) return null;
  return adapter.identityUrl+'\0document-unit-v1\0'+documentKey;
}
