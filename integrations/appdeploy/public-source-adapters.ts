export type PublicAdapter = {
  name:string;
  family:'portal' | 'local' | 'aggregator';
  identityUrl:string;
  verificationMethod:string;
};

const LOCAL_PUBLISHERS:Record<string,string> = {
  'ssan.redsalud.gob.cl':'Servicio de Salud Araucanía Norte',
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
  'wof-chile.com':'WOF Chile',
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
    'es.linkedin.com':['LinkedIn','linkedin'],
    'empleospublicos.cl':['Servicio Civil · Empleos Públicos','empleos_publicos'],
    'laborum.cl':['Laborum','laborum'], 'opcionempleo.cl':['Opción Empleo','opcionempleo'],
    'chiletrabajos.cl':['Chiletrabajos','chiletrabajos'], 'portal.chiletrabajos.cl':['Chiletrabajos','chiletrabajos'],
    'bne.gob.cl':['Bolsa Nacional de Empleo','bne'], 'bne.cl':['Bolsa Nacional de Empleo','bne'],
    'cmpc.trabajando.cl':['CMPC · portal de empleo','cmpc_jobs'],
    'cmpc.csod.com':['CMPC · portal de empleo','cmpc_jobs'],
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
  } else if (host === 'portal.chiletrabajos.cl' && (match=url.pathname.match(/^\/empresa\/[^/]+\/trabajo\/([^/]+)\/?$/))) {
    name = 'Chiletrabajos'; identityUrl = 'https://www.chiletrabajos.cl/trabajo/'+match[1];
  } else if (host === 'chiletrabajos.cl' && /^\/trabajo\/[^/]+\/?$/.test(url.pathname)) {
    name = 'Chiletrabajos'; identityUrl = 'https://www.chiletrabajos.cl'+url.pathname.replace(/\/$/,'');
  } else if (['indeed.com','cl.indeed.com'].includes(host) && ['/viewjob','/rc/clk'].includes(url.pathname) && /^[a-f0-9]{16}$/i.test(url.searchParams.get('jk') || '')) {
    name = 'Indeed'; identityUrl = 'https://cl.indeed.com/viewjob?jk='+url.searchParams.get('jk')!.toLowerCase();
  } else if (['cl.computrabajo.com','computrabajo.cl'].includes(host) && (match = url.pathname.match(/^\/ofertas-de-trabajo\/(oferta-de-trabajo-de-[^/]+)\/?$/))) {
    name = 'Computrabajo'; identityUrl = 'https://cl.computrabajo.com/ofertas-de-trabajo/'+match[1];
  } else if (['linkedin.com','cl.linkedin.com','es.linkedin.com'].includes(host) && (match = url.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d{6,})\/?$/))) {
    name = 'LinkedIn'; identityUrl = 'https://www.linkedin.com/jobs/view/'+match[1];
  } else if (host === 'laborum.cl' && (match = url.pathname.match(/^\/empleos\/[^/]+-(\d{5,})\.html\/?$/))) {
    name = 'Laborum'; identityUrl = 'https://www.laborum.cl/empleos/oferta-'+match[1]+'.html';
  } else if (host === 'opcionempleo.cl' && (match = url.pathname.match(/^\/jobad\/([a-z0-9]{12,})(?:\.html)?\/?$/i))) {
    name = 'Opción Empleo'; family = 'aggregator'; identityUrl = 'https://www.opcionempleo.cl/jobad/'+match[1].toLowerCase();
  } else if (host==='jobs.arauco.com' && (match=url.pathname.match(/^\/(?:Chile\/)?job\/(?:[^/]+\/)?(\d{5,})\/?$/i))) {
    name='Arauco · portal de empleo';identityUrl='https://jobs.arauco.com/job/'+match[1];
  } else if (host==='cmpc.csod.com' && (match=url.pathname.match(/^\/ux\/ats\/careersite\/4\/home\/requisition\/(\d{1,9})\/?$/)) && url.searchParams.get('c')==='cmpc' && [...url.searchParams.keys()].every(key=>key==='c')) {
    name='CMPC · portal de empleo';identityUrl='https://cmpc.csod.com/ux/ats/careersite/4/home/requisition/'+match[1]+'?c=cmpc';
  } else if (LOCAL_PUBLISHERS[host] && host!=='wof-chile.com' && url.pathname.split('/').filter(Boolean).length &&
      !/^\/(?:noticias?|concursos-publicos|direccion-de-fomento-productivo|category|categoria|tag|page|wp-json|feed)(?:\/\d+)?\/?$/.test(url.pathname) && !url.search) {
    name = LOCAL_PUBLISHERS[host]; family = 'local'; identityUrl = 'https://'+host+url.pathname.replace(/\/$/,'');
  }
  return name ? { name, family, identityUrl, verificationMethod:name+(host==='cmpc.csod.com'?' public career page + official requisition response':name==='Bolsa Nacional de Empleo'?' individual page + official labelled offer':' individual page + matching JobPosting') } : null;
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

