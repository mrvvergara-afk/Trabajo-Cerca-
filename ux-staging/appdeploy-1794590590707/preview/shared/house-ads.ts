export type Goal = 'professional' | 'advertiser' | 'employer' | 'explore';
export type Slot = 'search' | 'listing' | 'featured' | 'form';
export type Creative = { id: string; title: string; message: string; mobileMessage: string; button: string; storagePath?: string; imageUrl?: string; imageDisabled?:boolean };
export type HouseCampaign = {
  id: string; type: 'HOUSE_AD'; goal: Goal; status: 'active' | 'paused';
  communes: string[]; categories: string[]; pages: string[]; placements: Slot[];
  startAt: string | null; endAt: string | null; priority: number;
  maxPerSession: number; creatives: Creative[];
};
export type CommercialAd = {
  id: string; businessName: string; headline: string; detail: string; url?: string;
  communes: string[]; category: string; status: string; startAt: string; endAt: string;
  priority: number; placements?: Slot[]; pages?: string[]; format?: 'featured' | 'compact'; ctaLabel?: string; scope?: string;
  image?:import('./ad-images').AdMedia|null; logo?:import('./ad-images').AdMedia|null; imageUrl?:string; logoUrl?:string; mediaRevision?:string;
  // Existing campaigns without a type are protected legacy inventory, never HOUSE_AD.
  adType?: 'COMMERCIAL_FREE' | 'COMMERCIAL_PAID';
};
export type Selection = { type: 'HOUSE_AD'; campaign: HouseCampaign; creative: Creative } | { type: 'COMMERCIAL'; campaign: CommercialAd } | null;
const variant = (id: string, title: string, message: string, mobileMessage: string, button: string): Creative => ({ id, title, message, mobileMessage, button });
export const HOUSE_DEFAULTS: HouseCampaign[] = [
  { id: 'house-professionals', type: 'HOUSE_AD', goal: 'professional', status: 'active', communes: [], categories: [], pages: ['home','people','needs','services'], placements: ['search','listing'], startAt: null, endAt: null, priority: 40, maxPerSession: 3, creatives: [variant('a',"¿Buscas trabajo? Hazte visible.","Publica tu oficio o experiencia en tu comuna. Sin currículum, con contacto directo.","Tu experiencia merece oportunidades cerca. Publica tu perfil sin CV.","Publicar mi perfil gratis")] },
  { id: 'house-advertisers', type: 'HOUSE_AD', goal: 'advertiser', status: 'active', communes: [], categories: [], pages: ['home','people','needs','services'], placements: ['search','listing'], startAt: null, endAt: null, priority: 30, maxPerSession: 3, creatives: [variant('a',"Tu negocio merece ser visto.","Acércate a quienes compran en tu comuna. Conoce los espacios y la promoción de lanzamiento.","Que tu comuna conozca lo que vendes. Descubre la promoción.","Ver promoción local")] },
  { id: 'house-employers', type: 'HOUSE_AD', goal: 'employer', status: 'active', communes: [], categories: [], pages: ['home','people','needs','services'], placements: ['search','listing'], startAt: null, endAt: null, priority: 20, maxPerSession: 3, creatives: [variant('a',"¿Te falta alguien para la pega?","Publica tu necesidad de personal y conecta con personas disponibles de tu zona.","Publica lo que necesitas y llega a personas cerca.","Publicar necesidad gratis")] },
  { id: 'house-explore', type: 'HOUSE_AD', goal: 'explore', status: 'active', communes: [], categories: [], pages: ['home','people','needs','services'], placements: ['search','listing'], startAt: null, endAt: null, priority: 10, maxPerSession: 8, creatives: [variant('a',"Lo que buscas puede estar cerca.","Empleos, oficios y negocios de nuestras 12 comunas, reunidos en un solo lugar.","Explora oportunidades de tu comuna. Sin vueltas.","Explorar mi territorio")] },
  { id:'house-inclusion',type:'HOUSE_AD',goal:'professional',status:'active',communes:[],categories:[],pages:['home','people','needs','services'],placements:['search','listing'],startAt:null,endAt:null,priority:15,maxPerSession:3,creatives:[variant('a',"¡Que tu comuna vea lo que haces!","¿Haces rejas, tortas o reparaciones? Muestra tus trabajos con fotos y deja que te contacten.","Soldadura, tortas, reparaciones… ¡muestra tus trabajos con fotos!","Mostrar mis trabajos gratis")] },
  { id:'house-local-business',type:'HOUSE_AD',goal:'advertiser',status:'active',communes:[],categories:[],pages:['home','people','needs','services'],placements:['search','listing'],startAt:null,endAt:null,priority:5,maxPerSession:3,creatives:[variant('a',"Que elijan tu negocio local.","Si ofreces alojamiento, alimentación o transporte, hazte visible para clientes de tu zona.","Alojamiento, transporte, comida: da a conocer tu negocio.","Promocionar mi negocio")] },

].map(c=>({...c,creatives:c.creatives.map(v=>({...v,imageUrl:'https://raw.githubusercontent.com/mrvvergara-afk/Trabajo-Cerca-/c445112b9cdb78adfce9d8065e32411c4f412c4b/integrations/appdeploy/house-ads/public/resources/house-'+({'house-professionals':'professionals','house-advertisers':'advertisers','house-employers':'employers','house-explore':'explore','house-inclusion':'inclusion','house-local-business':'local-business'} as Record<string,string>)[c.id]+'-photo-v2-640.webp'}))})) as HouseCampaign[];
const activeAt = (start: string | null, end: string | null, now: number) =>
  (start === null || (Number.isFinite(Date.parse(start)) && Date.parse(start) <= now)) &&
  (end === null || (Number.isFinite(Date.parse(end)) && now < Date.parse(end)));
