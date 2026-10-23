import {HOUSE_DEFAULTS,type Creative} from '../shared/house-ads';
const legacy:Record<string,Pick<Creative,'title'|'message'|'mobileMessage'|'button'>>={
  "house-professionals": {
    "title": "¿Tienes un oficio o profesión?",
    "message": "¿Tienes un oficio o profesión? Ofrece tus servicios gratis en Trabajo Cerca.",
    "mobileMessage": "Ofrece tu oficio o profesión gratis.",
    "button": "Publicar mis servicios"
  },
  "house-advertisers": {
    "title": "Tu negocio, más cerca de tus clientes.",
    "message": "Promociona tu negocio en Trabajo Cerca y aprovecha nuestra publicidad gratuita de lanzamiento.",
    "mobileMessage": "Conoce nuestra promoción de lanzamiento.",
    "button": "Publicitar mi negocio"
  },
  "house-employers": {
    "title": "¿Necesitas alguien para trabajar?",
    "message": "¿Necesitas contratar trabajadores o servicios? Publica tu oportunidad en Trabajo Cerca.",
    "mobileMessage": "¿Necesitas contratar? Publica aquí.",
    "button": "Publicar una necesidad"
  },
  "house-explore": {
    "title": "Trabajo Cerca nace para nuestras comunas.",
    "message": "Trabajo, servicios y negocios cerca de ti. Descubre Trabajo Cerca.",
    "mobileMessage": "Trabajo y servicios cerca de ti.",
    "button": "Conocer Trabajo Cerca"
  },
  "house-inclusion": {
    "title": "Aquí hay espacio para todos.",
    "message": "Desde el trabajo agrícola hasta los servicios técnicos y profesionales. Si sabes hacer algo, puedes ofrecerlo.",
    "mobileMessage": "Todos los oficios tienen espacio aquí.",
    "button": "Ofrecer mis servicios"
  },
  "house-local-business": {
    "title": "¿Ofreces alojamiento, alimentación o servicios para empresas?",
    "message": "Da a conocer tus servicios a personas, trabajadores y empresas de nuestro territorio.",
    "mobileMessage": "Alojamiento, alimentación y servicios locales.",
    "button": "Promocionar mi negocio"
  }
};
// Upgrade untouched defaults only. Administrator edits and image withdrawals win.
export function presentHouseCreative(campaignId:string,creative:Creative):Creative {
 const defaults=HOUSE_DEFAULTS.find(c=>c.id===campaignId)?.creatives.find(c=>c.id===creative.id);
 const previous=legacy[campaignId];
 const untouched=previous&&(['title','message','mobileMessage','button'] as const).every(key=>creative[key]===previous[key]);
 const text=untouched&&defaults?{...creative,title:defaults.title,message:defaults.message,mobileMessage:defaults.mobileMessage,button:defaults.button}:creative;
 return {...text,...(!creative.imageDisabled&&!creative.storagePath&&!creative.imageUrl&&defaults?.imageUrl?{imageUrl:defaults.imageUrl}:{}),...(creative.imageDisabled?{imageUrl:undefined}:{})};
}
