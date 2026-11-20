/**
 * One controlled real workflow in the isolated LAB database only:
 * publish an invented business, check it stays pending, then remove it.
 * Does not use real persons, does not promote entries, does not call PROD.
 * Run only through the dedicated GitHub Actions workflow.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

if (process.env.TC_LAB_FIXTURE_RUN !== 'yes') throw Error('Explicit fixture flag required');
const ORIGIN = 'https://api-v2.appdeploy.ai/app/trabajo-cerca-lab-aislado-xirg9w/';
assert.ok(ORIGIN.includes('/app/trabajo-cerca-lab-aislado-'));
const nonce = randomUUID().slice(0, 8);
const title = 'TC LAB QA Negocio ficticio ' + nonce;
const fakeEmail = 'labqa-' + nonce + '@example.invalid';
const fakePhone = '+56900000000';
let created = null;
let cleaned = false;
let calls = 0;

async function request(path, method = 'GET', input) {
  const url = new URL(path, ORIGIN);
  assert.ok(url.href.startsWith(ORIGIN), 'No external requests');
  calls++;
  const response = await fetch(url, {
    method,
    ...(input === undefined ? {} : {
      body: JSON.stringify(input),
    }),
    headers: {
      accept: 'application/json',
      ...(input === undefined ? {} : { 'content-type': 'application/json' }),
    },
    signal: AbortSignal.timeout(11000),
    redirect: 'manual',
    cache: 'no-store',
  });
  const raw = await response.text();
  if (raw.length > 300000) throw Error('Unexpected response size');
  const data = raw ? JSON.parse(raw) : {};
  return { status: response.status, data };
}

try {
  const createdResponse = await request('api/local-directory', 'POST', {
    kind: 'business',
    title,
    category: 'Negocio de prueba',
    description: 'Ficha ficticia para comprobar alta, moderación y retiro en LAB.',
    commune: 'Mininco',
    phone: fakePhone,
    email: fakeEmail,
    showPhone: false,
    showEmail: true,
    consent: true,
    photos: [],
  });
  assert.equal(createdResponse.status, 202, 'complete LAB form must be accepted');
  assert.equal(createdResponse.data.received, true);
  assert.equal(createdResponse.data.pendingModeration, true);
  assert.match(createdResponse.data.id, /^local_[a-f0-9-]{36}$/);
  assert.equal(typeof createdResponse.data.ownerToken, 'string');
  created = {
    id: createdResponse.data.id,
    ownerToken: createdResponse.data.ownerToken,
  };
  console.log('PASS created fictional LAB-only business pending moderation');

  const status = await request(
    'api/local-directory/' + encodeURIComponent(created.id) + '/status',
    'POST', { ownerToken: created.ownerToken }
  );
  assert.equal(status.status, 200);
  assert.equal(status.data.status, 'pending');
  assert.equal(status.data.commune, 'Collipulli');
  assert.equal(status.data.title, title);
  assert.equal(status.data.phone, undefined);
  assert.equal(status.data.email, undefined);
  console.log('PASS private owner receipt and Mininco to Collipulli');

  const publicList = await request(
    'api/local-directory?kind=all&place=Collipulli&search=' +
      encodeURIComponent(title)
  );
  assert.equal(publicList.status, 200);
  assert.ok(Array.isArray(publicList.data.items));
  assert.ok(!publicList.data.items.some(item => item.id === created.id));
  console.log('PASS unapproved fixture cannot enter public directory');

  const denied = await request(
    'api/local-directory/' + encodeURIComponent(created.id) + '/status',
    'POST', { ownerToken: 'invalid-owner-token' }
  );
  assert.equal(denied.status, 404);
  console.log('PASS arbitrary visitor cannot access private owner receipt');
} finally {
  if (created) {
    // Always attempt deletion; final record is hidden with owner/contact data blanked.
    // Do not print owner tokens or fabricated contact details in CI logs.
    for (let attempt = 0; attempt < 2 && !cleaned; attempt++) {
      try {
        const res = await request(
          'api/local-directory/' + encodeURIComponent(created.id) + '/delete',
          'POST', { ownerToken: created.ownerToken }
        );
        cleaned = res.status === 200 && res.data.removed === true;
      } catch {}
    }
    if (!cleaned) throw Error('LAB synthetic fixture cleanup failed: ' + created.id);
    console.log('PASS synthetic LAB fixture removed and sensitive fields cleared');
    const removed = await request(
      'api/local-directory/' + encodeURIComponent(created.id) + '/status',
      'POST', { ownerToken: created.ownerToken }
    );
    assert.equal(removed.status, 404);
    console.log('PASS previously valid owner token is revoked');
  }
}
assert.ok(cleaned);
console.log(JSON.stringify({
  target: 'isolated-lab-database-only',
  fixtureRemoved: cleaned,
  productionWrites: 0,
  requests: calls,
  results: 'six checks passed',
}, null, 2));
