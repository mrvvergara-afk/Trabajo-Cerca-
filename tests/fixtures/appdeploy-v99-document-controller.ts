// Verbatim controller function excerpts from AppDeploy snapshot 1791924889565.
// Test input only; not a replacement backend entry point.
const PILOT = ['Angol','Collipulli','Ercilla','Renaico','Mininco','Nacimiento','Negrete','Mulchén','Los Sauces','Purén','Traiguén','Lumaco','Victoria'];

const ADULT_BLOCKED_DOMAINS = [
  'xnxx.com','xvideos.com','pornhub.com','redtube.com','youporn.com','onlyfans.com',
  'chaturbate.com','stripchat.com','livejasmin.com','adultfriendfinder.com',
];

const DISCOVERY_MAX_AGE_DAYS = 45;

const VERIFICATION_VERSION = '2026-10-04-v14-source-aware-stable';

function normalizeText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizedMatchText(value: unknown) {
  return normalizeText(value).toLocaleLowerCase('es-CL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function urlHost(url?:string) {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, '').toLocaleLowerCase('es-CL'); } catch { return ''; }
}

function unsafeContentReason(text:string, url?:string) {
  const host = urlHost(url);
  if (host && ADULT_BLOCKED_DOMAINS.some(domain => host === domain || host.endsWith('.' + domain))) return 'Fuente de contenido adulto o sexual bloqueada.';
  const normalized = normalizedMatchText(text + ' ' + (url || ''));
  if (/\b(porn|porno|pornografia|xxx|xnxx|xvideos|pornhub|redtube|youporn|onlyfans|escort|servicio sexual|servicios sexuales|masaje erotico|masajes eroticos|contenido adulto|sexo explicito|camgirl|webcam sexual|sugar baby|sugar daddy)\b/.test(normalized)) return 'Contenido sexual o erótico no permitido.';
  if (/\b(supremacia racial|supremacista|raza superior|raza inferior|limpieza etnica|odio racial|odio racista)\b/.test(normalized)) return 'Contenido racista o de odio no permitido.';
  if (/\b(matar a|golpear a|humillar a|amenazar a)\b/.test(normalized)) return 'Contenido agresivo o degradante no permitido.';
  if (/\b(paga\w* para postular|clave bancaria|codigo de seguridad)\b/.test(normalized)) return 'Señal de fraude o solicitud insegura.';
  return '';
}

function parseDiscoveryDate(value:string) {
  const original = socialSourceDate(value);
  return original ? Date.parse(original) : undefined;
}

function staleDiscoveryDate(value:string, maxAgeDays=DISCOVERY_MAX_AGE_DAYS) {
  const parsed = parseDiscoveryDate(value);
  if (!parsed) return false;
  const age = Date.now() - parsed;
  return age > maxAgeDays * 86400000 || age < 0;
}

function sourceDateLabel(value:string) {
  const parsed = parseDiscoveryDate(value);
  if (!parsed) return 'Fecha por confirmar';
  const d = new Date(parsed);
  return String(d.getUTCDate()).padStart(2,'0') + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + d.getUTCFullYear();
}

function isCurrentlyActive(item: ListingRecord) {
  if (!item.active) return false;
  const now = Date.now();
  if (item.kind === 'job_offer' && item.review) {
    const created = Date.parse(item.createdAt);
    if (Number.isFinite(created) && now - created > 7 * 86400000) return false;
  }
  if (!item.expiresAt) return true;
  return now <= Date.parse(item.expiresAt);
}

function publicRecord<T extends ListingRecord & { id: string }>(item: T) {
  const { ownerToken: _ownerToken, contact, evidenceImagePath: _evidenceImagePath, socialEvidence: _socialEvidence, ...safe } = item;
  return { ...safe, hasContact: Boolean(contact) };
}

function projectFeedListing(value:Record<string, unknown> & { id:string }) {
  const item = value as unknown as ListingRecord & { id:string };
  if (typeof value.externalIdentity === 'string') {
    const checked = Date.parse(String(value.externalVerifiedAt || ''));
    if (!Number.isFinite(checked) || checked > Date.now() || Date.now() - checked > 86400000) return null;
  }
  if (!isCurrentlyActive(item)) return null;
  if (item.kind === 'job_offer') {
    if (!item.verified || item.review) return null;
    if (!item.workCommunes?.some(commune => PILOT.some(target => normalizeText(target).toLocaleLowerCase('es-CL') === normalizeText(commune).toLocaleLowerCase('es-CL')))) return null;
    const evidence = [item.title, item.company, item.note, item.url, item.sourceDomain].filter(Boolean).join(' ');
    if (unsafeContentReason(evidence, item.url)) return null;
    const published = parseDiscoveryDate(item.sourcePublishedAt || item.date);
    if (!published || staleDiscoveryDate(new Date(published).toISOString())) return null;
  }
  return publicRecord(item);
}

function feedRefreshAt(item:Record<string, unknown>) {
  const now = Date.now();
  const candidates = [Date.parse(String(item.expiresAt || '')) + 1];
  if (item.externalVerifiedAt) candidates.push(Date.parse(String(item.externalVerifiedAt)) + 86400000 + 1);
  if (item.kind === 'job_offer') {
    candidates.push(Date.parse(String(item.createdAt || '')) + 86400000 + 1);
    const published = parseDiscoveryDate(String(item.sourcePublishedAt || item.date || ''));
    if (published) candidates.push(published + DISCOVERY_MAX_AGE_DAYS * 86400000 + 1);
  }
  const upcoming = candidates.filter(time => Number.isFinite(time) && time > now);
  return upcoming.length ? Math.min(...upcoming) : null;
}

function externalOfferRecord(offer:VerifiedOffer):ListingRecord {
  const now = new Date().toISOString();
  return {
    kind:'job_offer', origin:'radar', title:offer.title, company:offer.company,
    workLocation:offer.work_commune, workCommunes:[offer.work_commune],
    recruitmentZones:[], recruitmentCommunes:[], area:'Radar externo', status:'Verificada',
    date:sourceDateLabel(offer.source_published_at), source:publicSourceAdapter(offer.source_url)!.name, sourceDomain:new URL(offer.source_url).hostname,
    sourcePublishedAt:offer.source_published_at, sourceValidThrough:offer.valid_through || null,
    validityMethod:offer.validity_method || 'explicit_deadline',
    expiresAt:offer.valid_through || new Date(Date.parse(offer.source_published_at)+45*86400000).toISOString(), url:offer.source_url,
    note:(offer.valid_through ? 'Postulación comprobada en la fuente: ' : 'Formulario habilitado comprobado; la fuente no informa cierre: ') + offer.application, tags:[], visual:'field', icon:'work',
    review:false, verified:true, active:true, createdAt:now, discoveredBy:'github-signed-laboratory',
    verificationCheckedAt:offer.verified_at, verifiedAt:offer.verified_at, firstVerifiedAt:offer.verified_at,
    lastVerifiedAt:offer.verified_at, verificationVersion:VERIFICATION_VERSION,
    verificationMethod:offer.verification_method, verificationReason:'Fuente individual, ubicación real, fecha original y postulación contrastadas.',
    lastSeenAt:offer.verified_at,
  };
}

function literal(value:unknown, limit=300) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function fold(value:string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function socialSourceDate(value:unknown, endOfDay=false):string | null {
  const raw=literal(value, 150);
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  let year:number, month:number, day:number;
  const iso=raw.match(/^(20\d{2})-(\d{2})-(\d{2})(?:T.*)?$/);
  const numeric=raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](20\d{2})$/);
  const spanish=fold(raw).match(/^(\d{1,2}) (?:de )?([a-z]+) (?:de )?(20\d{2})$/);
  if (iso) { year=Number(iso[1]); month=Number(iso[2]); day=Number(iso[3]); }
  else if (numeric) { year=Number(numeric[3]); month=Number(numeric[2]); day=Number(numeric[1]); }
  else if (spanish) { year=Number(spanish[3]); month=months.indexOf(spanish[2])+1; day=Number(spanish[1]); }
  else return null;
  const midday=new Date(Date.UTC(year,month-1,day,12));
  if (month<1 || month>12 || day<1 || midday.getUTCFullYear()!==year || midday.getUTCMonth()!==month-1 || midday.getUTCDate()!==day) return null;
  if (iso && raw.includes('T')) {
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
    const stamp=Date.parse(raw);
    return Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
  }
  const offsetText=new Intl.DateTimeFormat('en-US',{ timeZone:'America/Santiago',timeZoneName:'longOffset' }).formatToParts(midday).find(part=>part.type==='timeZoneName')?.value ?? '';
  const offset=offsetText.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!offset) return null;
  const minutes=(Number(offset[2])*60+Number(offset[3]))*(offset[1]==='-'?-1:1);
  return new Date(Date.UTC(year,month-1,day,endOfDay?23:0,endOfDay?59:0,endOfDay?59:0,endOfDay?999:0)-minutes*60000).toISOString();
}
