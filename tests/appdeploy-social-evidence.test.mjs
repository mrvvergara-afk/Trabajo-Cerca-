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

test('Original dates and deadlines are checked without requiring a duplicate read after 24 hours',()=>{
  const { evidence }=h.prepareSocialEvidence(source(),new Date(now).toISOString(),places,now);
  assert.equal(h.socialVerificationBlock({ socialEvidence:evidence },places,now),null);
  assert.equal(h.socialVerificationBlock({ socialEvidence:evidence },places,now+86400001),null);
  assert.match(h.socialVerificationBlock({ socialEvidence:{...evidence,capturedAt:new Date(now+1).toISOString()} },places,now),/fecha válida/);
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

test('poster and caption jointly supply employer, contact and deadline from the same original post',()=>{
 const post={url:'https://www.instagram.com/p/testJob123/',date_posted:'2026-10-12T18:00:00-03:00',caption:'Empresa: Empresa de prueba\nEnviar CV a empleo@example.cl\nPlazo de postulación: 20 de octubre de 2026'};
 const poster={postUrl:post.url,title:'Operador forestal',text:'Se necesita Operador forestal\nLugar de trabajo: Mininco'};
 const merged=h.socialPosterFinding(post,poster,now);assert.ok(merged);assert.ok(merged.text.includes(post.caption));assert.ok(merged.text.includes(poster.text));
 const prepared=h.prepareSocialEvidence(merged,new Date(now).toISOString(),places,now);
 assert.equal(prepared.ready,true);assert.equal(prepared.contact,'empleo@example.cl');assert.equal(prepared.company,'Empresa de prueba');assert.equal(prepared.deadline,'2026-10-21T02:59:59.999Z');
 assert.equal(prepared.published,'2026-10-12T21:00:00.000Z');
});
test('a caption deadline or capture timestamp never substitutes for the original post date',()=>{
 const post={url:'https://www.instagram.com/p/testJob123/',caption:'Empresa: Empresa de prueba\nEnviar CV a empleo@example.cl\nPlazo de postulación: 20 de octubre de 2026',extractedAt:new Date(now).toISOString()};
 const merged=h.socialPosterFinding(post,{title:'Operador forestal',postDate:'2026-10-12',text:'Se necesita Operador forestal\nLugar de trabajo: Mininco'},now);
 assert.equal(merged.postDate,'');assert.equal(h.prepareSocialEvidence(merged,new Date(now).toISOString(),places,now).ready,false);
});
test('evidence from another post or the adjacent profile timeline cannot be joined',()=>{
 const post={url:'https://www.instagram.com/p/firstJob/',caption:'Plazo de postulación: 20 de octubre de 2026'};
 assert.equal(h.socialPosterFinding(post,{postUrl:'https://www.instagram.com/p/otherJob/',text:'Se necesita Operador'},now),null);
 assert.equal(h.socialPosterFinding({...post,url:'https://www.instagram.com/municipio/'},{text:'Se necesita Operador'},now),null);
});
test('adding a long caption preserves the original length and cannot silently approve truncated evidence',()=>{
 const merged=h.socialPosterFinding({url:'https://www.instagram.com/p/testJob123/',caption:'a'.repeat(5900)},{text:'b'.repeat(500)},now);
 assert.equal(merged.text.length,6000);assert.equal(merged.textTruncated,true);assert.ok(merged.textOriginalLength>6400);
});
test('a closed deadline written only in the caption stays closed after combining the poster',()=>{
 const merged=h.socialPosterFinding({url:'https://www.instagram.com/p/testJob123/',date_posted:'2026-10-10',caption:'Empresa: Empresa de prueba\nContacto: empleo@example.cl\nPlazo de postulación: 11 de octubre de 2026'},{title:'Operador forestal',text:'Se necesita Operador forestal\nLugar de trabajo: Mininco'},now);
 const prepared=h.prepareSocialEvidence(merged,new Date(now).toISOString(),places,now);assert.equal(prepared.ready,false);assert.ok(prepared.evidence.missing.includes('plazo vigente explícito y coherente'));
});

test('the actual collector path saves usable evidence when the deadline and contact are only in the caption',()=>{
 const patch=JSON.parse(readFileSync(new URL('../integrations/appdeploy/social-caption-controller-repair-2026-10-20.json',import.meta.url),'utf8'));
 h.post={url:'https://www.instagram.com/p/collectorJob123/',date_posted:'2026-10-12T18:00:00-03:00',caption:'Empresa: Empresa de prueba\nContacto: empleo@example.cl\nPlazo de postulación: 20 de octubre de 2026'};
 h.x={isJobNotice:true,title:'Operador forestal',text:'Se necesita Operador forestal\nLugar de trabajo: Mininco'};
 h.jobs=0;h.findings=[];h.mediaUrl='https://images.example.cl/afiche.jpg';h.socialOriginalDate=h.originalSocialDate;
 vm.runInContext(patch.diffs[1].to,h);
 assert.equal(h.jobs,1);assert.equal(h.findings.length,1);
 const result=h.prepareSocialEvidence(h.findings[0],new Date(now).toISOString(),places,now);
 assert.equal(result.ready,true);assert.equal(result.contact,'empleo@example.cl');assert.equal(result.company,'Empresa de prueba');
});


test('an explicit original publication date in the caption is sufficient without an image date',()=>{
 const post={url:'https://www.instagram.com/p/datedCaption/',caption:'Fecha de publicación: 12 de octubre de 2026\nEmpresa: Empresa de prueba\nPostular: empleo@example.cl'};
 const merged=h.socialPosterFinding(post,{title:'Operador forestal',text:'Oferta laboral Operador forestal\nLugar de trabajo: Mininco'},now);
 assert.equal(h.prepareSocialEvidence(merged,new Date(now).toISOString(),places,now).ready,true);
 assert.equal(merged.postDate,'2026-10-12T03:00:00.000Z');
});

test('a complete recent notice needs no invented closing date',()=>{
 const prepared=h.prepareSocialEvidence(source({deadline:'',text:'Se necesita Operador forestal\nEmpresa: Empresa de prueba\nLugar de trabajo: Mininco\nEnviar CV a empleo@example.cl'}),new Date(now).toISOString(),places,now);
 assert.equal(prepared.ready,true);assert.equal(prepared.deadline,null);
});

test('presential application accepts the stated street address without demanding an email or telephone',()=>{
 for (const address of ['Andrés Bello N° 146, Primer Piso','Av. La Cruz 567 interior','CORONEL URRUTIA S/N, EX REGIMIENTO']) {
 const prepared=h.prepareSocialEvidence(source({deadline:'',contact:'',text:'Se necesita Operador forestal\nEmpresa: Empresa de prueba\nLugar de trabajo: Mininco\nPostulación presencial en OMIL\n'+address}),new Date(now).toISOString(),places,now);
 assert.equal(prepared.ready,true,address);assert.equal(prepared.application.kind,'address');
 }
});

test('an application link can be the contact and unsafe destinations or a workplace alone are insufficient',()=>{
 const text='Se necesita Operador forestal\nEmpresa: Empresa de prueba\nLugar de trabajo: Mininco\nPostula en: wof-chile.com/postular';
 const prepared=h.prepareSocialEvidence(source({deadline:'',contact:'',text}),new Date(now).toISOString(),places,now);
 assert.equal(prepared.ready,true);assert.equal(prepared.application.value,'https://wof-chile.com/postular');
 for (const value of ['http://wof-chile.com/postular','https://user:secret@wof-chile.com/postular','https://127.0.0.1/postular','https://wof-chile.com/postular?access_token=secret']) {
 assert.equal(h.socialApplicationDestination('Postular: '+value),null,value);
 }
 assert.equal(h.socialApplicationDestination('Lugar de trabajo: Calle Los Robles 123, Angol'),null);
 assert.equal(h.socialApplicationDestination('Postulación presencial hasta el 25 de octubre'),null);
});

test('explicit closure in a caption cannot pass merely because there is no deadline field',()=>{
 const result=h.prepareSocialEvidence(source({deadline:'',text:'Oferta laboral Operador forestal\nEmpresa: Empresa de prueba\nLugar de trabajo: Mininco\nEnviar CV a empleo@example.cl\nPostulaciones cerradas'}),new Date(now).toISOString(),places,now);
 assert.equal(result.ready,false);assert.ok(result.evidence.missing.includes('postulación cerrada explícitamente'));
});
