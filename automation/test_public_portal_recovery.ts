import assert from 'node:assert/strict';
import {
  publicPublisher, publicSourceAdapter, publicOfferIdentity,
  publicJobExclusion, samePublicJob,
} from '../appdeploy_staging/public-source-adapters';

const examples = [
  ['Trabajando.com','https://www.trabajando.cl/trabajo/6151008-visual-angol','portal','trabajando'],
  ['Indeed','https://cl.indeed.com/viewjob?jk=abcdef0123456789','portal','indeed'],
  ['Laborum','https://www.laborum.cl/empleos/operador-angol-1118456156.html','portal','laborum'],
  ['Chiletrabajos','https://www.chiletrabajos.cl/trabajo/supervisor-mulchen-3900906','portal','chiletrabajos'],
  ['Computrabajo','https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-bodega-angol-abc','portal','computrabajo'],
  ['Bolsa Nacional de Empleo','https://www.bne.gob.cl/oferta/2026-109726','portal','bne'],
  ['Opción Empleo','https://www.opcionempleo.cl/jobad/abcdef0123456789','aggregator','opcionempleo'],
  ['Jobrapido','https://cl.jobrapido.com/jobpreview/5683390256255074304','aggregator','jobrapido'],
] as const;

for (const [label,url,family,group] of examples) {
  const publisher=publicPublisher(url),adapter=publicSourceAdapter(url);
  assert.ok(publisher,url+' not recognized');
  assert.equal(publisher.group,group,url);
  assert.ok(adapter,url+' not accepted');
  assert.equal(adapter.name,label,url);
  assert.equal(adapter.family,family,url);
  assert.equal(publicOfferIdentity(url)!==null,family!=='aggregator',url);
}

const indexExamples=[
  ['https://www.trabajando.cl/trabajo-angol','trabajando'],
  ['https://www.trabajando.cl/trabajo-collipulli','trabajando'],
  ['https://cl.jobrapido.com/Ofertas-de-trabajo-en-Collipulli','jobrapido'],
  ['https://cl.indeed.com/jobs?q=&l=Angol','indeed'],
  ['https://www.laborum.cl/empleos-busqueda-angol.html','laborum'],
  ['https://www.chiletrabajos.cl/encuentra-un-empleo/?2=Angol','chiletrabajos'],
  ['https://cl.computrabajo.com/empleos-en-araucania-en-angol','computrabajo'],
  ['https://www.opcionempleo.cl/empleo-en-angol.html','opcionempleo'],
  ['https://www.bne.gob.cl/ofertas','bne'],
] as const;
for(const [url,group] of indexExamples){
  assert.equal(publicPublisher(url)?.group,group,url);
  assert.equal(publicSourceAdapter(url),null,'search index should never become a job');
}
assert.equal(samePublicJob(
  'https://www.trabajando.cl/trabajo/6151008-visual-angol',
  'https://trabajando.cl/trabajo/6151008-cargo-actualizado'
),true,'re-slugged job should not be re-published');
assert.equal(samePublicJob(
  'https://www.trabajando.cl/trabajo/6151008-visual-angol',
  'https://www.trabajando.cl/trabajo/6151009-visual-angol'
),false,'distinct requisitions are not duplicate');
assert.equal(publicJobExclusion({
  kind:'job_offer',url:'https://cl.jobrapido.com/jobpreview/5683390256255074304',title:'Asistente Angol'
}), 'aggregator_requires_primary_source');
assert.equal(publicJobExclusion({
  kind:'job_offer',url:'https://www.trabajando.cl/trabajo-angol',title:'Angol'
}), 'portal_index_not_individual_offer');
console.log('PORTAL_RECOVERY_CONTRACT_PASS',examples.length,'offer formats,',indexExamples.length,'indexes');
