import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ctx = { URL,Intl,Date,Buffer,createHash };
vm.createContext(ctx);
for (const name of ['social-evidence.ts','public-source-adapters.ts','public-source-verifier.ts']) {
  const source = readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8');
  vm.runInContext(stripTypeScriptTypes(source,{ mode:'strip' }).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);
}
const now = Date.parse('2026-10-13T12:00:00Z');
const url = 'https://cl.indeed.com/viewjob?jk=0123456789abcdef';
function page({ job={}, form=false, disabled=false, anchor=true, tail='' }={}) {
  const data = { '@type':'JobPosting',url,title:'Operador forestal',hiringOrganization:{ name:'Empresa de prueba' },
    jobLocation:{ address:{ addressLocality:'Angol',addressCountry:'CL' } },datePosted:'2026-10-12T12:00:00Z',validThrough:'2026-10-20T12:00:00Z',...job };
  return '<title>Operador forestal | Fuente</title><main>Requisitos y jornada de empleo</main>'+
    '<script type="application/ld+json">'+JSON.stringify(data)+'</script>'+
    (anchor?'<a href="/postular/0123456789abcdef">Postula aquí</a>':'')+
    (form?'<form method="post" action="/postular/0123456789abcdef"><input type="file" name="cv"><button type="submit" '+(disabled?'disabled':'')+'>Postular</button></form>':'')+tail;
}

test('Chiletrabajos civil source dates keep their literal values and normalize in continental Chile',()=>{
  const chile='https://www.chiletrabajos.cl/trabajo/tens-enfermera-administrativa-angol-3911374';
  const raw=page({ job:{ url:chile,datePosted:'2026-10-08 11:58:01',validThrough:'2026-12-22T11:58:01' } });
  const result=ctx.evaluatePublicJob(chile,raw,chile,200,now);
  assert.equal(result.status,'verified');assert.equal(result.source_published_at,'2026-10-08T14:58:01.000Z');
  assert.equal(result.valid_through,'2026-12-22T14:58:01.000Z');
  assert.equal(result.source_date_evidence.date_posted,'2026-10-08 11:58:01');
  assert.equal(result.source_date_evidence.timezone,'America/Santiago');
});

test('Civil portal dates still reject invalid calendars, clock times, future values and unconfigured sources',()=>{
  const chile='https://www.chiletrabajos.cl/trabajo/operador-1234567';
  for (const datePosted of ['2026-02-30 11:58:01','2026-10-08 25:00:00','2026-10-14 11:58:01']) {
    assert.equal(ctx.evaluatePublicJob(chile,page({ job:{ url:chile,datePosted } }),chile,200,now).status,'pending');
  }
  assert.equal(ctx.evaluatePublicJob(url,page({ job:{ datePosted:'2026-10-08 11:58:01' } }),url,200,now).status,'pending');
});

test('Individual portal identities preserve job IDs and reject directories and credential URLs', () => {
  for (const value of [url,'https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-operador-AB12',
    'https://cl.linkedin.com/jobs/view/operador-at-empresa-4456391320/',
    'https://www.laborum.cl/empleos/operador-123456789.html','https://www.opcionempleo.cl/jobad/cl0123456789abcdef']) assert.ok(ctx.publicSourceAdapter(value),value);
  for (const value of ['https://cl.indeed.com/jobs?q=Angol','https://cl.computrabajo.com/trabajo-en-angol',
    'https://www.linkedin.com/jobs/search/','https://www.laborum.cl/empleos-busqueda-angol.html',
    'https://www.munilumaco.cl/','https://municipalidadcollipulli.cl/concursos-publicos/',
    'https://user:password@cl.indeed.com/viewjob?jk=0123456789abcdef',url+'&token=secret',url.replace('cl.indeed.com','cl.indeed.com.attacker.test')]) assert.equal(ctx.publicSourceAdapter(value),null,value);
});

test('Aliases, tracking and query changes retain the same individual job identity', () => {
  assert.ok(ctx.samePublicJob(url,url+'&utm_source=mail'));
  assert.ok(ctx.samePublicJob('https://cl.linkedin.com/jobs/view/operador-4456391320/','https://www.linkedin.com/jobs/view/4456391320/?trk=x'));
  assert.ok(ctx.samePublicJob('https://www.laborum.cl/empleos/operador-123456789.html','https://www.laborum.cl/empleos/operador-forestal-123456789.html'));
  assert.equal(ctx.samePublicJob(url,url.replace('0123456789abcdef','abcdef0123456789')),false);
});

