// Successful evidence dates only: an attempted check is not a confirmation.
export type OfferEvidence = {kind?:string;origin?:string;verified?:boolean;review?:boolean;lastVerifiedAt?:string;externalVerifiedAt?:string;verifiedAt?:string;verificationMethod?:string;verificationReason?:string;evidence?:string;evidenceSources?:string[];revalidationDue?:boolean;sourcePublishedAt?:string;company?:string;url?:string;sourceDomain?:string;apply?:string;verificationCheckedAt?:string};
export function lastConfirmedAt(item:OfferEvidence,now=Date.now()):string|null {
 const dates=[item.lastVerifiedAt,item.externalVerifiedAt,item.verifiedAt].filter((s):s is string=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&Date.parse(s)<=now);
 return dates.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??null;
}
export function hasVerificationEvidence(item:OfferEvidence,now=Date.now()) {
 return !!lastConfirmedAt(item,now)&&[item.verificationMethod,item.verificationReason,item.evidence,...(Array.isArray(item.evidenceSources)?item.evidenceSources:[])].some(value=>typeof value==='string'&&!!value.trim());
}
export function publicReviewLabel(item:OfferEvidence,now=Date.now()) {
 if(item.kind&&item.kind!=='job_offer')return 'Publicación directa';
 if(item.review)return 'Vigencia por confirmar';
 if(item.verified&&hasVerificationEvidence(item,now))return 'Verificada';
 return item.origin==='direct'||item.origin==='community'?'Publicación directa':'Vigencia por confirmar';
}
// Internal queue priority only; never approves, changes dates, or publishes a record.
export function recheckPriority(item:OfferEvidence,now=Date.now(),frequent=false) {
 const last=lastConfirmedAt(item,now);const age=last?Math.max(0,(now-Date.parse(last))/86400000):90;
 const original=Date.parse(item.sourcePublishedAt||'');
 const old=Number.isFinite(original)?Math.min(45,Math.max(0,(now-original)/86400000)):45;
 const insufficient=[!item.company?.trim(),!item.url?.trim(),!item.sourcePublishedAt,!hasVerificationEvidence(item,now)].filter(Boolean).length;
 return insufficient*30+Math.min(age,90)*2+old+(frequent?25:0)+(item.review?20:0);
}
export function recheckCauses(item:OfferEvidence,now=Date.now()) {
 const values=[item.lastVerifiedAt,item.externalVerifiedAt,item.verifiedAt].filter(Boolean);
 const reasons:string[]=[];
 if(!lastConfirmedAt(item,now))reasons.push(values.length?'fecha_comprobacion_invalida_o_futura':'sin_fecha_comprobacion_exitosa');
 else if(now-Date.parse(lastConfirmedAt(item,now)!)>86400000)reasons.push('programacion_mayor_24_horas');
 const legacy=Date.parse(String(item.lastVerifiedAt||item.externalVerifiedAt||item.verifiedAt||''));
 if(item.revalidationDue&&lastConfirmedAt(item,now)&&now-Date.parse(lastConfirmedAt(item,now)!)<=86400000&&Number.isFinite(legacy)&&now-legacy>86400000)reasons.push('fecha_priorizada_por_cola_anterior_a_otra_comprobacion');
 if(!hasVerificationEvidence(item,now))reasons.push('sin_evidencia_verificacion_publica');
 if(item.review||!item.verified)reasons.push('primera_confirmacion_o_revision_pendiente');
 return reasons;
}
