import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const original = new URL('../../../snapshots/1795575572924/backend/',import.meta.url);
const dependencies = new Set(['./social-evidence','./public-source-adapters','./worksite-semantics']);
const hook=registerHooks({resolve(specifier,context,next){
 if(!specifier.startsWith('.')||!context.parentURL?.endsWith('.ts'))return next(specifier,context);
 const path=specifier.endsWith('.ts')?specifier:specifier+'.ts';
 if(context.parentURL.endsWith('/staging/appdeploy/backend/public-source-verifier.ts')&&dependencies.has(specifier))
  return next(new URL(path,original).href,context);
 return next(path,context);
}});
const {evaluatePublicJob}=await import('./public-source-verifier.ts');
test.after(()=>hook.deregister());

const url='https://www.muninegrete.cl/concurso-publico-directora-de-control-municipal/';
const now=Date.parse('2026-11-26T20:00:00Z');
const fixture=`<meta property="article:published_time" content="2026-11-25T10:22:19+00:00">
<article><header><h1>Concurso público – Director(a) de Control Municipal</h1></header>
<p>La Ilustre Municipalidad de Negrete informa la apertura del Concurso Público para proveer el cargo de Director(a) de Control.</p>
<p>Las bases aprobadas mediante Decreto Alcaldicio N° 601.</p>
<p>Plazo de postulación: Desde el 25 de noviembre hasta el 9 de diciembre de 2026, a las 14:00 horas.</p>
<a href="/wp-content/uploads/2026/11/Decreto-601.pdf">Bases</a></article>`;

test('verifies a first-party municipal competition using its original date and exact Chilean closing time',()=>{
 const result=evaluatePublicJob(url,fixture,url,200,now);
 assert.equal(result.status,'verified');
 assert.equal(result.work_commune,'Negrete');
 assert.equal(result.source_published_at,'2026-11-25T10:22:19.000Z');
 assert.equal(result.valid_through,'2026-12-09T17:00:00.000Z');
 assert.equal(result.application,url);
 assert.equal(evaluatePublicJob(url,fixture,url,200,Date.parse(result.valid_through)).status,'rejected');
});

test('spoofed sources, unrelated decrees and unannounced windows stay out of automatic publication',()=>{
 assert.notEqual(evaluatePublicJob(url,fixture.replace('/Decreto-601.pdf','/Decreto-602.pdf'),url,200,now).status,'verified');
 assert.notEqual(evaluatePublicJob(url,fixture.replace('Ilustre Municipalidad de Negrete','Una empresa externa'),url,200,now).status,'verified');
 const redirect=url.replace('muninegrete.cl','munipuren.cl');
 assert.notEqual(evaluatePublicJob(url,fixture,redirect,200,now).status,'verified');
 const future=fixture.replace('25 de noviembre','1 de diciembre');
 assert.equal(evaluatePublicJob(url,future,url,200,now).reason,'municipal_competition_not_yet_open');
});
