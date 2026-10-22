export type Goal = 'professional' | 'advertiser' | 'employer' | 'explore';
export type Slot = 'search' | 'listing';
export type Creative = { id: string; title: string; message: string; mobileMessage: string; button: string; storagePath?: string; imageUrl?: string };
export type HouseCampaign = {
  id: string; type: 'HOUSE_AD'; goal: Goal; status: 'active' | 'paused';
  communes: string[]; categories: string[]; pages: string[]; placements: Slot[];
  startAt: string | null; endAt: string | null; priority: number;
  maxPerSession: number; creatives: Creative[];
};
export type CommercialAd = {
  id: string; businessName: string; headline: string; detail: string; url?: string;
  communes: string[]; category: string; status: string; startAt: string; endAt: string;
  priority: number; placements?: Slot[]; scope?: string;
  // Existing campaigns without a type are protected legacy inventory, never HOUSE_AD.
  adType?: 'COMMERCIAL_FREE' | 'COMMERCIAL_PAID';
};
export type Selection = { type: 'HOUSE_AD'; campaign: HouseCampaign; creative: Creative } | { type: 'COMMERCIAL'; campaign: CommercialAd } | null;
const variant = (id: string, title: string, message: string, mobileMessage: string, button: string): Creative => ({ id, title, message, mobileMessage, button });
export const HOUSE_DEFAULTS: HouseCampaign[] = [
  { id: 'house-professionals', type: 'HOUSE_AD', goal: 'professional', status: 'active', communes: [], categories: [], pages: ['home','people','needs','services'], placements: ['search','listing'], startAt: null, endAt: null, priority: 40, maxPerSession: 3, creatives: [variant('a','¿Tienes un oficio o profesión?','¿Tienes un oficio o profesión? Ofrece tus servicios gratis en Trabajo Cerca.','Ofrece tu oficio o profesión gratis.','Publicar mis servicios')] },
  { id: 'house-advertisers', type: 'HOUSE_AD', goal: 'advertiser', status: 'active', communes: [], categories: [], pages: ['home','people','needs','services'], placements: ['search','listing'], startAt: null, endAt: null, priority: 30, maxPerSession: 3, creatives: [variant('a','Tu negocio, más cerca de tus clientes.','Promociona tu negocio en Trabajo Cerca y aprovecha nuestra publicidad gratuita de lanzamiento.','Conoce nuestra promoción de lanzamiento.','Publicitar mi negocio')] },
  { id: 'house-employers', type: 'HOUSE_AD', goal: 'employer', status: 'active', communes: [], categories: [], pages: ['home','people','needs','services'], placements: ['search','listing'], startAt: null, endAt: null, priority: 20, maxPerSession: 3, creatives: [variant('a','¿Necesitas alguien para trabajar?','¿Necesitas contratar trabajadores o servicios? Publica tu oportunidad en Trabajo Cerca.','¿Necesitas contratar? Publica aquí.','Publicar una necesidad')] },
  { id: 'house-explore', type: 'HOUSE_AD', goal: 'explore', status: 'active', communes: [], categories: [], pages: ['home','people','needs','services'], placements: ['search','listing'], startAt: null, endAt: null, priority: 10, maxPerSession: 8, creatives: [variant('a','Trabajo Cerca nace para nuestras comunas.','Trabajo, servicios y negocios cerca de ti. Descubre Trabajo Cerca.','Trabajo y servicios cerca de ti.','Conocer Trabajo Cerca')] },
  { id:'house-inclusion',type:'HOUSE_AD',goal:'professional',status:'active',communes:[],categories:[],pages:['home','people','needs','services'],placements:['search','listing'],startAt:null,endAt:null,priority:15,maxPerSession:3,creatives:[variant('a','Aquí hay espacio para todos.','Desde el trabajo agrícola hasta los servicios técnicos y profesionales. Si sabes hacer algo, puedes ofrecerlo.','Todos los oficios tienen espacio aquí.','Ofrecer mis servicios')] },
  { id:'house-local-business',type:'HOUSE_AD',goal:'advertiser',status:'active',communes:[],categories:[],pages:['home','people','needs','services'],placements:['search','listing'],startAt:null,endAt:null,priority:5,maxPerSession:3,creatives:[variant('a','¿Ofreces alojamiento, alimentación o servicios para empresas?','Da a conocer tus servicios a personas, trabajadores y empresas de nuestro territorio.','Alojamiento, alimentación y servicios locales.','Promocionar mi negocio')] },

];
const activeAt = (start: string | null, end: string | null, now: number) =>
  (start === null || (Number.isFinite(Date.parse(start)) && Date.parse(start) <= now)) &&
  (end === null || (Number.isFinite(Date.parse(end)) && now < Date.parse(end)));
const inPlace = (communes: string[], place: string) => !communes.length || communes.includes('Todas') || (place !== 'Todas' && communes.includes(place));

