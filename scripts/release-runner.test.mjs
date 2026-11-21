import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  validatePayload, enforceAttestations, AppDeployMcp,
  runRelease, testOwnerConnection, OFFICIAL_ID, sha256,
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
const context = () => ({ baseline: BASE, candidateSha: SHA,
  payloadSha256: sha256(JSON.stringify(good())) });
function makeProof() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const at = new Date().toISOString();
  const proof = {
    schema: 'tc-release-attestation-v1',
    issuer: 'independent-recovery-qa',
    appId: OFFICIAL_ID,
    baseline: BASE,
    candidateSha: SHA,
    payloadSha256: sha256(JSON.stringify(good())),
    backup: { scope: 'full-app-data', consistency: 'atomic',
      encrypted: true, external: true, manifestSha256: 'b'.repeat(64),
      completedAt: at },
    restore: { outcome: 'passed', targetAppId: 'isolated-restore-qa',
      recordsMatched: true, filesMatched: true,
      receiptSha256: 'c'.repeat(64), verifiedAt: at },
    feed: { noEmptyPages: true, noDegradedPages: true,
      receiptSha256: 'd'.repeat(64), verifiedAt: at },
    admin: { authenticated: true, passed: true,
      receiptSha256: 'e'.repeat(64), verifiedAt: at },
  };
  const raw = JSON.stringify(proof);
  const signature = sign(null, Buffer.from(raw), privateKey).toString('base64');
  return { raw, signature,
    publicKey: publicKey.export({ type:'spki', format:'pem' }) };
}
const env = () => {
  const p = makeProof();
  return {
    TC_RELEASE_ENABLE: 'approved',
    TC_RELEASE_PROOF_JSON: p.raw,
    TC_RELEASE_PROOF_SIGNATURE: p.signature,
    TC_RELEASE_PROOF_PUBLIC_KEY: p.publicKey,
    TC_APPDEPLOY_MCP_TOKEN: 'authorized_token_mock_for_node_test_only',
  };
};
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
test('requires signed independent DR/QA receipt, not bare dates', () => {
  assert.doesNotThrow(() => enforceAttestations(env(), Date.now(), context()));
  for (const key of [
    'TC_RELEASE_ENABLE', 'TC_RELEASE_PROOF_JSON',
    'TC_RELEASE_PROOF_SIGNATURE', 'TC_RELEASE_PROOF_PUBLIC_KEY',
    'TC_APPDEPLOY_MCP_TOKEN',
  ]) {
    const copy = env(); delete copy[key];
    assert.throws(() => enforceAttestations(copy, Date.now(), context()), key);
  }
  const forged = env();
  const json = JSON.parse(forged.TC_RELEASE_PROOF_JSON);
  json.restore.outcome = 'failed';
  forged.TC_RELEASE_PROOF_JSON = JSON.stringify(json);
  assert.throws(() => enforceAttestations(forged, Date.now(), context()));
  const replay = env();
  assert.throws(() => enforceAttestations(replay, Date.now(),
    { ...context(), baseline:'1234567890123' }), /baseline/);
  const legacy = env();
  delete legacy.TC_RELEASE_PROOF_JSON;
  legacy.TC_RESTORE_VERIFIED_AT = new Date().toISOString();
  legacy.TC_FEED_ATOMIC_VERIFIED_AT = new Date().toISOString();
  legacy.TC_ADMIN_E2E_VERIFIED_AT = new Date().toISOString();
  assert.throws(() => enforceAttestations(legacy, Date.now(), context()));
});
test('a signed proof cannot certify a partial, stale or unverified backup', () => {
  const p = makeProof();
  const { privateKey } = generateKeyPairSync('ed25519');
  const bad = JSON.parse(p.raw);
  bad.backup.consistency = 'rolling_non_atomic';
  const e = env();
  e.TC_RELEASE_PROOF_JSON = JSON.stringify(bad);
  assert.throws(() => enforceAttestations(e, Date.now(), context()), /Atomic encrypted/);
  const old = JSON.parse(p.raw);
  old.backup.completedAt = '2020-01-01T00:00:00Z';
  const stale = env();
  stale.TC_RELEASE_PROOF_JSON = JSON.stringify(old);
  assert.throws(() => enforceAttestations(stale, Date.now(), context()), /Atomic encrypted/);
});
function stubTransport({ badPostdeploy = false, provisionalPostdeploy = false,
  noDeployVersionInResponse = false, deny = false,
  throwAfterCommit = false, throwBeforeCommit = false,
  sourceMismatch = false, baselineSourceMismatch = false,
  externalChangeOnRollback = false } = {}) {
  const calls = [];
  let version = BASE, deployed = false, statusCalls = 0;
  const request = async (url, init) => {
    if (String(url).includes('api/growth/advertising?')) {
      calls.push('advertising');
      return new Response(JSON.stringify({ commercial: [], house: [{}] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).includes('api/admin/session')) {
      calls.push('admin_auth');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).includes('api/listings?')) {
      calls.push('feed');
      return new Response(JSON.stringify({
        items: [{ id: 'job', kind: 'job_offer' }],
        totalVerifiedJobOffers: badPostdeploy && deployed ? 1 : 100,
        degraded: provisionalPostdeploy && deployed,
        feedRebuilding: provisionalPostdeploy && deployed,
        totalsProvisional: provisionalPostdeploy && deployed,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const body = JSON.parse(init.body);
    if (deny) return new Response('Unauthorized', { status: 401 });
    const method = body.params?.name || body.method;
    calls.push(method);
    if (method === 'deploy_app' && throwBeforeCommit)
      throw Error('Simulated transport failure before acceptance');
    if (method === 'deploy_app' && throwAfterCommit) {
      deployed = true; version = '1795999999999';
      throw Error('Simulated transport failure after commit');
    }
    if (body.method === 'notifications/initialized')
      return new Response('', { status: 202 });
    const result = method === 'initialize' ? { protocolVersion: '2025-06-18' }
      : method === 'appdeploy_who_am_i' ? { isGuest: false,
          user: { user_id: 'test-owner-only' },
          apps: [{ data: { app_id: OFFICIAL_ID } }],
        }
      : method === 'get_app_versions' ? { versions: [{ version: BASE }] }
      : method === 'src_read' ? (() => {
          const requested = body.params?.arguments?.version;
          const from = '/* production view only */';
          const to = '/* production view only; verified */';
          const content = requested === BASE
            ? baselineSourceMismatch ? '/* unexpected baseline */' : from
            : sourceMismatch ? '/* unknown external change */' : deployed ? to : from;
          return { version: requested, total_lines: 1, content };
        })()
      : method === 'get_app_status' ? {
          deployment: { status: 'ready',
            snapshot_version: externalChangeOnRollback && deployed && ++statusCalls >= 2
              ? '1795888888888' : version },
          qa_snapshot: { frontend_errors: [], network_errors: [] },
        }
      : method === 'deploy_app' ? (
          deployed = true, version = '1795999999999', {
            deployment: { status: 'deploying',
              ...(noDeployVersionInResponse ? {} : { snapshot_version: version }) },
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
  assert.equal(stub.calls.filter(x => x === 'advertising').length, 2);
  assert.equal(stub.calls.filter(x => x === 'admin_auth').length, 2);
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

test('post-deploy provisional catalog with nonzero jobs triggers rollback', async () => {
  const stub = stubTransport({ provisionalPostdeploy: true });
  await assert.rejects(() => runRelease({ env: env(),
    request: stub.request, payload: good(),
    baseline: BASE, commitSha: SHA, wait: async () => {} }),
    /rolled back/);
  assert.equal(stub.calls.filter(x => x === 'apply_app_version').length, 1);
});

test('ambiguous deploy response reconciles live snapshot and still checks QA', async () => {
  const stub = stubTransport({ noDeployVersionInResponse:true });
  const result = await runRelease({ env:env(), request:stub.request,
    payload:good(), baseline:BASE, commitSha:SHA, wait:async () => {} });
  assert.equal(result.success,true);
  assert.equal(result.version,'1795999999999');
  assert.equal(stub.calls.filter(x => x === 'get_app_status').length >= 3,true);
});
test('ambiguous deploy response with degraded catalog reverts actual observed version', async () => {
  const stub = stubTransport({ noDeployVersionInResponse:true,
    provisionalPostdeploy:true });
  await assert.rejects(() => runRelease({ env:env(), request:stub.request,
    payload:good(), baseline:BASE, commitSha:SHA, wait:async () => {} }),
    /rolled back/);
  assert.equal(stub.calls.filter(x => x === 'apply_app_version').length,1);
});

test('lost deployment HTTP response after commit reconciles and rolls back only verified code', async () => {
  const stub = stubTransport({ throwAfterCommit: true });
  await assert.rejects(() => runRelease({ env: env(), request: stub.request,
    payload: good(), baseline: BASE, commitSha: SHA, wait: async () => {} }),
  /rolled back/);
  assert.equal(stub.calls.filter(x => x === 'deploy_app').length, 1);
  assert.equal(stub.calls.filter(x => x === 'apply_app_version').length, 1);
  assert.ok(stub.calls.filter(x => x === 'src_read').length >= 2);
});

test('lost response with no confirmed new version cannot retry or roll back blindly', async () => {
  const stub = stubTransport({ throwBeforeCommit: true });
  await assert.rejects(() => runRelease({ env: env(), request: stub.request,
    payload: good(), baseline: BASE, commitSha: SHA, wait: async () => {} }),
  /CRITICAL: deployment outcome unresolved/);
  assert.equal(stub.calls.filter(x => x === 'deploy_app').length, 1);
  assert.equal(stub.calls.filter(x => x === 'apply_app_version').length, 0);
});

test('changed snapshot without approved candidate code never triggers destructive rollback', async () => {
  const stub = stubTransport({ throwAfterCommit: true, sourceMismatch: true });
  await assert.rejects(() => runRelease({ env: env(), request: stub.request,
    payload: good(), baseline: BASE, commitSha: SHA, wait: async () => {} }),
  /candidate ownership cannot be proved/);
  assert.equal(stub.calls.filter(x => x === 'deploy_app').length, 1);
  assert.equal(stub.calls.filter(x => x === 'apply_app_version').length, 0);
});

test('baseline diff is unique and present before issuing any production deploy', async () => {
  const stub = stubTransport({ baselineSourceMismatch: true });
  await assert.rejects(() => runRelease({ env: env(), request: stub.request,
    payload: good(), baseline: BASE, commitSha: SHA, wait: async () => {} }),
  /absent or non-unique/);
  assert.equal(stub.calls.filter(x => x === 'deploy_app').length, 0);
});

test('concurrent external deployment after our release stops rollback of other code', async () => {
  const stub = stubTransport({ provisionalPostdeploy: true, externalChangeOnRollback: true });
  await assert.rejects(() => runRelease({ env: env(), request: stub.request,
    payload: good(), baseline: BASE, commitSha: SHA, wait: async () => {} }),
    /CRITICAL: live version changed/);
  assert.equal(stub.calls.filter(x => x === 'deploy_app').length, 1);
  assert.equal(stub.calls.filter(x => x === 'apply_app_version').length, 0);
});
