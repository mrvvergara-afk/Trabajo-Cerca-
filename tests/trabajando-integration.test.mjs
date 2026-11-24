import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

test('scheduled worker persists discovery, retries safely and confirms only a visible insertion', async () => {
  const root = 'https://www.trabajando.cl/sitemap.xml';
  const detail = 'https://www.trabajando.cl/trabajo/12345-mecanico-angol';
  const rows = new Map();
  const table = name => {
    if (!rows.has(name)) rows.set(name, new Map());
    return rows.get(name);
  };
  const add = async (name, records) => records.map(record => {
    const id = record.id ?? String(table(name).size);
    if (table(name).has(id)) return null;
    table(name).set(id, structuredClone({...record,id}));
    return id;
  });
  let visible = false;
  let saves = 0;
  let firstAttempt = true;
  globalThis.auditFixture = {
    db: {
      get: async (name, ids) => ids.map(id => table(name).get(id)),
      list: async name => ({items:[...table(name).values()]}),
      add,
      transact: async operations => Promise.all(operations),
      tx: {
        add,
        delete: async (name, ids) => ids.map(id => table(name).delete(id)),
        update: async (name, records) => records.map(({id,record,if:condition}) => {
          const prev = table(name).get(id);
          if (!prev || condition && Object.entries(condition).some(([key,value])=>prev[key]!==value)) return false;
          table(name).set(id, structuredClone(record));
          return true;
        }),
      },
    },
    openPublicResponse: async url => {
      assert.equal(url, root);
      const xml = '<urlset><url><loc>'+detail+'</loc></url></urlset>';
      return {url,response:new Response(xml,{headers:{'content-type':'application/xml'}})};
    },
    fetchPublicPage: async url => {
      assert.equal(url, detail);
      if (firstAttempt) {
        firstAttempt = false;
        return {status:429,retryAfter:'7200'};
      }
      return {status:200,url,raw:'fixture'};
    },
    publicSourceAdapter: url => url===detail?{identityUrl:detail}:null,
    safePublicUrl: (url,base) => new URL(url,base).href,
    evaluatePublicJob: url => ({status:'verified',url}),
    saveVerifiedPublicOffer: async (offer, now, {runId}) => {
      saves++;
      const record={id:'test-offer',table:'test-table',storedAt:now,runId,status:'stored'};
      await add('trabajando_publication_receipts_v1',[record]);
      await add('trabajando_visibility_pending_v1',[record]);
      return {id:'test-offer',created:true};
    },
    currentPublicFeedManifest: async () => ({manifestId:'fixture',manifest:{
      pages:[{keys:visible?['test-table:test-offer']:[]}],
    }}),
    readPublicFeedItem: async () => visible?{verified:true}:null,
  };
  const names = {
    '@appdeploy/sdk':['db'],
    './public-source-http':['openPublicResponse','fetchPublicPage'],
    './public-source-adapters':['publicSourceAdapter','safePublicUrl'],
    './public-source-verifier':['evaluatePublicJob'],
    './free-public-sources':['saveVerifiedPublicOffer'],
    './public-feed':['currentPublicFeedManifest','readPublicFeedItem'],
  };
  const handle = registerHooks({resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/trabajando-targeted.ts')) {
      const exports = names[specifier];
      if (exports) return {shortCircuit:true,url:'data:text/javascript,'+
        encodeURIComponent('export const {'+exports.join(',')+'}=globalThis.auditFixture;')};
      if (specifier.startsWith('./')) return next(specifier+'.ts',context);
    }
    return next(specifier,context);
  }});
  const originalNow = Date.now;
  let now = Date.UTC(2026,10,24,12);
  Date.now = () => now;
  try {
    const {trabajandoTargetedHandler: run} = await import('../backend/trabajando-targeted.ts');
    await run();
    assert.equal(table('trabajando_targeted_state').get('current').queue[0].url, detail);
    now += 15*60_000;
    await run();
    assert.equal(saves, 0);
    assert.equal(table('trabajando_targeted_state').get('current').queue[0].due, now+7_200_000);
    now += 15*60_000;
    await run();
    assert.equal(saves, 0);
    now += 7_200_000;
    await run();
    await run();
    assert.equal(saves, 1);
    assert.equal(table('trabajando_publication_receipts_v1').get('test-offer').status, 'stored');
    now += 15*60_000;
    await run();
    assert.equal(table('trabajando_publication_receipts_v1').get('test-offer').status, 'stored');
    visible = true;
    now += 15*60_000;
    await run();
    const receipt = table('trabajando_publication_receipts_v1').get('test-offer');
    assert.equal(receipt.status, 'visible');
    assert.equal(receipt.manifestId, 'fixture');
    assert.equal(table('trabajando_visibility_pending_v1').size, 0);
  } finally {
    Date.now = originalNow;
    handle.deregister();
    delete globalThis.auditFixture;
  }
});