// One allocation for the whole screen, not independent random decisions per banner.
export function allocateAdvertising(input: {
  house: HouseCampaign[]; commercial: CommercialAd[]; complete: boolean; place: string;
  category?: string; page?: string; now: number; turn: number; seen: Record<string,number>;
  completed: Goal[]; slots: Slot[];
}): Record<Slot, Selection> {
  const result: Record<Slot, Selection> = { search: null, listing: null };
  if (!input.complete) return result; // Unknown reservations are not free inventory.
  const used = new Set<string>();
  for (const slot of input.slots.slice(0,2)) {
    const paid = input.commercial.filter(ad => ad.status === 'active' && activeAt(ad.startAt, ad.endAt, input.now) && inPlace(ad.communes, input.place) && (ad.placements ?? ['search','listing']).includes(slot))
      .sort((a,b) => (b.adType === 'COMMERCIAL_PAID' ? 1 : 0) - (a.adType === 'COMMERCIAL_PAID' ? 1 : 0) || (b.communes.includes(input.place) && input.place !== 'Todas' ? 1 : 0) - (a.communes.includes(input.place) && input.place !== 'Todas' ? 1 : 0) || b.priority-a.priority || a.id.localeCompare(b.id));
    // Explicit/legacy commitments win even over frequency and cross-slot deduplication.
    if (paid.length) { result[slot] = { type: 'COMMERCIAL', campaign: paid[0] }; continue; }
    const pool = input.house.filter(ad => ad.status === 'active' && activeAt(ad.startAt, ad.endAt, input.now) && inPlace(ad.communes,input.place) && ad.pages.includes(input.page ?? 'home') && ad.placements.includes(slot) && (!ad.categories.length || ad.categories.includes(input.category ?? '')) && !input.completed.includes(ad.goal) && !used.has(ad.id) && (input.seen[ad.id] ?? 0) < ad.maxPerSession)
      .sort((a,b) => b.priority-a.priority || a.id.localeCompare(b.id));
    if (!pool.length) continue;
    // Priority sets starting order; a moving turn prevents permanent starvation.
    const selected = pool[((input.turn % pool.length) + pool.length) % pool.length];
    const creative = selected.creatives[Math.abs(input.turn) % selected.creatives.length];
    if (!creative) continue;
    result[slot] = { type: 'HOUSE_AD', campaign: selected, creative };
    used.add(selected.id);
  }
  return result;
}

export function validateHouseCampaign(value: unknown): HouseCampaign {
  if (!value || typeof value !== 'object') throw Error('Campaña inválida.');
  const c = value as HouseCampaign;
  const validId = (s: unknown) => typeof s === 'string' && /^[a-z0-9-]{1,60}$/.test(s);
  const strings = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every(s => typeof s === 'string' && s.length <= 100);
  if (!validId(c.id) || c.type !== 'HOUSE_AD' || !['professional','advertiser','employer','explore'].includes(c.goal) || !['active','paused'].includes(c.status)) throw Error('Identidad o estado inválido.');
  if (!strings(c.communes,30) || !strings(c.categories,30) || !strings(c.pages,5) || !c.pages.length || c.pages.some(p => !['home','people','needs','services'].includes(p)) || !Array.isArray(c.placements) || !c.placements.length || c.placements.some(p => !['search','listing'].includes(p))) throw Error('Segmentación inválida.');
  if (!Number.isInteger(c.priority) || c.priority < 0 || c.priority > 100 || !Number.isInteger(c.maxPerSession) || c.maxPerSession < 1 || c.maxPerSession > 20) throw Error('Prioridad o frecuencia inválida.');
  for (const date of [c.startAt,c.endAt]) if (date !== null && (typeof date !== 'string' || !Number.isFinite(Date.parse(date)))) throw Error('Fecha inválida.');
  if (c.startAt && c.endAt && Date.parse(c.startAt) >= Date.parse(c.endAt)) throw Error('El cierre debe ser posterior al inicio.');
  if (!Array.isArray(c.creatives) || !c.creatives.length || c.creatives.length > 4 || new Set(c.creatives.map(v => v.id)).size !== c.creatives.length) throw Error('Usa entre una y cuatro creatividades distintas.');
  for (const v of c.creatives) {
    if (!validId(v.id)) throw Error('Variante inválida.');
    for (const [field,max] of [['title',100],['message',300],['mobileMessage',150],['button',60]] as const) if (typeof v[field] !== 'string' || !v[field].trim() || v[field].length > max) throw Error('Texto de creatividad inválido.');
    if (v.storagePath && !/^house-creatives\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(v.storagePath)) throw Error('Archivo de creatividad inválido.');
  }
  // Whitelist fields: no editable destination URLs, scripts, revenue or HTML.
  return { id:c.id,type:'HOUSE_AD',goal:c.goal,status:c.status,communes:c.communes,categories:c.categories,pages:c.pages,placements:c.placements,startAt:c.startAt,endAt:c.endAt,priority:c.priority,maxPerSession:c.maxPerSession,creatives:c.creatives.map(v=>({id:v.id,title:v.title.trim(),message:v.message.trim(),mobileMessage:v.mobileMessage.trim(),button:v.button.trim(),...(v.storagePath?{storagePath:v.storagePath}:{})})) };
}
