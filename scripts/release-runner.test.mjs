import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePayload, enforceAttestations, AppDeployMcp,
  runRelease, testOwnerConnection, OFFICIAL_ID,
} from './release-runner.mjs';
const SHA = 'a'.repeat(40);
const BASE = '1795209664148';
const good = () => ({
  schema: 'tc-release-v1',
  appId: OFFICIAL_ID, expectedBaseline: BASE,
  files: [{ filename: 'src/ux-preview-transfer.css',
    diffs: [{ from: '/* production view only */',
      to: '/* production view only; verified */' }] }],
});
const env = () => ({
  TC_RELEASE_ENABLE: 'approved',
  TC_RESTORE_VERIFIED_AT: new Date().toISOString(),
  TC_FEED_ATOMIC_VERIFIED_AT: new Date().toISOString(),
  TC_ADMIN_E2E_VERIFIED_AT: new Date().toISOString(),
  TC_APPDEPLOY_MCP_TOKEN: 'authorized_token_mock_for_node_test_only',
});
test('only a pinned existing official app can receive release', () => {
  assert.equal(validatePayload(good(), BASE, SHA), true);
  assert.throws(() => validatePayload(good(), '0000000000000', SHA));
  assert.throws(() => validatePayload({ ...good(), appId: 'otro-app' }, BASE, SHA));
  assert.throws(() => validatePayload({ ...good(), files: [] }, BASE, SHA));
  assert.throws(() => validatePayload(good(), BASE, 'unspecified-ref'));
});
test('paths cannot copy LAB bridge, backend routes, secrets or repeat files', () => {
  for (const path of [
    'backend/lab-public-directory.ts',
    'backend/index.ts', 'src/main.tsx', '.github/workflows/deploy.yml',
    'src/../backend/auth.ts', 'backend/access-secret.ts',
    'tests/tests.json',
  ]) {
    const p = good(); p.files[0].filename = path;
    assert.throws(() => validatePayload(p, BASE, SHA), path);
  }
  const p = good(); p.files.push(p.files[0]);
  assert.throws(() => validatePayload(p, BASE, SHA));
  const q = good(); q.files[0].diffs[0].multiple = true;
  assert.throws(() => validatePayload(q, BASE, SHA));
});
test('requires recent independent disaster recovery, feed and admin certificates', () => {
  assert.doesNotThrow(() => enforceAttestations(env()));
  for (const key of [
    'TC_RELEASE_ENABLE', 'TC_RESTORE_VERIFIED_AT',
    'TC_FEED_ATOMIC_VERIFIED_AT', 'TC_ADMIN_E2E_VERIFIED_AT',
    'TC_APPDEPLOY_MCP_TOKEN',
  ]) {
    const copy = env(); delete copy[key];
    assert.throws(() => enforceAttestations(copy), key);
  }
  const stale = env();
  stale.TC_RESTORE_VERIFIED_AT = '2025-01-01T00:00:00Z';
  assert.throws(() => enforceAttestations(stale));
});
function stubTransport({ badPostdeploy = false, deny = false } = {}) {
  const calls = [];
  let version = BASE, deployed = false;
  const request = async (url, init) => {
    if (String(url).includes('api/listings?')) {
      calls.push('feed');
      return new Response(JSON.stringify({
        items: [{ id: 'job', kind: 'job_offer' }],
        totalVerifiedJobOffers: badPostdeploy && deployed ? 1 : 100,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const body = JSON.parse(init.body);
    if (deny) return new Response('Unauthorized', { status: 401 });
    const method = body.params?.name || body.method;
    calls.push(method);
    if (body.method === 'notifications/initialized')
      return new Response('', { status: 202 });
    const result = method === 'initialize' ? { protocolVersion: '2025-06-18' }
      : method === 'appdeploy_who_am_i' ? { isGuest: false,
          user: { user_id: 'test-owner-only' },
          apps: [{ data: { app_id: OFFICIAL_ID } }],
        }
      : method === 'get_app_versions' ? { versions: [{ version: BASE }] }
      : method === 'get_app_status' ? {
          deployment: { status: 'ready', snapshot_version: version },
          qa_snapshot: { frontend_errors: [], network_errors: [] },
        }
      : method === 'deploy_app' ? (
          deployed = true, version = '1795999999999', {
            deployment: { status: 'deploying', snapshot_version: version },
          }
        )
      : method === 'apply_app_version' ? (
          deployed = false, version = BASE, { success: true }
        )
      : {};
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id,
      result: { structuredContent: result } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  };
  return { request, calls };
}
test('does not issue a single deployment request if credentials or certificates are absent', async () => {
  const stub = stubTransport();
  await assert.rejects(() => runRelease({ env: {}, request: stub.request,
    payload: good(), baseline: BASE, commitSha: SHA }));
  assert.equal(stub.calls.length, 0);
});
test('successful mock release checks baseline, backup version, deploy, and public jobs', async () => {
  const stub = stubTransport();
  const result = await runRelease({ env: env(), request: stub.request,
    payload: good(), baseline: BASE, commitSha: SHA, wait: async () => {} });
  assert.equal(result.success, true);
  assert.equal(result.rollback, BASE);
  assert.equal(stub.calls.filter(x => x === 'deploy_app').length, 1);
  assert.equal(stub.calls.filter(x => x === 'apply_app_version').length, 0);
});
test('mock post-deploy feed drop triggers code rollback and checks recovery', async () => {
  const stub = stubTransport({ badPostdeploy: true });
  await assert.rejects(() => runRelease({ env: env(),
    request: stub.request, payload: good(),
    baseline: BASE, commitSha: SHA, wait: async () => {} }),
    /rolled back/);
  assert.equal(stub.calls.filter(x => x === 'apply_app_version').length, 1);
});
test('bearer rejection cannot deploy anything', async () => {
  const stub = stubTransport({ deny: true });
  await assert.rejects(() => runRelease({ env: env(),
    request: stub.request, payload: good(),
    baseline: BASE, commitSha: SHA }), /MCP HTTP 401/);
  assert.equal(stub.calls.filter(x => x === 'deploy_app').length, 0);
});

test('owner connection dry-run never invokes deployment', async () => {
  const stub = stubTransport();
  const report = await testOwnerConnection(env(), stub.request);
  assert.equal(report.connected, true);
  assert.equal(report.version, BASE);
  assert.equal(stub.calls.filter(x => x === 'deploy_app').length, 0);
});
