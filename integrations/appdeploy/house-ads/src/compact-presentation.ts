export type PublicCard={company?:string;source?:string;review?:boolean;verified?:boolean;revalidationDue?:boolean;originalPosterUrl?:string;sourceImageUrl?:string};
export function reviewLabel(item:PublicCard) {return item.revalidationDue?'Por revalidar':item.review?'Por confirmar':item.verified?'Verificada':'Publicación directa';}
export function identifiedEmployer(item:PublicCard) {
 const company=item.company?.trim();if(!company)return null;
 const normalized=company.toLocaleLowerCase('es-CL').replace(/[^a-záéíóúñ0-9]/g,'');
 return ['chiletrabajos','chiletrabajo','laborum','indeed','computrabajo','linkedin','opcionempleo','bolsanacionaldeempleo','bne','sinfuentenoidentificada','empresa'].includes(normalized)?null:company;
}
export function originalPoster(item:PublicCard,base:string) {
 const candidate=item.originalPosterUrl||item.sourceImageUrl;if(!candidate)return null;
 try{const u=new URL(candidate,base);if(u.protocol!=='https:'||u.username||u.password)return null;
 const allowed=[new URL(base).hostname,'mtraiguen.cl','www.munimulchen.cl','munilumaco.cl'];
 return allowed.includes(u.hostname)||u.hostname.endsWith('.amazonaws.com')||u.hostname.endsWith('.appdeploy.ai')?u.href:null;
 }catch{return null;}
}
export function shortDate(value?:string) {const time=Date.parse(value||'');return Number.isFinite(time)?new Date(time).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Santiago'}):null;}
