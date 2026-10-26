import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
const ctx={URL,Date,Intl,Buffer,createHash};vm.createContext(ctx);
for(const name of ['social-evidence.ts','public-source-adapters.ts','public-source-verifier.ts'])vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8'),{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);
const url='https://www.bne.gob.cl/oferta/2026-109726',now=Date.parse('2026-10-13T12:00:00Z');
function bne({posted='15/09/2026',close='17/11/2026',location='Bío Bío, Negrete',button=true}={}){
 return '<title>Bolsa Nacional de Empleo</title><h1><span id="nombreOferta"><span>Cajeros/as peaje Negrete (20 vacantes)</span><small>Cajeros (as)</small></h1>'+ 
 '<article><h3>DATOS DE CONTACTO</h3><strong><span>Empresa:</span></strong><br><span>Empresa de prueba SPA</span>'+ 
 '<h3>DESCRIPCIÓN</h3><p>Oferta laboral para atención a clientes</p><div>'+location+'</div>'+ 
 '<i class="fa fa-calendar"></i><span>'+posted+'</span> - <i class="fa fa-calendar"></i><span>'+close+'</span>'+ 
 '<p>Origen de la Oferta: WEB</p>'+(button?'<a class="btn btn-primary" href="/registro?redireccion=ofertas">Postular</a>':'')+'</article>';
}
test('The official labelled BNE page verifies a dated individual offer without inventing a JobPosting in the source',()=>{
 const r=ctx.evaluatePublicJob(url,bne(),url,200,now);assert.equal(r.status,'verified');assert.equal(r.company,'Empresa de prueba SPA');assert.equal(r.work_commune,'Negrete');
 assert.equal(r.source_published_at,'2026-09-15T03:00:00.000Z');assert.equal(r.valid_through,'2026-11-18T02:59:59.999Z');assert.match(r.verification_method,/official labelled offer$/);
});
test('BNE aliases preserve identity but search pages and different offers never do',()=>{
 assert.equal(ctx.samePublicJob(url,'https://www.bne.cl/oferta/2026-109726?utm_source=test'),true);assert.equal(ctx.publicSourceAdapter('https://www.bne.gob.cl/ofertas'),null);
 assert.equal(ctx.evaluatePublicJob(url,bne(),url.replace('109726','109727'),200,now).status,'pending');
});
test('Original age, future dates, expiration, location and application are enforced for BNE',()=>{
 for(const options of [{posted:'01/08/2026'},{posted:'14/10/2026'},{close:'12/10/2026'},{location:'Metropolitana, Santiago'},{location:'Araucanía, Negrete'},{button:false}])assert.notEqual(ctx.evaluatePublicJob(url,bne(options),url,200,now).status,'verified');
});
test('A related canonical URL or a second offer heading prevents BNE verification',()=>{
 const canonical='<link rel="canonical" href="'+url.replace('109726','109727')+'">';assert.notEqual(ctx.evaluatePublicJob(url,canonical+bne(),url,200,now).status,'verified');
 assert.notEqual(ctx.evaluatePublicJob(url,bne()+'<h1>Otra oferta</h1>',url,200,now).status,'verified');
});
test('Arauco job IDs stay stable across slug and locale variants but directories remain discovery pages',()=>{
 const first='https://jobs.arauco.com/Chile/job/Lider-Forestal/1391343500/';assert.equal(ctx.samePublicJob(first,'https://jobs.arauco.com/job/Nuevo-Titulo/1391343500/?locale=es_ES'),true);
 assert.equal(ctx.publicSourceAdapter('https://jobs.arauco.com/Chile/search/'),null);
});
