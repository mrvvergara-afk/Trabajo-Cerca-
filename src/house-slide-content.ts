import type {Goal} from '../shared/house-ads';
export const ARTWORK=['explore','professionals','inclusion','local-business','advertisers','employers'] as const;
export type Art=typeof ARTWORK[number];
export const STORIES:Record<Art,{eyebrow:string;title:string;message:string;mobile:string;cta:string;goal:Goal}>={
 explore:{eyebrow:'TRABAJO CERCA · 12 COMUNAS',title:'Lo que buscas puede estar cerca.',message:'Empleos, oficios y negocios locales de nuestras 12 comunas.',mobile:'Encuentra oportunidades de tu territorio.',cta:'Explorar mi territorio',goal:'explore'},
 professionals:{eyebrow:'PERSONAS Y EXPERIENCIA',title:'Haz visible tu experiencia.',message:'Ofrece tus habilidades y disponibilidad con contacto directo.',mobile:'Muestra tus habilidades.',cta:'Publicar mi perfil',goal:'professional'},
 inclusion:{eyebrow:'OFICIOS Y SERVICIOS',title:'Muestra lo que sabes hacer.',message:'Reparaciones, soldadura, gastronomía y otros oficios de tu comuna.',mobile:'Que conozcan tus oficios y servicios locales.',cta:'Publicar mi servicio',goal:'professional'},
 'local-business':{eyebrow:'NEGOCIOS LOCALES',title:'Que elijan tu negocio local.',message:'Da a conocer tu comercio, productos y atención a tus vecinos.',mobile:'Tu negocio merece ser visto en la comuna.',cta:'Promocionar mi negocio',goal:'advertiser'},
 advertisers:{eyebrow:'PUBLICIDAD PARA EMPRENDEDORES',title:'Tu anuncio puede contar más.',message:'Muestra productos, horarios, servicios y contacto en publicidad local.',mobile:'Presenta horarios, productos y contacto.',cta:'Anunciar mi negocio',goal:'advertiser'},
 employers:{eyebrow:'PERSONAS Y EMPLEADORES',title:'¿Necesitas contratar?',message:'Publica lo que necesitas y conecta con personas de la zona.',mobile:'Encuentra personas disponibles cerca de ti.',cta:'Publicar necesidad',goal:'employer'}
};
export function houseSequence(id:string):Art[]{
 const raw=id.replace(/^house-/,'');
 const first=ARTWORK.includes(raw as Art)?raw as Art:'explore';
 return [first,...ARTWORK.filter(a=>a!==first)];
}