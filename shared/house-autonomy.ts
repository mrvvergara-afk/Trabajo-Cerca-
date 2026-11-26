export const INSTITUTIONAL_SLOTS = [
  'explore', 'professionals', 'inclusion', 'local-business', 'advertisers', 'employers',
] as const;
export type InstitutionalSlot = typeof INSTITUTIONAL_SLOTS[number];
export type Season = 'verano' | 'otono' | 'invierno' | 'primavera';
export const INSTITUTIONAL_APP = {
  lab: 'trabajo-cerca-lab-aislado-xirg9w',
  prod: 'trabajo-cerca-laboratorio-3ojgro',
} as const;
export const SOCIAL_CAMPAIGN = /^tc-organico-\d{4}-\d{2}-\d{2}$/;
export const SOCIAL_BRAND = '7187503';
export const BANK_BRANCH = 'feat/gestor-publicitario-autonomo-20261126';
export const BANK_ORIGIN = 'https://raw.githubusercontent.com/mrvvergara-afk/Trabajo-Cerca-/refs/heads/';
export const BANK_URL = BANK_ORIGIN + BANK_BRANCH + '/marketing/bank/';
export const MAX_IMAGE_BYTES = 200_000;
export const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z][a-z0-9-]{1,39}$/;
const TERRITORIES = ['Malleco', 'Biobío'] as const;
type Territory = typeof TERRITORIES[number];
type Derivative = { sha256: string; bytes: number; width: number; height: number };
export type BankAsset = {
  id: string;
  slot: InstitutionalSlot;
  seasons: (Season | 'todo')[];
  territories: Territory[];
  alt: string;
  rights: 'trabajo-cerca-generated';
  originalSha256: string;
  web: Derivative;
  social: Derivative;
};
export type InstitutionalSlide = {
  slot: InstitutionalSlot;
  imageUrl: string;
  alt: string;
  title: string;
  message: string;
  mobile: string;
};
export type InstitutionalManifest = {
  schema: 1;
  revision: string;
  period: string;
  season: Season;
  territory: Territory;
  slides: InstitutionalSlide[];
};
const seasons: Season[] = ['verano', 'otono', 'invierno', 'primavera'];
const groups: Record<Territory, string> = {
  Malleco: 'las comunas de Malleco', Biobío: 'las comunas del sur del Biobío',
};
const COPY: Record<InstitutionalSlot, [string, string, string]> = {
  explore: ['Encuentra oportunidades cerca', 'Explora empleos, oficios y servicios en', 'Explora oportunidades locales.'],
  professionals: ['Haz visible tu experiencia', 'Comparte tu oficio, profesión o disponibilidad en', 'Muestra lo que sabes hacer.'],
  inclusion: ['Tu oficio hace falta', 'Da a conocer tus servicios y encuentra nuevos contactos en', 'Publica tu oficio o servicio.'],
  'local-business': ['Compra y encarga cerca', 'Descubre negocios y servicios de vecinos en', 'Conoce comercios de tu zona.'],
  advertisers: ['Presenta tu negocio local', 'Muestra tus horarios, servicios y formas de contacto en', 'Muestra tu negocio a tus vecinos.'],
  employers: ['Conecta con personas de la zona', 'Publica los perfiles que busca tu equipo en', 'Publica una necesidad de contratación.'],
};
const OPENERS: Record<Season, string> = {
  verano: 'Esta temporada de verano', otono: 'Este otoño',
  invierno: 'Este invierno', primavera: 'Esta primavera',
};
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
const limitedText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim() === value && value.length > 0 &&
  value.length <= max && !/[\u0000-\u001f<>]/.test(value);