// Feed-only equivalence: preserve ingestion keys and source records unchanged.
export function publicFeedIdentity(value:string, documentKey?:string):string | null {
  if (documentKey!==undefined) return publicOfferIdentity(value,documentKey);
  const clean=safePublicUrl(value);
  if (!clean) return null;
  const url=new URL(clean),host=url.hostname.replace(/^www\./,'');
  const path=host==='portal.chiletrabajos.cl'
    ? url.pathname.match(/^\/empresa\/[^/]+\/trabajo\/([^/]+)\/?$/)?.[1]
    : host==='chiletrabajos.cl' ? url.pathname.match(/^\/trabajo\/([^/]+)\/?$/)?.[1] : null;
  const id=path?.match(/(?:^|-)(\d{5,12})$/)?.[1];
  return id ? 'https://www.chiletrabajos.cl/trabajo/'+id : publicOfferIdentity(clean);
}

export function publicJobExclusion(item:Record<string,unknown>):string | null {
  if (item.kind!=='job_offer') return null;
  const clean=typeof item.url==='string' ? safePublicUrl(item.url) : null;
  if (!clean) return 'original_individual_url_missing';
  const url=new URL(clean),host=url.hostname.replace(/^www\./,'');
  if (['chiletrabajos.cl','portal.chiletrabajos.cl'].includes(host) && !publicFeedIdentity(clean)) {
    return 'portal_index_not_individual_offer';
  }
  const publisher=publicPublisher(clean),adapter=publicSourceAdapter(clean);
  if (publisher && !adapter && !publicFeedIdentity(clean)) return 'portal_index_not_individual_offer';
  if (adapter?.family==='aggregator') return 'aggregator_requires_primary_source';
  const title=String(item.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (/^(?:angol|lumaco|los sauces|traiguen|renaico|nacimiento|negrete|mulchen|collipulli|victoria|puren|ercilla|talca|temuco|pozo almonte|los angeles)\s*$/.test(title)) {
    return 'place_name_is_not_a_job_title';
  }
  const explicit=title.match(/\bcomuna\s+(?:de\s+)?(los angeles|los sauces|angol|lumaco|traiguen|renaico|nacimiento|negrete|mulchen|collipulli|victoria|puren|ercilla|temuco)\b/)?.[1];
  const recorded=Array.isArray(item.workCommunes) ? item.workCommunes.map(value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()) : [];
  if (explicit && !recorded.includes(explicit)) return 'workplace_conflicts_with_explicit_job_title';
  if (Array.isArray(item.workCommunes) && item.workCommunes.includes('Victoria')) {
    const path=url.pathname.toLowerCase().replace(/-/g,' ');
    const confirmedBrand=/victoria\s+s\s+secret/.test(path);
    const context=(confirmedBrand ? title.replace(/victoria\s*[’'´`]?\s*s(?=&#8230;|…|$)/g,'') : title)+' '+path;
    const stripped=context.replace(/victoria\s*[’'´`]?\s*s\s+secret/g,'').replace(/nueva\s+victoria/g,'');
    if (stripped!==context && !/\bvictoria\b/.test(stripped)) return 'brand_or_remote_site_is_not_victoria_commune';
  }
  return null;
}
