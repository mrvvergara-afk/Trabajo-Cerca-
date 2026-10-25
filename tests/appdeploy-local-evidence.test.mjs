import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const code = stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/local-source-evidence.ts',import.meta.url),'utf8'),{ mode:'strip' })
  .replace(/^import .*;$/gm,'').replace(/^export /gm,'');

function harness(result) {
  const calls = [];
  const context = vm.createContext({ URL, Date, hydrateSocialFindings:async findings=>findings, db:{ async list(table,options) {
    calls.push({ table,options });
    if (result instanceof Error) throw result;
    return result;
  } } });
  vm.runInContext(code,context);
  return { read:cursor => context.readLocalSourceEvidence(cursor),calls };
}

test('Existing public evidence is paginated once without provider calls or private record fields', async () => {
  const h = harness({ items:[{ id:'run-one',sourceName:'OMIL de prueba',sourceUrl:'https://www.facebook.com/municipio/',
    createdAt:'2026-10-12T10:00:00Z',token:'SENSITIVE_TEST_SECRET',findings:[{ postUrl:'https://www.facebook.com/municipio/posts/123',
      text:'Se necesita operador. Enviar CV.',contact:'empleo@example.cl',mediaUrl:'https://scontent.example.fbcdn.net/photo.jpg' }] }],nextToken:'next-page' });
  const result = await h.read('page-one');
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].table,'social_capture_runs');
  assert.equal(h.calls[0].options.limit,3);
  assert.equal(h.calls[0].options.nextToken,'page-one');
  assert.equal(result.nextCursor,'next-page');
  assert.equal(result.providerCalls,0);
  assert.equal(result.items[0].findings[0].postDate,null,'Capture time is never substituted for source publication date');
  assert.equal(result.items[0].findings[0].commune,'','Page territory is never substituted for work location');
  assert.equal(result.items[0].jobNotices,null,'An absent source counter is unknown rather than zero');
  assert.equal(JSON.stringify(result).includes('SENSITIVE_TEST_SECRET'),false);
});

test('A bounded projection reports omitted findings rather than claiming complete coverage', async () => {
  const h = harness({ items:[{ id:'large',findings:Array.from({ length:25 },() => ({ text:'x'.repeat(10000) })) }] });
  const result = await h.read();
  assert.equal(result.items[0].findingsTotal,25);
  assert.equal(result.items[0].findings.length,20);
  assert.equal(result.items[0].findingsTruncated,true);
  assert.equal(result.items[0].findings[0].text.length,6000);
  assert.equal(result.items[0].findings[0].textTruncated,true);
  assert.equal(result.coverage,'one_bounded_page_of_existing_captures');
});

test('Credentials, arbitrary media hosts and missing source evidence are not projected as valid URLs', async () => {
  const h = harness({ items:[{ id:'unsafe',sourceUrl:'https://user:pass@www.facebook.com/page',findings:[
    { postUrl:'https://www.facebook.com/post?access_token=secret',mediaUrl:'https://internal.example/image.png' },
    { postUrl:'https://not-facebook.example/posts/1',mediaUrl:'https://scontent.example.fbcdn.net/img.jpg?token=secret' },
  ] }] });
  const result = await h.read();
  assert.equal(result.items[0].sourceUrl,null);
  assert.ok(result.items[0].findings.every(row => row.postUrl === null && row.mediaUrl === null));
});

test('Quota failures surface and malformed cursors never cause retries or database scans', async () => {
  const h = harness(new Error('429 AppDatabaseQuotaExceeded'));
  await assert.rejects(h.read(),/429/);
  assert.equal(h.calls.length,1);
  await assert.rejects(h.read('x'.repeat(4097)),/cursor/);
  assert.equal(h.calls.length,1);
});
