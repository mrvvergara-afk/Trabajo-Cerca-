import type { CommercialAd, Slot } from './house-ads';
export const COMMERCIAL_PLACES = ['Angol','Collipulli','Ercilla','Renaico','Mininco','Los Sauces','Purén','Traiguén','Lumaco','Nacimiento','Negrete','Mulchén','Victoria'];
export type CommercialConfig = {
  revision:string; launchAt:string|null; founderClosesAt:string|null; founderWindowDays:number;
  founderSlots:number; founderDays:number; foundersUsed:number; standardDays:number;
  enabled:boolean; standardEnabled:boolean; message:string; conditions:string;
  plans:{id:string;priceCLP:number;days:number;approved:false;vat:'pending'|'included'|'excluded'}[];
};
export const COMMERCIAL_DEFAULTS:CommercialConfig = {
  revision:'commercial-defaults-v1',launchAt:null,founderClosesAt:null,founderWindowDays:30,
  founderSlots:20,founderDays:30,foundersUsed:0,standardDays:14,enabled:true,standardEnabled:true,
  message:'Conoce nuestra promoción gratuita de lanzamiento.',
  conditions:'Una promoción por negocio elegible, sujeta a revisión. Sin cobros ni renovación automática.',
  plans:[['emprendedor',2990],['local',5990],['destacado',9990],['empresa',19990]].map(([id,price])=>({id:String(id),priceCLP:Number(price),days:30,approved:false,vat:'pending'})),
};
export function promotionOffer(c:CommercialConfig,now=Date.now()) {
  const remaining=Math.max(0,c.founderSlots-c.foundersUsed);
  if(!c.enabled)return {kind:'paused',days:0,remaining,message:'La promoción está pausada.',conditions:c.conditions};
  if(!c.launchAt||now<Date.parse(c.launchAt))return {kind:'not_launched',days:0,remaining,message:'La fecha de lanzamiento aún no está habilitada. Puedes registrar tu interés.',conditions:c.conditions};
  const end=c.founderClosesAt?Date.parse(c.founderClosesAt):Date.parse(c.launchAt)+c.founderWindowDays*86400000;
  if(now<end&&remaining>0)return {kind:'founder',days:c.founderDays,remaining,message:c.message,conditions:c.conditions};
  if(c.standardEnabled)return {kind:'standard',days:c.standardDays,remaining:0,message:c.message,conditions:c.conditions};
  return {kind:'closed',days:0,remaining:0,message:'La promoción está cerrada. Puedes registrar tu interés.',conditions:c.conditions};
}
export function validateCommercialConfig(raw:unknown,current:CommercialConfig):CommercialConfig {
  const x=raw as CommercialConfig;
  if(!x||typeof x!=='object')throw Error('Configuración inválida.');
  for(const k of ['founderSlots','founderDays','standardDays','founderWindowDays'] as const)
    if(!Number.isInteger(x[k])||x[k]<1||x[k]>(k==='founderSlots'?10000:365))throw Error('Cupos o duración inválidos.');
  if(x.founderSlots<current.foundersUsed)throw Error('No se pueden quitar cupos ya otorgados.');
  for(const k of ['launchAt','founderClosesAt'] as const)if(x[k]!==null&&(typeof x[k]!=='string'||!Number.isFinite(Date.parse(x[k]))))throw Error('Fecha inválida.');
  if(x.founderClosesAt&&(!x.launchAt||Date.parse(x.founderClosesAt)<=Date.parse(x.launchAt)))throw Error('Cierre anterior al lanzamiento.');
  if(current.foundersUsed&&x.launchAt!==current.launchAt)throw Error('No se puede reiniciar un lanzamiento con beneficios otorgados.');
  if(typeof x.enabled!=='boolean'||typeof x.standardEnabled!=='boolean'||typeof x.message!=='string'||!x.message.trim()||x.message.length>300||typeof x.conditions!=='string'||!x.conditions.trim()||x.conditions.length>1000)throw Error('Mensajes o estado inválidos.');
  if(!Array.isArray(x.plans)||x.plans.length>12||new Set(x.plans.map(p=>p.id)).size!==x.plans.length)throw Error('Planes inválidos.');
  const plans=x.plans.map(p=>{if(!/^[a-z0-9-]{1,40}$/.test(p.id)||!Number.isSafeInteger(p.priceCLP)||p.priceCLP<0||p.priceCLP>10000000||!Number.isInteger(p.days)||p.days<1||p.days>365||!['pending','included','excluded'].includes(p.vat))throw Error('Tarifa o IVA inválido.');return {id:p.id,priceCLP:p.priceCLP,days:p.days,approved:false as const,vat:p.vat};});
  return {...current,launchAt:x.launchAt,founderClosesAt:x.founderClosesAt,founderSlots:x.founderSlots,founderDays:x.founderDays,standardDays:x.standardDays,founderWindowDays:x.founderWindowDays,enabled:x.enabled,standardEnabled:x.standardEnabled,message:x.message.trim(),conditions:x.conditions.trim(),plans};
}
export function businessIdentity(name:string) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CL').replace(/[^a-z0-9]/g,'');
}
export function selectCommercial(ads:CommercialAd[],place:string,turn:number,now=Date.now()) {
  const selected:CommercialAd[]=[];const used=new Set<string>();
  for(const slot of ['search','listing'] as Slot[]) {
    const eligible=ads.filter(a=>a.status==='active'&&Date.parse(a.startAt)<=now&&now<Date.parse(a.endAt)&&a.communes?.some(c=>c==='Todas'||c===place)&&(a.placements??['search','listing']).includes(slot));
    const reserved=eligible.filter(a=>a.adType!=='COMMERCIAL_FREE').sort((a,b)=>(b.adType==='COMMERCIAL_PAID'?1:0)-(a.adType==='COMMERCIAL_PAID'?1:0)||(b.communes.includes(place)&&place!=='Todas'?1:0)-(a.communes.includes(place)&&place!=='Todas'?1:0)||b.priority-a.priority||a.id.localeCompare(b.id));
    let chosen=reserved[0];
    if(!chosen){
      const pool=eligible.filter(a=>!used.has(businessIdentity(a.businessName))).sort((a,b)=>(b.communes.includes(place)&&place!=='Todas'?1:0)-(a.communes.includes(place)&&place!=='Todas'?1:0)||b.priority-a.priority||a.id.localeCompare(b.id));
      if(pool.length){const first=pool[0];const tier=pool.filter(a=>a.priority===first.priority&&a.communes.includes(place)===first.communes.includes(place));chosen=tier[((turn%tier.length)+tier.length)%tier.length];}
    }
    if(chosen){selected.push({...chosen,placements:[slot]});used.add(businessIdentity(chosen.businessName));}
  }
  // One record may reserve both placements. Preserve both rather than duplicate IDs.
  const byId=new Map<string,CommercialAd>();
  for(const ad of selected){const old=byId.get(ad.id);byId.set(ad.id,old?{...old,placements:[...old.placements!,...ad.placements!]}:ad);}
  return [...byId.values()];
}
