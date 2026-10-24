import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';
function context(fetcher){const ctx={URL,Buffer,TextDecoder,AbortSignal,createHash,fetch:async(url,options)=>url.endsWith('/robots.txt')?new Response('User-agent: *\nAllow: /',{headers:{'content-type':'text/plain'}}):fetcher(url,options)};vm.createContext(ctx);for(const name of ['public-source-adapters.ts','public-robots.ts','public-source-http.ts'])vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8'),{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);return ctx;}
test('Declared Latin-1 public pages retain accents needed to verify the worksite',async()=>{
 const ctx=context(async()=>new Response(Buffer.from('<h1>Traiguén</h1>','latin1'),{headers:{'content-type':'text/html;charset=ISO-8859-1'}}));
 const r=await ctx.fetchPublicPage('https://www.bne.gob.cl/oferta/2026-109726');assert.equal(r.raw,'<h1>Traiguén</h1>');assert.equal(r.error,undefined);
});
test('Unknown encodings are reported rather than silently altering the source fields',async()=>{
 const ctx=context(async()=>new Response('Text',{headers:{'content-type':'text/html;charset=koi8-r'}}));assert.equal((await ctx.fetchPublicPage('https://www.bne.gob.cl/oferta/2026-109726')).error,'source_encoding_unsupported');
});
test('An individual BNE redirect cannot switch jobs before the destination is read',async()=>{
 const calls=[];const ctx=context(async url=>{calls.push(url);return new Response(null,{status:302,headers:{location:'https://www.bne.gob.cl/oferta/2026-109727'}});});
 const url='https://www.bne.gob.cl/oferta/2026-109726';assert.equal((await ctx.fetchPublicPage(url,url)).error,'redirect_identity_unconfirmed');assert.equal(calls.length,1);
});

test('robots denies and unknown policies stop before fetching any target content',async()=>{
 for(const policy of [new Response('User-agent: *\nDisallow: /oferta/',{headers:{'content-type':'text/plain'}}),new Response('denied',{status:403}),new Response('<html>Loading</html>',{headers:{'content-type':'text/html'}})]) {
  const calls=[],ctx=context(()=>{throw new Error('content_must_not_be_read');});
  ctx.fetch=async address=>{calls.push(address);return policy;};
  const result=await ctx.fetchPublicPage('https://www.bne.gob.cl/oferta/2026-109726');
  assert.ok(['robots_disallowed','robots_policy_unavailable'].includes(result.error));assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/robots.txt'));
 }
});
test('robots uses specific agent, wildcard terminal matching, longest path and allow on ties',()=>{
 const ctx=context(()=>{});
 assert.equal(ctx.publicRobotsAllow('User-agent: *\nDisallow: /*?secret=*\nAllow: /public?secret=ok$', 'https://www.munimulchen.cl/public?secret=ok'),true);
 assert.equal(ctx.publicRobotsAllow('User-agent: *\nDisallow: /*?secret=*\nAllow: /public?secret=ok$', 'https://www.munimulchen.cl/public?secret=bad'),false);
 assert.equal(ctx.publicRobotsAllow('User-agent: TrabajoCercaPublic\nDisallow:\nUser-agent: *\nDisallow: /', 'https://www.munimulchen.cl/'),true);
});
test('a genuine missing robots file allows a bounded public read',async()=>{
 const ctx=context(()=>{}),calls=[];
 ctx.fetch=async address=>{calls.push(address);return address.endsWith('/robots.txt')?new Response(null,{status:404}):new Response('Oferta',{headers:{'content-type':'text/html'}});};
 assert.equal((await ctx.fetchPublicPage('https://www.munimulchen.cl/oferta-laboral')).raw,'Oferta');assert.equal(calls.length,2);
});
test('a Spanish verification challenge is blocked rather than reported as no vacancies',async()=>{
 const ctx=context(async()=>new Response('<h1>Verificación requerida</h1><p>Nuestros sistemas detectaron tráfico inusual.</p>',{headers:{'content-type':'text/html'}}));
 assert.equal((await ctx.fetchPublicPage('https://www.opcionempleo.cl/empleo-en-angol.html')).error,'public_access_challenge');
});
