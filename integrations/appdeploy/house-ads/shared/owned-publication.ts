import {COMMERCIAL_PLACES} from './commercial-policy';
export function ownedPublicationPatch(record:{kind:string;origin:string;ownerToken?:string;title:string;note:string;workLocation:string;contact?:string},input:Record<string,unknown>,now=Date.now()) {
  if(!record.ownerToken||typeof input.ownerToken!=='string'||input.ownerToken!==record.ownerToken)throw Error('owner_denied');
  if(record.origin!=='direct'||!['worker_available','worker_need','service_request'].includes(record.kind))throw Error('not_direct');
  if(input.consent!==true)throw Error('consent_required');
  const title=typeof input.title==='string'?input.title.trim():record.title;
  const note=typeof input.detail==='string'?input.detail.trim():record.note;
  const workLocation=typeof input.workLocation==='string'?input.workLocation:record.workLocation;
  const contact=typeof input.contact==='string'&&input.contact.trim()?input.contact.trim():record.contact;
  if(!title||title.length>140||note.length>1200||!contact||contact.length>100||!COMMERCIAL_PLACES.includes(workLocation))throw Error('invalid_fields');
  return {title,note,workLocation,contact,contactPublicationConsent:true,contactConsentAt:new Date(now).toISOString(),...(input.renew===true?{active:true,status:'Activa',expiresAt:new Date(now+(record.kind==='worker_available'?21:30)*86400000).toISOString()}:{}),editedAt:new Date(now).toISOString()};
}