function derivative(value: unknown, width: number, height: number): Derivative {
  const raw = asRecord(value);
  if (typeof raw.sha256 !== 'string' || !HASH.test(raw.sha256) ||
    typeof raw.bytes !== 'number' || !Number.isInteger(raw.bytes) ||
    raw.bytes < 1000 || raw.bytes > MAX_IMAGE_BYTES ||
    raw.width !== width || raw.height !== height) throw Error('derivada_invalida');
  return { sha256: raw.sha256, bytes: raw.bytes, width, height };
}
export function validateBank(value: unknown): BankAsset[] {
  const raw = asRecord(value);
  if (raw.schema !== 1 || !Array.isArray(raw.assets) || raw.assets.length < 6 || raw.assets.length > 48)
    throw Error('banco_invalido');
  const ids = new Set<string>();
  const assets = raw.assets.map(value => {
    const a = asRecord(value);
    if (typeof a.id !== 'string' || !ID.test(a.id) || ids.has(a.id) ||
      !INSTITUTIONAL_SLOTS.includes(a.slot as InstitutionalSlot) ||
      !Array.isArray(a.seasons) || !a.seasons.length || a.seasons.length > 4 ||
      !a.seasons.every(s => s === 'todo' || seasons.includes(s)) ||
      !Array.isArray(a.territories) || !a.territories.length || a.territories.length > 2 ||
      !a.territories.every(t => TERRITORIES.includes(t)) ||
      !limitedText(a.alt, 120) || a.rights !== 'trabajo-cerca-generated' ||
      typeof a.originalSha256 !== 'string' || !HASH.test(a.originalSha256))
      throw Error('proveniencia_invalida');
    ids.add(a.id);
    return {
      id: a.id, slot: a.slot as InstitutionalSlot, seasons: a.seasons as BankAsset['seasons'],
      territories: a.territories as Territory[], alt: a.alt, rights: a.rights,
      originalSha256: a.originalSha256, web: derivative(a.web, 840, 560),
      social: derivative(a.social, 840, 840),
    } satisfies BankAsset;
  });
  if (!INSTITUTIONAL_SLOTS.every(slot => assets.some(a => a.slot === slot)))
    throw Error('banco_incompleto');
  return assets;
}
export function editorialPeriod(date: Date) {
  const dateText = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(date);
  const localDay = new Date(dateText + 'T00:00:00Z');
  const daysSinceMonday = (localDay.getUTCDay() + 6) % 7;
  const monday = new Date(localDay.getTime() - daysSinceMonday * 86_400_000);
  const week = Math.floor((monday.getTime() - Date.UTC(1970, 0, 5)) / 604_800_000);
  const month = localDay.getUTCMonth();
  const season = seasons[Math.floor(((month + 1) % 12) / 3)];
  return { period: monday.toISOString().slice(0, 10), week, season, territory: TERRITORIES[week % 2] };
}
export function editorialPlan(bank: BankAsset[], date: Date) {
  const period = editorialPeriod(date);
  const copyTurn = Math.floor(period.week / 2) % 2;
  const slides = INSTITUTIONAL_SLOTS.map((slot, index) => {
    const ranked = bank.filter(a => a.slot === slot).sort((a,b) => a.id.localeCompare(b.id));
    const timely = ranked.filter(a => a.territories.includes(period.territory) &&
      (a.seasons.includes(period.season) || a.seasons.includes('todo')));
    const local = ranked.filter(a => a.territories.includes(period.territory));
    const choices = timely.length ? timely : local.length ? local : ranked;
    const asset = choices[(Math.floor(period.week / 2) + index) % choices.length];
    const [title, action, mobile] = COPY[slot];
    const where = groups[period.territory];
    const message = copyTurn ? OPENERS[period.season] + ', ' + action.toLocaleLowerCase('es-CL') + ' ' + where + '.' : action + ' ' + where + '.';
    return { slot, asset, title, message, mobile };
  });
  const campaign = slides[period.week % slides.length];
  return { ...period, slides, campaign };
}
export function safeInstitutionalImage(url: unknown): url is string {
  return typeof url === 'string' && /^\/api\/growth\/institutional\/media\/[a-f0-9]{64}$/.test(url);
}
export function validatePublicManifest(value: unknown): InstitutionalManifest | null {
  const m = asRecord(value);
  if (m.schema !== 1 || typeof m.revision !== 'string' || !HASH.test(m.revision) ||
    typeof m.period !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.period) ||
    !seasons.includes(m.season as Season) || !TERRITORIES.includes(m.territory as Territory) ||
    !Array.isArray(m.slides) || m.slides.length !== INSTITUTIONAL_SLOTS.length) return null;
  const seen = new Set();
  for (const slide of m.slides) {
    const s = asRecord(slide);
    if (!INSTITUTIONAL_SLOTS.includes(s.slot as InstitutionalSlot) || seen.has(s.slot) ||
      !safeInstitutionalImage(s.imageUrl) || !limitedText(s.alt, 120) ||
      !limitedText(s.title, 90) || !limitedText(s.message, 230) || !limitedText(s.mobile, 90))
      return null;
    seen.add(s.slot);
  }
  return m as InstitutionalManifest;
}