const inPlace = (communes: string[], place: string) => !communes.length || communes.includes('Todas') || place === 'Todas' || communes.includes(place) || (place === 'Collipulli' && communes.includes('Mininco')) || (place === 'Mininco' && communes.includes('Collipulli'));
const commercialInPlace = (communes: string[],place:string) => communes.includes('Todas') || (place !== 'Todas' && inPlace(communes,place));

// One allocation for the whole screen, not independent random decisions per banner.
export function allocateAdvertising(input: {
  house: HouseCampaign[]; commercial: CommercialAd[]; complete: boolean; place: string;
  category?: string; page?: string; now: number; turn: number; seen: Record<string,number>;
  completed: Goal[]; slots: Slot[];
}): Record<Slot, Selection> {
  const result: Record<Slot, Selection> = { search: null, listing: null, featured: null, form: null };
  // Cuando la conexión está pendiente o falla, se muestra autopromoción propia; nunca una reserva comercial inventada.
  const used = new Set<string>();
  for (const slot of input.slots.slice(0,4)) {
    const paid = (input.complete ? input.commercial : []).filter(ad => ad.status === 'active' && activeAt(ad.startAt, ad.endAt, input.now) && commercialInPlace(ad.communes, input.place) && (ad.pages ?? ['home']).includes(input.page ?? 'home') && (ad.placements ?? ['search','listing']).includes(slot))
      .sort((a,b) => (b.adType === 'COMMERCIAL_PAID' ? 1 : 0) - (a.adType === 'COMMERCIAL_PAID' ? 1 : 0) || (b.communes.includes(input.place) && input.place !== 'Todas' ? 1 : 0) - (a.communes.includes(input.place) && input.place !== 'Todas' ? 1 : 0) || b.priority-a.priority || a.id.localeCompare(b.id));
    // Explicit/legacy commitments win even over frequency and cross-slot deduplication.
    if (paid.length) { result[slot] = { type: 'COMMERCIAL', campaign: paid[0] }; continue; }
    const pool = input.house.filter(ad => ad.status === 'active' && activeAt(ad.startAt, ad.endAt, input.now) && inPlace(ad.communes,input.place) && ad.pages.includes(input.page ?? 'home') && ad.placements.includes(slot) && (!ad.categories.length || ad.categories.includes(input.category ?? '')) && !input.completed.includes(ad.goal) && !used.has(ad.id) && (input.seen[ad.id] ?? 0) < ad.maxPerSession)
      .sort((a,b) => b.priority-a.priority || a.id.localeCompare(b.id));
    if (!pool.length) {
      // Publicidad institucional obligatoria: no queda un espacio vacío por vigencia,
      // baja, pausas, frecuencia agotada, filtros o pérdida temporal de conexión.
      const fallback = HOUSE_DEFAULTS.find(c => c.id === 'house-explore') ?? HOUSE_DEFAULTS[0];
      if (fallback?.creatives[0]) {
        result[slot] = { type:'HOUSE_AD', campaign:fallback, creative:fallback.creatives[0] };
      }
      continue;
    }
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
    if(v.imageDisabled!==undefined&&typeof v.imageDisabled!=='boolean')throw Error('Estado de imagen inválido.');
    if (v.storagePath && !/^house-creatives\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(v.storagePath)) throw Error('Archivo de creatividad inválido.');
  }
  // Whitelist fields: no editable destination URLs, scripts, revenue or HTML.
  return { id:c.id,type:'HOUSE_AD',goal:c.goal,status:c.status,communes:c.communes,categories:c.categories,pages:c.pages,placements:c.placements,startAt:c.startAt,endAt:c.endAt,priority:c.priority,maxPerSession:c.maxPerSession,creatives:c.creatives.map(v=>({id:v.id,title:v.title.trim(),message:v.message.trim(),mobileMessage:v.mobileMessage.trim(),button:v.button.trim(),...(v.storagePath?{storagePath:v.storagePath}:{}),...(v.imageDisabled?{imageDisabled:true}:{})})) };
}
