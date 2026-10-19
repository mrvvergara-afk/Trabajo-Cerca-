import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ctx=vm.createContext({URL});
vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/public-source-adapters.ts',import.meta.url),'utf8'),{mode:'strip'}).replace(/^export /gm,''),ctx);
const standard='https://www.chiletrabajos.cl/trabajo/tens-lumaco-3902931';
const portal='https://portal.chiletrabajos.cl/empresa/layner/trabajo/tens-lumaco-3902931';

test('three observed URL shapes share a feed identity while old ingestion identities stay unchanged',()=>{
  for (const url of [standard,portal,'https://www.chiletrabajos.cl/trabajo/3902931']) {
    assert.equal(ctx.publicFeedIdentity(url),'https://www.chiletrabajos.cl/trabajo/3902931');
  }
  assert.equal(ctx.publicOfferIdentity(standard),standard);
  assert.equal(ctx.publicOfferIdentity(portal),null);
  assert.notEqual(ctx.publicFeedIdentity(standard),ctx.publicFeedIdentity(standard.replace('3902931','3902932')));
});
test('portal city and search pages are not individual offers even when old records say verified',()=>{
  for (const url of ['https://www.chiletrabajos.cl/ciudad/talca.html','https://www.chiletrabajos.cl/encuentra-un-empleo/?2=Pur%C3%A9n']) {
    assert.equal(ctx.publicJobExclusion({kind:'job_offer',verified:true,title:'Oferta',url}),'portal_index_not_individual_offer');
  }
});
test('a brand or the Nueva Victoria mine cannot establish work in Victoria commune',()=>{
  for (const title of ['Subjefe Victoria´s Secret - La Serena','Especialista Pala Hidráulica - Faena SQM Nueva Victoria']) {
    assert.equal(ctx.publicJobExclusion({kind:'job_offer',title,url:standard,workCommunes:['Victoria']}),'brand_or_remote_site_is_not_victoria_commune');
  }
  assert.equal(ctx.publicJobExclusion({kind:'job_offer',title:'Vendedor Victoria´s Secret - comuna de Victoria',url:standard,workCommunes:['Victoria']}),null);
});
test('distinct reviewed municipal roles and community posts are preserved',()=>{
  const url='https://mtraiguen.cl/municipalidad/bases-para-llamado-a-concurso-publico-de-3-cargos/';
  for (const [i,title] of ['QUÍMICO FARMACÉUTICO (A)','Ingeniero(a) en Prevención de Riesgos','Nutricionista'].entries()) {
    assert.equal(ctx.publicJobExclusion({kind:'job_offer',title,url,workCommunes:['Traiguén']}),null);
    assert.equal(ctx.publicFeedIdentity(url,String(i).repeat(64)),ctx.publicOfferIdentity(url,String(i).repeat(64)));
  }
  assert.equal(ctx.publicJobExclusion({kind:'worker_need',title:'Cosecheros'}),null);
});

test('an explicit comuna de Ercilla cannot be displayed as a workplace in Angol',()=>{
  const item={kind:'job_offer',title:'Psicólogo/a Clínico - Comuna de Ercilla',url:standard,workCommunes:['Angol']};
  assert.equal(ctx.publicJobExclusion(item),'workplace_conflicts_with_explicit_job_title');
  assert.equal(ctx.publicJobExclusion({...item,workCommunes:['Ercilla']}),null);
});
