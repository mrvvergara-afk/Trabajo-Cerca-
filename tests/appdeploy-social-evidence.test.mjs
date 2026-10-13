import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const code=stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/social-evidence.ts',import.meta.url),'utf8'),{ mode:'strip' }).replace(/^export /gm,'');
const h=vm.createContext({ Date,URL,Intl });
vm.runInContext(code,h);
const now=Date.parse('2026-10-13T02:00:00Z');
const places=text=>['Angol','Mininco','Negrete'].filter(place=>text.includes(place));
const source=extra=>({ postUrl:'https://www.facebook.com/municipio/posts/123',postDate:'2026-10-12T18:00:00-03:00',
  title:'Operador forestal',company:'Empresa de prueba',commune:'Mininco',contact:'empleo@example.cl',deadline:'2026-10-20',
  text:'Se necesita Operador forestal\nEmpresa: Empresa de prueba\nLugar de trabajo: Mininco\nEnviar CV a empleo@example.cl\nPlazo de postulación: 20 de octubre de 2026',...extra });

test('A poster preserves its literal employer and actual workplace apart from the publishing town',()=>{
  const result=h.prepareSocialEvidence(source({ territory:'Angol',sourceName:'Radio local' }),new Date(now).toISOString(),places,now);
  assert.equal(result.company,'Empresa de prueba');
  assert.deepEqual([...result.workCommunes],['Mininco']);
  assert.equal(result.ready,true);
  assert.equal(result.deadline,'2026-10-21T02:59:59.999Z');
});

test('Missing fields remain pending and a radio or municipality never becomes the employer or worksite',()=>{
  const result=h.prepareSocialEvidence(source({ company:'',commune:'',text:'Se necesita Operador forestal. OMIL Angol. empleo@example.cl' }),new Date(now).toISOString(),places,now);
  assert.equal(result.company,'');
  assert.equal(result.workplace,'');
  assert.equal(result.ready,false);
  assert.deepEqual([...result.workCommunes],[]);
  assert.ok(result.evidence.missing.includes('plazo vigente explícito y coherente'));
});

test('Source dates reject relative, yearless, future and invalid-calendar values',()=>{
  for (const value of ['hoy','12 octubre','30/02/2026','2026-02-30','2026-10-12T18:00:00']) assert.equal(h.socialSourceDate(value),null);
  const future=h.prepareSocialEvidence(source({ postDate:'2026-10-14' }),new Date(now).toISOString(),places,now);
  assert.ok(future.evidence.missing.includes('fecha original reciente'));
  assert.equal(h.socialSourceDate('12 de octubre de 2026'),'2026-10-12T03:00:00.000Z');
});

test('A claimed contact, employer or deadline cannot replace absent or contradictory literal text',()=>{
  const result=h.prepareSocialEvidence(source({ company:'Empresa inventada',deadline:'2026-11-30',contact:'inventado@example.cl' }),new Date(now).toISOString(),places,now);
  assert.equal(result.company,'');
  assert.equal(result.contact,'empleo@example.cl');
  assert.equal(result.ready,false);
  assert.ok(result.evidence.missing.includes('plazo vigente explícito y coherente'));
});

test('Full bounded transcription keeps contacts beyond 500 characters and records truncation honestly',()=>{
  const text='Requisitos: '.repeat(70)+'\nContacto: empleo@example.cl';
  const kept=h.preservedSocialFinding(source({ text }));
  assert.ok(kept.text.includes('empleo@example.cl'));
  assert.equal(kept.textTruncated,false);
  const capped=h.preservedSocialFinding(source({ text:'x'.repeat(7000) }));
  assert.equal(capped.text.length,6000);
  assert.equal(capped.textOriginalLength,7000);
  assert.equal(capped.textTruncated,true);
  assert.equal(h.preservedSocialFinding(capped).textOriginalLength,7000);
  assert.equal(h.preservedSocialFinding(capped).textTruncated,true);
});

test('Profile pages, URLs with credentials and unsourced legacy records never pass the social publication gate',()=>{
  for (const postUrl of ['https://www.facebook.com/municipio/','https://user:pass@www.facebook.com/municipio/posts/123',
    'https://www.facebook.com/municipio/posts/123?access_token=private']) {
    const result=h.prepareSocialEvidence(source({ postUrl }),new Date(now).toISOString(),places,now);
    assert.equal(result.ready,false);
  }
  assert.match(h.socialVerificationBlock({},places,now),/transcripción/);
  assert.equal(h.sameSocialPost('https://www.facebook.com/page/posts/123','https://m.facebook.com/page/posts/123?fbclid=tracking'),true);
  assert.equal(h.sameSocialPost('https://www.facebook.com/page/posts/123','https://www.facebook.com/page/posts/456'),false);
  assert.equal(h.sameSocialPost('https://www.facebook.com/page/posts/123','https://www.facebook.com/login/'),false);
});

test('Dates and recapture requirements are reevaluated before a social notice can publish',()=>{
  const { evidence }=h.prepareSocialEvidence(source(),new Date(now).toISOString(),places,now);
  assert.equal(h.socialVerificationBlock({ socialEvidence:evidence },places,now),null);
  assert.match(h.socialVerificationBlock({ socialEvidence:evidence },places,now+86400001),/lectura reciente/);
  assert.match(h.socialVerificationBlock({ socialEvidence:{ ...evidence,deadline:'2026-10-12T00:00:00Z' } },places,now),/plazo/);
});

test('An explicitly published Unix date is retained while the capture timestamp never becomes the post date',()=>{
  const stamp=Date.parse('2026-10-12T12:00:00Z');
  assert.equal(h.originalSocialDate({ date_posted:stamp/1000 }),new Date(stamp).toISOString());
  assert.equal(h.originalSocialDate({ date_posted:String(stamp) }),new Date(stamp).toISOString());
  assert.equal(h.originalSocialDate({ timestamp:stamp,extractedAt:new Date(stamp).toISOString() }),'');
});

test('A literal caption is preserved for review without an AI call, source-town fallback or invented employer',()=>{
  const result=h.captionSocialFinding({ post_url:'https://www.facebook.com/municipio/posts/123',content:'Se necesita operador\nEnviar CV a empleo@example.cl',timestamp:Date.now() });
  assert.equal(result.company,'');assert.equal(result.commune,'');assert.equal(result.postDate,'');
  assert.equal(result.contact,'empleo@example.cl');
  assert.equal(h.captionSocialFinding({ url:'https://www.facebook.com/municipio/',content:'Se necesita operador' }),null);
});