test('Matching structured portal evidence verifies the real worksite and source date', () => {
  const result = ctx.evaluatePublicJob(url,page(),url,200,now);
  assert.equal(result.status,'verified');assert.equal(result.source,'Indeed');
  assert.equal(result.work_commune,'Angol');assert.equal(result.validity_method,'explicit_deadline');
});

test('An enabled source application form permits verification without inventing a deadline', () => {
  const result = ctx.evaluatePublicJob(url,page({ job:{ validThrough:undefined },form:true }),url,200,now);
  assert.equal(result.status,'verified');assert.equal(result.valid_through,'');
  assert.equal(result.validity_method,'live_application');
  assert.equal(result.validity_evidence.form_url,url);
  assert.match(result.validity_evidence.source_sha256,/^[a-f0-9]{64}$/);
});

test('A contact or disabled form alone never establishes an open application process', () => {
  for (const options of [{ form:false },{ form:true,disabled:true }]) {
    const result = ctx.evaluatePublicJob(url,page({ job:{ validThrough:undefined },...options }),url,200,now);
    assert.equal(result.status,'review_ready');
  }
  const invalid = page({ job:{ validThrough:'hoy' },form:true });
  assert.equal(ctx.evaluatePublicJob(url,invalid,url,200,now).reason,'invalid_source_deadline');
});

test('Search geography, employer addresses and foreign or mixed worksites cannot verify the worksite', () => {
  for (const jobLocation of [{ address:{ addressLocality:'Santiago',addressCountry:'CL' } },
    { address:{ addressLocality:'Angol',addressCountry:'AR' } },
    [{ address:{ addressLocality:'Angol' } },{ address:{ addressLocality:'Santiago' } }]]) {
    const result = ctx.evaluatePublicJob(url,page({ job:{ jobLocation },tail:'<footer>Angol</footer>' }),url,200,now);
    assert.equal(result.status,'pending');assert.equal(result.reason,'worksite_missing_or_multiple');
  }
  const local = ctx.evaluatePublicJob(url,page({ job:{ jobLocation:{ address:{ addressLocality:'Mininco, Collipulli',addressCountry:'CL' } } } }),url,200,now);
  assert.equal(local.work_commune,'Mininco');
});

test('Original dates enforce 45 days, reject relative values and block known closed notices', () => {
  for (const datePosted of ['hoy','12 oct',new Date(now+1).toISOString(),new Date(now-45*86400000-1).toISOString()]) {
    assert.equal(ctx.evaluatePublicJob(url,page({ job:{ datePosted } }),url,200,now).status,'pending');
  }
  assert.equal(ctx.evaluatePublicJob(url,page({ job:{ datePosted:new Date(now-45*86400000).toISOString() } }),url,200,now).status,'verified');
  assert.equal(ctx.evaluatePublicJob(url,page({ tail:'<p>Postulaciones cerradas</p>' }),url,200,now).status,'rejected');
  assert.equal(ctx.evaluatePublicJob(url,page({ job:{ validThrough:'2026-10-01T00:00:00Z' } }),url,200,now).status,'rejected');
});

test('Related jobs, other individual redirects, blocked sources and oversized bodies stay unverified', () => {
  assert.equal(ctx.evaluatePublicJob(url,page({ job:{ url:url.replace('0123456789abcdef','abcdef0123456789') } }),url,200,now).reason,'ambiguous_jobposting');
  assert.equal(ctx.evaluatePublicJob(url,page(),url.replace('0123456789abcdef','abcdef0123456789'),200,now).status,'pending');
  assert.equal(ctx.evaluatePublicJob(url,'',url,403,now).reason,'HTTP 403');
  assert.equal(ctx.evaluatePublicJob(url,page()+'x'.repeat(600001),url,200,now).reason,'source_byte_budget_exceeded');
});

test('A copied aggregator notice requires verification of the original publisher', () => {
  const aggregate = 'https://www.opcionempleo.cl/jobad/cl0123456789abcdef';
  assert.equal(ctx.evaluatePublicJob(aggregate,page(),aggregate,200,now).reason,'aggregator_requires_original_source');
});
