import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as core from '../qa-output/radar/core.mjs';
const urls=[
 'https://www.chiletrabajos.cl/trabajo/docente-psicologo-3915967',
 'https://www.chiletrabajos.cl/trabajo/tens-para-cuidados-pacientes-domiciliarios-lumaco-3892923',
 'https://www.chiletrabajos.cl/trabajo/tens-para-cuidados-pacientes-domiciliarios-lumaco-3902931',
 'https://www.chiletrabajos.cl/trabajo/verificador-a-de-domicilios-en-terreno-renaico-3893607',
 'https://www.chiletrabajos.cl/trabajo/psicologo-a-clinico-comuna-de-ercilla-3902679'
];
const records=[];
for(const url of urls) {
 const page=await core.fetchPublicPage(url,url);
 const offer=page.error?{status:'pending',reason:page.error}:core.evaluateWithEvidence(url,page.raw,page.url,page.status);
 const nodes=[];
 const visit=(v,depth=0)=>{if(!v||typeof v!=='object'||depth>12)return;if([].concat(v['@type']||[]).includes('JobPosting'))nodes.push(v);for(const x of Object.values(v))if(typeof x==='object')visit(x,depth+1);};
 for(const script of page.raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(script[1]));}catch{}}
 const job=nodes.find(j=>[j.url,typeof j.mainEntityOfPage==='object'?j.mainEntityOfPage?.['@id']:j.mainEntityOfPage].some(ref=>typeof ref==='string'&&core.publicFeedIdentity(ref)===core.publicFeedIdentity(url)))||(nodes.length===1?nodes[0]:undefined);
 const description=String(job?.description||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 const application=offer.application?await core.fetchPublicPage(offer.application):null;
 const record={url,observedAt:new Date().toISOString(),http:page.status,sourceSha256:createHash('sha256').update(page.raw).digest('hex'),
  offer,structuredWorksite:job?.jobLocation,description,descriptionSha256:createHash('sha256').update(description).digest('hex'),
  application:application?{url:application.url,http:application.status,error:application.error||null,requiresLogin:/iniciar sesi[oó]n|inicia sesi[oó]n|login|ingresar a tu cuenta/i.test(application.raw)}:null};
 records.push(record);console.log('RADAR_TARGET_PROOF '+JSON.stringify(record));
}
writeFileSync('qa-output/radar/target-proof.json',JSON.stringify(records,null,2));
