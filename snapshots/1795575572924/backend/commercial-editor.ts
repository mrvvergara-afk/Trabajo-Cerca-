import { db, storage, json, error, isAppDatabaseError, type RouterContext } from '@appdeploy/sdk';
import { randomUUID } from 'node:crypto';
import { COMMERCIAL_PLACES } from '../shared/commercial-policy';
import type { CommercialAd } from '../shared/house-ads';
import { invalidateCommercialInventory } from './house-marketing';

type Details = {
  id?:string; businessName?:string; headline?:string; detail?:string; category?:string;
  url?:string; ctaLabel?:string; communes?:string[]; placements?:string[];
  pages?:string[]; format?:string; priority?:number;
  imageStoragePath?:string|null; publicWhatsAppApproved?:boolean;
  slides?:Array<{id:string;kind:string;title:string;body:string;storagePath?:string|null}>;
};

export async function updateCommercialCampaignDetails(ctx:RouterContext) {
  const input=ctx.body as Details;
  if(!input||typeof input.id!=='string'||!input.id||input.id.length>150)
    return error('Identificador de campaña inválido.',400);

  const [current]=await db.get<CommercialAd & {updatedAt?:string}>('growth_campaigns',[input.id],{consistent:true});
  if(!current)return error('No se encontró la campaña.',404);

  if(!Array.isArray(input.communes)||!input.communes.length||
    new Set(input.communes).size!==input.communes.length||
    input.communes.some(p=>p!=='Todas'&&!COMMERCIAL_PLACES.includes(p))||
    (input.communes.includes('Todas')&&input.communes.length>1))
    return error('Selecciona las comunas autorizadas o Toda la zona.',400);
  if(!Array.isArray(input.placements)||!input.placements.length||
    new Set(input.placements).size!==input.placements.length||
    input.placements.some(p=>!['search','listing','featured','form'].includes(p)))
    return error('Selecciona uno o más espacios existentes.',400);
  if(!Array.isArray(input.pages)||!input.pages.length||
    new Set(input.pages).size!==input.pages.length||
    input.pages.some(p=>!['home','people','needs','services','forms'].includes(p)))
    return error('Selecciona al menos una sección válida.',400);
  if(input.pages.includes('forms')&&!input.placements.includes('form'))
    return error('Para publicar en formularios, selecciona el espacio editorial dentro del formulario.',400);
  if(input.placements.includes('form')&&!input.pages.includes('forms'))
    return error('Para reservar el espacio editorial, selecciona la sección Formularios.',400);
  if(input.format!=='featured'&&input.format!=='compact')
    return error('Formato de anuncio inválido.',400);
  if(typeof input.priority!=='number'||!Number.isInteger(input.priority)||input.priority<0||input.priority>100)
    return error('Prioridad fuera de rango.',400);

  const filled=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
  if(!filled(input.businessName,120)||!filled(input.headline,120)||!filled(input.detail,300)||
    !filled(input.category,90)||!filled(input.ctaLabel,38))
    return error('Completa los textos del anuncio respetando los límites.',400);

  const link=String(input.url||'').trim();
  if(link){
    try{
      const parsed=new URL(link);
      if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hostname==='localhost'||!parsed.hostname.includes('.'))throw Error();
    }catch{return error('El enlace debe usar HTTPS válido.',400);}
    if(link.startsWith('https://wa.me/')&&link!==current.url){
      if(input.publicWhatsAppApproved!==true||!/^https:\/\/wa\.me\/569\d{8}$/.test(link))
        return error('Confirma autorización comercial del nuevo número WhatsApp.',400);
    }
  }

  let imagePatch:Record<string,unknown>={};
  if(input.imageStoragePath===null)imagePatch={image:undefined};
  else if(input.imageStoragePath!==undefined){
    if(!/^house-creatives\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(input.imageStoragePath))
      return error('Imagen inválida o fuera del almacén permitido.',400);
    const [stored]=await storage.read([input.imageStoragePath]);
    if(!stored?.content)return error('No se encontró la imagen seleccionada.',400);
    imagePatch={image:{storagePath:input.imageStoragePath,approved:true,reviewedAt:new Date().toISOString()}};
  }

  let slidePatch:Record<string,unknown>={};
  if(input.slides!==undefined){
    if(!Array.isArray(input.slides)||input.slides.length>4)return error('Máximo cuatro láminas adicionales.',400);
    const ids=new Set<string>();const slides=[];
    for(const s of input.slides){
      if(!s||typeof s.id!=='string'||!/^[a-zA-Z0-9_-]{3,80}$/.test(s.id)||
         ids.has(s.id)||!['image','hours','products','contact'].includes(s.kind)||
         !filled(s.title,75)||!filled(s.body,200))
         return error('Completa título, descripción y tipo de cada lámina.',400);
      ids.add(s.id);
      let media:Record<string,unknown>|undefined;
      if(s.storagePath){
        if(typeof s.storagePath!=='string'||!/^house-creatives\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(s.storagePath))
          return error('La imagen adicional no es válida.',400);
        const [item]=await storage.read([s.storagePath]);
        if(!item?.content)return error('No se encontró una imagen adicional.',400);
        media={storagePath:s.storagePath,approved:true,reviewedAt:new Date().toISOString()};
      }
      slides.push({id:s.id,kind:s.kind,title:s.title.trim(),body:s.body.trim(),...(media?{image:media}:{})});
    }
    slidePatch={slides};
  }
  const now=new Date().toISOString();
  const patch={
    businessName:input.businessName!.trim(),
    headline:input.headline!.trim(),
    detail:input.detail!.trim(),
    category:input.category!.trim(),
    url:link||undefined,
    ctaLabel:input.ctaLabel!.trim(),
    communes:input.communes,
    placements:input.placements,
    pages:input.pages,
    format:input.format,
    priority:input.priority,
    updatedAt:now,
    ...imagePatch,
    ...slidePatch,
  };

  try{
    await db.transact([
      db.tx.update('growth_campaigns',[{
        id:input.id,record:patch,if:{status:current.status,updatedAt:current.updatedAt},
      }],{patch:true}),
      db.tx.add('growth_commercial_audit',[{
        id:randomUUID(),action:'campaign_editor_saved',campaignId:input.id,
        actor:ctx.user?.userId,communes:input.communes,pages:input.pages,
        placements:input.placements,at:now,
      }]),
    ]);
  }catch(cause){
    if(isAppDatabaseError(cause)&&['AppDatabaseConditionFailed','AppDatabaseConflict','AppDatabaseUnknownOutcome'].includes(cause.code))
      return error('Cambios no confirmados o campaña modificada en otra sesión. Recarga antes de reintentar.',409);
    throw cause;
  }
  invalidateCommercialInventory();
  const [confirmed]=await db.get<CommercialAd & {updatedAt?:string}>('growth_campaigns',[input.id],{consistent:true});
  if(!confirmed||confirmed.updatedAt!==now){
    return error('El guardado no quedó confirmado. Vuelve a consultar el estado antes de reintentar.',409);
  }
  const response=json({
    id:input.id,
    saved:true,
    updatedAt:now,
    campaign:{
      id:input.id,communes:confirmed.communes,pages:confirmed.pages,
      placements:confirmed.placements,headline:confirmed.headline,
      format:confirmed.format,status:confirmed.status,slidesCount:(confirmed.slides||[]).length,
    },
    notice:'Campaña guardada y comprobada en la base de datos. No cambió la vigencia ni se habilitaron cobros.',
  });
  response.headers={...response.headers,'Cache-Control':'no-store, private',Vary:'Authorization'};
  return response;
}
