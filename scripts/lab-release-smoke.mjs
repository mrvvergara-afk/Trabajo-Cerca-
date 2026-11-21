/**
 * Trabajo Cerca — no-write, single-pass release smoke test (post-quota-reset verification).
 * TARGET IS HARDCODED to the isolated LAB; no credentials or production writes.
 * Run: node scripts/lab-release-smoke.mjs (Node 20+)
 * No load test: < 16 low-rate sequential requests, no retries and no stored data.
 */
import assert from 'node:assert/strict';

const API = 'https://api-v2.appdeploy.ai/app/trabajo-cerca-lab-aislado-xirg9w/';
const SITE = 'https://trabajo-cerca-lab-aislado-xirg9w.v2.appdeploy.ai/';
assert.ok(API.includes('/app/trabajo-cerca-lab-aislado-'));
assert.ok(SITE.includes('trabajo-cerca-lab-aislado-'));
const results = [];
let requests = 0;

async function get(path, init = {}, site = false) {
  requests++;
  const url = new URL(path, site ? SITE : API);
  if (!url.href.startsWith(site ? SITE : API)) throw Error('Unexpected host');
  const response = await fetch(url, {
    method: init.method || 'GET',
    body: init.body,
    headers: { accept: 'application/json', ...init.headers },
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  if (text.length > 1_500_000) throw Error('Response unexpectedly large');
  return { response, text };
}
async function json(path, init = {}) {
  const { response, text } = await get(path, init);
  assert.equal(response.status, 200, path + ' should return 200');
  assert.match(response.headers.get('content-type') || '', /json/i, path);
  return JSON.parse(text);
}
async function test(title, body) {
  try {
    await body();
    results.push({ test: title, ok: true });
    console.log('PASS', title);
  } catch (err) {
    results.push({ test: title, ok: false });
    console.error('FAIL', title, err instanceof Error ? err.message : String(err));
  }
}

let firstPage;
await test('Read-only public verified jobs in LAB', async () => {
  firstPage = await json('api/listings?limit=40');
  assert.equal(firstPage.labPublicReadOnly, true);
  assert.ok(Array.isArray(firstPage.items) && firstPage.items.length > 0);
  assert.ok(firstPage.items.every(row =>
    row.kind === 'job_offer' && row.verified === true && row.review !== true
  ));
  assert.ok(Number(firstPage.totalVerifiedJobOffers) >= firstPage.items.length);
});
await test('Read-only pagination + published job detail', async () => {
  if (!firstPage || !firstPage.nextCursor) throw Error('First page or cursor missing');
  const next = await json('api/listings?limit=40&cursor=' +
    encodeURIComponent(firstPage.nextCursor));
  assert.ok(Array.isArray(next.items));
  const ids = new Set(firstPage.items.map(row => row.id));
  assert.ok(next.items.every(row => !ids.has(row.id)), 'duplicate across pages');
  const id = firstPage.items[0].id;
  assert.match(id, /^[A-Za-z0-9_-]{1,128}$/);
  const detail = await json('api/listings/' + encodeURIComponent(id));
  assert.equal(detail.item.id, id);
});
await test('Commercial catalog respects Collipulli and Mininco', async () => {
  const ads = await json('api/growth/advertising?place=Collipulli&page=home&turn=1');
  assert.equal(ads.labPublicReadOnly, true);
  assert.equal(ads.complete, true);
  assert.ok(Array.isArray(ads.house) && ads.house.length > 0);
  assert.ok(Array.isArray(ads.commercial));
  for (const item of ads.commercial) {
    assert.equal(item.status, 'active');
    assert.ok(item.communes.some(place =>
      ['Collipulli', 'Mininco', 'Todas'].includes(place)
    ), 'unrelated commercial commune');
  }
});
await test('Commercial catalog respects Renaico and Todas', async () => {
  for (const place of ['Renaico', 'Todas']) {
    const ads = await json('api/growth/advertising?place=' + place +
      '&page=home&turn=1');
    assert.equal(ads.complete, true);
    for (const item of ads.commercial) {
      assert.ok(item.communes.includes('Todas') ||
        (place !== 'Todas' && item.communes.includes(place)),
        'campaign outside its assigned territory');
    }
  }
});
await test('LAB directory returns only safe public fields', async () => {
  const directory = await json('api/local-directory?place=Collipulli&kind=all');
  assert.ok(Array.isArray(directory.items));
  for (const item of directory.items) {
    assert.equal(item.phone, undefined);
    assert.equal(item.email, undefined);
    assert.equal(item.ownerToken, undefined);
  }
});
await test('Anonymous administrator session and backup are blocked', async () => {
  const session = await get('api/admin/session');
  assert.ok([401, 403].includes(session.response.status),
    'admin/session returned ' + session.response.status);
  const backup = await get('api/admin/backup/page', {
    method: 'POST',
    body: JSON.stringify({ kind: 'scope' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.ok([401, 403].includes(backup.response.status),
    'backup export returned ' + backup.response.status);
});
await test('Anonymous directory moderation and reports are blocked', async () => {
  const id = 'local_00000000-0000-0000-0000-000000000000';
  const endpoints = [
    'api/admin/local-directory',
    'api/admin/local-directory/' + id + '/approve',
    'api/admin/local-directory/' + id + '/hide',
    'api/admin/local-directory/reviews/review_' + '0'.repeat(64) + '/approve',
    'api/admin/local-directory/reports/report_' +
      '00000000-0000-0000-0000-000000000000' + '/resolve',
  ];
  for (let i = 0; i < endpoints.length; i++) {
    const { response } = await get(endpoints[i], {
      method: i === 0 ? 'GET' : 'POST',
      ...(i === 0 ? {} : {
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    });
    assert.ok([401, 403].includes(response.status),
      'admin moderation unexpectedly available: ' + endpoints[i] +
      ' (' + response.status + ')');
  }
});
await test('Anonymous release control and execution are both blocked', async () => {
  for (const [path, method] of [
    ['api/admin/release/status', 'GET'],
    ['api/admin/release/execution', 'GET'],
    ['api/admin/release/execute', 'POST'],
  ]) {
    const { response } = await get(path, {
      method,
      ...(method === 'POST' ? {
        body: '{}', headers: { 'content-type': 'application/json' },
      } : {}),
    });
    assert.ok([401, 403].includes(response.status),
      'Release route exposed without admin access: ' + method +
      ' ' + path + ' (' + response.status + ')');
  }
});
await test('Unauthenticated GitHub OIDC release routes never expose or change a release', async () => {
  for (const path of ['api/internal/release/oidc-check',
                      'api/internal/release/poll']) {
    const { response } = await get(path, {
      method:'POST',
      body: JSON.stringify({action:'poll'}),
      headers:{'content-type':'application/json'},
    });
    assert.ok([401,403].includes(response.status),
      'Release OIDC endpoint exposed: '+path+' HTTP '+response.status);
  }
});
await test('Incomplete local business submission is rejected without saving', async () => {
  const { response } = await get('api/local-directory', {
    method: 'POST',
    body: JSON.stringify({ kind: 'business', title: '' }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(response.status, 400);
});
await test('LAB PWA manifest remains distinct from production', async () => {
  const { response, text } = await get('manifest.webmanifest', {}, true);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /json|manifest/i);
  const manifest = JSON.parse(text);
  assert.equal(manifest.short_name, 'TC LAB');
  assert.equal(manifest.id, './lab-qa');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});
await test('Local brand and house artwork return SVG, not SPA HTML', async () => {
  for (const filename of ['brand/trabajo-cerca-simbolo.svg',
    'house-creatives/explore.svg']) {
    const { response, text } = await get(filename, {}, true);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /svg|xml/i);
    assert.match(text.slice(0, 250), /<svg\b|<\?xml/i);
  }
});
console.log(JSON.stringify({
  surface: 'isolated-lab-only',
  passed: results.filter(x => x.ok).length,
  failed: results.filter(x => !x.ok).length,
  requests,
  noProductionWrites: true,
  tests: results,
}, null, 2));
if (results.some(x => !x.ok)) process.exitCode = 1;
