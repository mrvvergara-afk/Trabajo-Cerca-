import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ctx=vm.createContext({URL,VERIFICATION_VERSION:'test',staleDiscoveryDate:()=>false});
const adapters=readFileSync(new URL('../integrations/appdeploy/public-source-adapters.ts',import.meta.url),'utf8');
const prefix="async function verifyPendingOffer(item:ListingRecord & { id:string }) {\n  const checkedAt = new Date().toISOString();\n  const { id, ...record } = item;\n  const pending = (reason:string, method='Revisión automática') => ({ id, record:{ ...record, review:true, verified:false, status:'Por confirmar', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:method, verificationVersion:VERIFICATION_VERSION } });\n  const inconclusive = (reason:string, method='Revalidación técnica') => {\n    const canKeep = record.verified === true && record.review === false && Boolean(record.verifiedAt) && Boolean(record.sourcePublishedAt) && !staleDiscoveryDate(record.sourcePublishedAt || '');\n    if (canKeep) return { id, record:{ ...record, active:true, review:false, verified:true, status:'Verificada', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:method, verificationVersion:VERIFICATION_VERSION } };\n    return pending(reason, method);\n  };\n  const reject = (reason:string) => ({ id, record:{ ...record, review:false, verified:false, active:false, status:'Descartada', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:'Revisión automática', verificationVersion:VERIFICATION_VERSION } });\n  const verify = (reason:string, method:string, publishedAt:string) => ({ id, record:{ ...record, area:/por confirmar|señal/i.test(record.area) ? 'Oferta laboral verificada' : record.area, date:sourceDateLabel(publishedAt), sourcePublishedAt:publishedAt, review:false, verified:true, active:true, status:'Verificada', verificationCheckedAt:checkedAt, verificationReason:reason, verificationMethod:method, verificationVersion:VERIFICATION_VERSION, verifiedAt:record.verifiedAt || record.firstVerifiedAt || checkedAt, firstVerifiedAt:record.firstVerifiedAt || record.verifiedAt || checkedAt, lastVerifiedAt:checkedAt } });\n\n  const qualityReason=publicJobExclusion(record as unknown as Record<string,unknown>);\n  if (qualityReason) return pending('Procedencia o ubicación por revisar: '+qualityReason,'Validación de fuente individual');\n  return null;\n}";
vm.runInContext(stripTypeScriptTypes(adapters.replace(/^export /gm,'')+'\n'+prefix,{mode:'strip'}),ctx);
test('the legacy verification entry point stops a search URL before any provider and preserves original source fields',async()=>{
  const original={id:'record',kind:'job_offer',title:'Trabajos CMPC',url:'https://www.chiletrabajos.cl/encuentra-un-empleo?8=CMPC',verified:true,review:false,sourcePublishedAt:'2026-10-01T00:00:00Z',createdAt:'2026-10-01T01:00:00Z'};
  const before=JSON.stringify(original),result=await ctx.verifyPendingOffer(original);
  assert.equal(result.record.verified,false);assert.equal(result.record.review,true);
  assert.match(result.record.verificationReason,/portal_index_not_individual_offer/);
  assert.equal(result.record.sourcePublishedAt,original.sourcePublishedAt);
  assert.equal(result.record.createdAt,original.createdAt);
  assert.equal(JSON.stringify(original),before);
});
