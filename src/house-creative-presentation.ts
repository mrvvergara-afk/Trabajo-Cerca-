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
const lastPresentation={"house-professionals": {"title": "¿Buscas trabajo? Hazte visible.", "message": "Publica gratis lo que sabes hacer y desde cuándo estás disponible.", "mobileMessage": "Publica gratis lo que sabes hacer y tu disponibilidad.", "button": "Ofrecer mi trabajo"}, "house-advertisers": {"title": "Tu negocio puede destacar aquí.", "message": "Promociona tus productos o servicios cerca de tus clientes.", "mobileMessage": "Promociona tu negocio cerca de tus clientes.", "button": "Publicitar mi negocio"}, "house-employers": {"title": "¿Necesitas alguien para trabajar?", "message": "Encuentra personas disponibles o publica lo que necesitas.", "mobileMessage": "Encuentra personas o publica lo que necesitas.", "button": "Necesito contratar"}, "house-explore": {"title": "Oportunidades cerca de ti.", "message": "Descubre empleos, personas y servicios de tu territorio.", "mobileMessage": "Empleos, personas y servicios de tu territorio.", "button": "Explorar oportunidades"}, "house-inclusion": {"title": "Lo que sabes hacer tiene valor.", "message": "Agricultura, construcción, oficios, servicios técnicos y profesiones. Todos tienen espacio aquí.", "mobileMessage": "Oficios, servicios y profesiones. Todos tienen espacio aquí.", "button": "Publicar mis servicios"}, "house-local-business": {"title": "Que conozcan tu negocio local.", "message": "Alojamiento, alimentación, transporte y servicios para trabajadores y empresas.", "mobileMessage": "Alojamiento, alimentación, transporte y servicios locales.", "button": "Promocionar mi negocio"}};
// Previous built-in text is upgraded in the UI without modifying a campaign
// that an administrator has customized. The current saved campaigns are unchanged.
const previousDefaults:Record<string,Pick<Creative,'title'|'message'|'mobileMessage'|'button'>>={
  'house-professionals':{title:'¿Buscas trabajo?',message:'Muestra lo que sabes hacer. Gratis.',mobileMessage:'Muestra lo que sabes hacer. Gratis.',button:'Publicar mi perfil'},
  'house-advertisers':{title:'Haz que conozcan tu negocio.',message:'Promociónate entre clientes de tu zona.',mobileMessage:'Promociónate entre clientes de tu zona.',button:'Conocer promoción'},
  'house-employers':{title:'¿Necesitas contratar?',message:'Publica lo que necesitas y conecta con personas de tu zona.',mobileMessage:'Conecta con personas de tu zona.',button:'Publicar necesidad'},
  'house-explore':{title:'Oportunidades cerca de ti.',message:'Empleos, personas y servicios de tu territorio.',mobileMessage:'Empleos, personas y servicios de tu zona.',button:'Explorar oportunidades'},
  'house-inclusion':{title:'Lo que sabes hacer vale.',message:'Oficios y profesiones: ofrece tus servicios gratis.',mobileMessage:'Ofrece tus servicios gratis.',button:'Ofrecer mis servicios'},
  'house-local-business':{title:'Servicios para empresas.',message:'Alojamiento, alimentación y transporte cerca de quienes trabajan.',mobileMessage:'Alojamiento, alimentación y transporte.',button:'Promocionar mi negocio'},
};
// Upgrade untouched defaults only. Administrator edits and image withdrawals win.
export function presentHouseCreative(campaignId:string,creative:Creative):Creative {
 const defaults=HOUSE_DEFAULTS.find(c=>c.id===campaignId)?.creatives.find(c=>c.id===creative.id);
 const previous=legacy[campaignId];const recent=(lastPresentation as Record<string,typeof previous>)[campaignId];
 const unchanged=previousDefaults[campaignId];
 const untouched=[previous,recent,unchanged].some(old=>old&&(['title','message','mobileMessage','button'] as const).every(key=>creative[key]===old[key]));
 const text=untouched&&defaults?{...creative,title:defaults.title,message:defaults.message,mobileMessage:defaults.mobileMessage,button:defaults.button}:creative;
 const priorDefault=creative.imageUrl==='/house-creatives/'+campaignId.replace('house-','')+'.svg';
 return {...text,...(!creative.imageDisabled&&!creative.storagePath&&(!creative.imageUrl||priorDefault)&&defaults?.imageUrl?{imageUrl:defaults.imageUrl}:{}),...(creative.imageDisabled?{imageUrl:undefined}:{})};
}
