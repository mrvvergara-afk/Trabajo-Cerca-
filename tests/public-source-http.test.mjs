import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';import vm from 'node:vm';
function context(fetcher){const ctx={URL,Buffer,TextDecoder,AbortSignal,fetch:fetcher};vm.createContext(ctx);for(const name of ['public-source-adapters.ts','public-source-http.ts'])vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8'),{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);return ctx;}
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
