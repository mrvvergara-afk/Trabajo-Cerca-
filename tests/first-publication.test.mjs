import {readFileSync} from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';import assert from 'node:assert/strict';import test from 'node:test';
const ctx=vm.createContext({URL,Date});
for(const name of ['public-source-adapters.ts','first-publication.ts'])vm.runInContext(stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/'+name,import.meta.url),'utf8'),{mode:'strip'}).replace(/^import .*;$/gm,'').replace(/^export /gm,''),ctx);
test('the actual old TENS representative supplies incorporation age, without changing the new source record or original publication date',()=>{
 const item={url:'https://www.chiletrabajos.cl/trabajo/tens-para-cuidados-pacientes-domiciliarios-lumaco-3902931',createdAt:'2026-10-20T15:00:00Z',sourcePublishedAt:'2026-09-23T18:32:45Z'};
 assert.equal(ctx.knownFirstPublication(item),'2026-10-15T10:18:22.963Z');assert.equal(item.createdAt,'2026-10-20T15:00:00Z');assert.equal(item.sourcePublishedAt,'2026-09-23T18:32:45Z');
 assert.equal(ctx.knownFirstPublication({...item,url:'https://www.chiletrabajos.cl/trabajo/cargo-9999999'}),item.createdAt);
});
