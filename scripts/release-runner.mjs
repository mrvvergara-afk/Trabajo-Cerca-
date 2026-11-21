import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const OFFICIAL_ID = 'trabajo-cerca-laboratorio-3ojgro';
export const MCP_ENDPOINT = 'https://api-v2.appdeploy.ai/mcp';
export const OFFICIAL_ORIGIN =
  'https://api-v2.appdeploy.ai/app/trabajo-cerca-laboratorio-3ojgro/';
export const FORBIDDEN = [
  /^backend\/lab-/,
  /^src\/lab-/,
  /^backend\/index\.ts$/,
  /^backend\/admin-backup\.ts$/,
  /^backend\/public-feed\.ts$/,
  /^src\/main\.tsx$/,
  /^tests\//,
  /^appdeploy\./,
  /^\.github\//,
  /secret/i,
];

export const sha256 = value =>
  createHash('sha256').update(value, 'utf8').digest('hex');

function fixedHex(value, length) {
  return typeof value === 'string' &&
    new RegExp('^[a-f0-9]{' + length + '}$', 'i').test(value);
}
export function validatePayload(payload, baseline, commitSha) {
  if (!payload || payload.schema !== 'tc-release-v1' ||
      payload.appId !== OFFICIAL_ID ||
      payload.expectedBaseline !== baseline ||
      !fixedHex(commitSha, 40) ||
      !Array.isArray(payload.files) ||
      payload.files.length < 1 || payload.files.length > 15)
    throw Error('Rejected release payload or baseline');
  const seen = new Set();
  for (const file of payload.files) {
    const path = file.filename;
    if (typeof path !== 'string' ||
      !/^(src|public|backend|shared)\/[a-zA-Z0-9._/-]+$/.test(path) ||
      path.includes('..') ||
      FORBIDDEN.some(re => re.test(path)) || seen.has(path))
      throw Error('Forbidden or duplicated release path');
    seen.add(path);
    if (!Array.isArray(file.diffs) || file.diffs.length < 1 ||
        file.diffs.length > 15 || 'content' in file)
      throw Error('Release requires bounded source diffs');
    for (const edit of file.diffs) {
      if (typeof edit.from !== 'string' || edit.from.length < 8 ||
          typeof edit.to !== 'string' || edit.from.length > 18000 ||
          edit.to.length > 36000 || edit.multiple)
        throw Error('Non-unique or oversized release edit');
    }
  }
  return true;
}
// Data recovery is certified only by a signed independent QA report.
// A timestamp, checkbox or page-export is not an atomic full-data backup.
export function enforceAttestations(env, now = Date.now(), context = {}) {
  if (env.TC_RELEASE_ENABLE !== 'approved') throw Error('Release disabled');
  if (!env.TC_APPDEPLOY_MCP_TOKEN || env.TC_APPDEPLOY_MCP_TOKEN.length < 30)
    throw Error('Owner-connected AppDeploy credential missing');
  const raw = env.TC_RELEASE_PROOF_JSON;
  const sig = env.TC_RELEASE_PROOF_SIGNATURE;
  const key = env.TC_RELEASE_PROOF_PUBLIC_KEY;
  if (!raw || !sig || !key || raw.length > 16000 || sig.length > 300 ||
      !/^[a-zA-Z0-9+/=]+$/.test(sig))
    throw Error('Missing signed independent recovery evidence');
  let proof;
  try { proof = JSON.parse(raw); } catch { throw Error('Invalid recovery evidence JSON'); }
  if (proof?.schema !== 'tc-release-attestation-v1' ||
      proof?.issuer !== 'independent-recovery-qa' ||
      proof?.appId !== OFFICIAL_ID ||
      proof?.baseline !== context.baseline ||
      proof?.candidateSha !== context.candidateSha ||
      !fixedHex(context.payloadSha256, 64) ||
      proof?.payloadSha256 !== context.payloadSha256)
    throw Error('Recovery evidence does not match candidate or production baseline');
  const b = proof.backup || {}, r = proof.restore || {};
  const f = proof.feed || {}, a = proof.admin || {};
  const fresh = (value, max) => {
    const v = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(v) && v <= now && v >= now - max;
  };
  if (b.scope !== 'full-app-data' || b.consistency !== 'atomic' ||
      b.encrypted !== true || b.external !== true ||
      !fixedHex(b.manifestSha256, 64) ||
      !fresh(b.completedAt, 24 * 3600000))
    throw Error('Atomic encrypted external production backup not certified');
  if (r.outcome !== 'passed' || !r.targetAppId ||
      r.targetAppId === OFFICIAL_ID ||
      r.recordsMatched !== true || r.filesMatched !== true ||
      !fixedHex(r.receiptSha256, 64) ||
      !fresh(r.verifiedAt, 24 * 3600000))
    throw Error('Independent isolated restore test not certified');
  if (f.noEmptyPages !== true || f.noDegradedPages !== true ||
      !fixedHex(f.receiptSha256, 64) ||
      !fresh(f.verifiedAt, 2 * 86400000))
    throw Error('Atomic public catalog continuity not certified');
  if (a.authenticated !== true || a.passed !== true ||
      !fixedHex(a.receiptSha256, 64) ||
      !fresh(a.verifiedAt, 7 * 86400000))
    throw Error('Authenticated administrator E2E not certified');
  let signed = false;
  try {
    const pub = createPublicKey(key);
    signed = pub.asymmetricKeyType === 'ed25519' &&
      verify(null, Buffer.from(raw, 'utf8'), pub, Buffer.from(sig, 'base64'));
  } catch { signed = false; }
  if (!signed) throw Error('Independent recovery evidence signature invalid');
  return { baseline: proof.baseline, backup: b.manifestSha256,
    restore: r.receiptSha256 };
}
function unwrap(mcp) {
  if (mcp.error) throw Error('MCP error: ' + String(mcp.error.message || 'unknown'));
  const content = mcp.result;
  if (!content || content.isError)
    throw Error('MCP tool error: ' +
      JSON.stringify(content?.content || []).slice(0, 360));
  if (content.structuredContent) return content.structuredContent;
  const text = content.content?.find(c => c.type === 'text')?.text;
  if (typeof text === 'string') {
    try { return JSON.parse(text); } catch { return { message: text }; }
  }
  return content;
}
function jsonOrSse(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const eventLines = trimmed.split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice(6));
  for (let i = eventLines.length - 1; i >= 0; i--) {
    try { return JSON.parse(eventLines[i]); } catch {}
  }
  throw Error('Invalid MCP response frame');
}
export class AppDeployMcp {
  constructor(token, request = fetch) {
    this.token = token;
    this.request = request;
    this.session = '';
    this.id = 0;
  }
  async rpc(method, params, notification = false) {
    const response = await this.request(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.token,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18',
        ...(this.session ? { 'Mcp-Session-Id': this.session } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0',
        ...(!notification ? { id: ++this.id } : {}),
        method, ...(params ? { params } : {}) }),
      signal: AbortSignal.timeout(35000),
      redirect: 'error',
    });
    if (!response.ok) throw Error('MCP HTTP ' + response.status);
    this.session ||= response.headers.get('mcp-session-id') || '';
    const raw = await response.text();
    return notification ? null : jsonOrSse(raw);
  }
  async initialize() {
    await this.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'trabajo-cerca-release', version: '1.0.0' },
    });
    await this.rpc('notifications/initialized', undefined, true);
  }
  async call(name, args = {}) {
    return unwrap(await this.rpc('tools/call',
      { name, arguments: { ...args, mcp_version: '2.13' } }));
  }
}
async function readPublic(request = fetch) {
  const response = await request(new URL('api/listings?limit=5', OFFICIAL_ORIGIN), {
    method: 'GET', redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw Error('Official public feed HTTP ' + response.status);
  const data = await response.json();
  if (!Array.isArray(data.items) || !data.items.length)
    throw Error('Official public feed is empty');
  if (data.degraded === true || data.feedRebuilding === true ||
      data.totalsProvisional === true ||
      /^(degraded|building|partial)/i.test(String(data.feedState || '')))
    throw Error('Official public feed is provisional or rebuilding');
  const total = Number(data.totalVerifiedJobOffers || 0);
  return { rows: data.items.length,
    count: Number.isSafeInteger(total) && total > 0 ? total : data.items.length };
}
async function checkOfficialPublicContracts(request = fetch) {
  const advertising = await request(
    new URL('api/growth/advertising?place=Todas&page=home&turn=1', OFFICIAL_ORIGIN),
    { method: 'GET', headers: { Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(15000) },
  );
  if (advertising.status !== 200)
    throw Error('Official advertising unavailable: ' + advertising.status);
  const ads = await advertising.json();
  if (!Array.isArray(ads.commercial) || !Array.isArray(ads.house))
    throw Error('Official advertising has an invalid public contract');
  const admin = await request(new URL('api/admin/session', OFFICIAL_ORIGIN), {
    method: 'GET', headers: { Accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (admin.status !== 401 && admin.status !== 403)
    throw Error('Administrative access unexpectedly exposed or unavailable: ' +
      admin.status);
  return true;
}
async function untilReady(client, version, wait = ms => new Promise(r => setTimeout(r, ms)),
  request = fetch, floor = 1) {
  for (let n = 0; n < 40; n++) {
    const [status, publicJobs] = await Promise.all([
      client.call('get_app_status', { app_id: OFFICIAL_ID, limit: 10 }),
      readPublic(request),
    ]);
    if (publicJobs.count < floor)
      throw Error('Catalog vanished or dropped during deployment');
    const dep = status.deployment || {};
    if (dep.snapshot_version === version && dep.status === 'ready') {
      const errors = status.qa_snapshot || {};
      if (errors.frontend_errors?.length || errors.network_errors?.length)
        throw Error('AppDeploy QA reported frontend or network errors');
      return status;
    }
    if (dep.status === 'failed' && dep.snapshot_version === version)
      throw Error('AppDeploy rejected released version');
    await wait(12000);
  }
  throw Error('AppDeploy did not reach ready within polling window');
}
export async function testOwnerConnection(env = process.env, request = fetch) {
  if (!env.TC_APPDEPLOY_MCP_TOKEN || env.TC_APPDEPLOY_MCP_TOKEN.length < 30)
    throw Error('AppDeploy owner credential missing');
  const client = new AppDeployMcp(env.TC_APPDEPLOY_MCP_TOKEN, request);
  await client.initialize();
  const who = await client.call('appdeploy_who_am_i');
  if (!who?.user?.user_id || who.isGuest === true ||
      !Array.isArray(who.apps) ||
      !who.apps.some(app => app.data?.app_id === OFFICIAL_ID))
    throw Error('AppDeploy credential does not belong to production app owner');
  const status = await client.call('get_app_status', { app_id: OFFICIAL_ID, limit: 3 });
  if (status.deployment?.status !== 'ready')
    throw Error('Official deployment is not READY');
  const feed = await readPublic(request);
  return { connected: true, appId: OFFICIAL_ID,
    version: status.deployment.snapshot_version, publicJobs: feed.count };
}
// Verify that the intended source diffs apply to the exact production baseline.
// If a deployment response is lost, compare the stored snapshot before deciding
// whether it is safe to roll back. Never revert an unrelated external deploy.
async function readReleaseSource(client, version, filename) {
  const source = await client.call('src_read', {
    app_id: OFFICIAL_ID, path: filename, version, offset: 0, limit: 2000,
  });
  if (source.version && source.version !== version)
    throw Error('Source version differs from the requested snapshot');
  if (typeof source.content !== 'string' ||
      !Number.isSafeInteger(source.total_lines) ||
      source.total_lines > 2000 ||
      source.content.split('\n').length !== source.total_lines)
    throw Error('Incomplete or oversized release source; manual reconciliation required');
  return source.content;
}
async function expectedReleasedSources(client, payload, baseline) {
  const expected = new Map();
  for (const file of payload.files) {
    let current = await readReleaseSource(client, baseline, file.filename);
    for (const { from, to } of file.diffs) {
      if (current.split(from).length !== 2)
        throw Error('Release diff anchor is absent or non-unique in the official baseline');
      current = current.replace(from, to);
    }
    expected.set(file.filename, current);
  }
  return expected;
}
async function confirmReleasedSources(client, version, expected) {
  for (const [filename, text] of expected) {
    const observed = await readReleaseSource(client, version, filename);
    if (observed !== text)
      throw Error('Unverified AppDeploy version contents: ' + filename);
  }
}

export async function runRelease({
  env = process.env, request = fetch, wait,
  payload, commitSha, baseline
}) {
  // No network call to deploy is permitted before all static guards.
  validatePayload(payload, baseline, commitSha);
  enforceAttestations(env, Date.now(), { baseline, candidateSha: commitSha,
    payloadSha256: sha256(JSON.stringify(payload)) });
  const client = new AppDeployMcp(env.TC_APPDEPLOY_MCP_TOKEN, request);
  await client.initialize();
  const who = await client.call('appdeploy_who_am_i');
  if (!who?.user?.user_id || who.isGuest === true ||
      !Array.isArray(who.apps) ||
      !who.apps.some(app => app.data?.app_id === OFFICIAL_ID))
    throw Error('AppDeploy credential does not belong to production app owner');

  const before = await client.call('get_app_status', { app_id: OFFICIAL_ID, limit: 5 });
  if (before.deployment?.snapshot_version !== baseline ||
      before.deployment?.status !== 'ready')
    throw Error('Production changed since release approval');
  const known = await client.call('get_app_versions', { app_id: OFFICIAL_ID });
  if (!known.versions?.some(v => String(v.version) === baseline))
    throw Error('Rollback snapshot missing');
  const healthyBefore = await readPublic(request);
  await checkOfficialPublicContracts(request);
  // Source verification precedes any possible production deployment.
  const expectedSources = await expectedReleasedSources(client, payload, baseline);
  const newFiles = payload.files.map(f => ({
    filename: f.filename,
    diffs: f.diffs.map(d => ({ from: d.from, to: d.to })),
  }));
  let acceptedVersion = null;
  let deployRequested = false;
  let candidateVerified = false;
  try {
    // From this point a transport error does NOT prove that nothing changed.
    deployRequested = true;
    const deploy = await client.call('deploy_app', {
      app_id: OFFICIAL_ID,
      app_name: 'Trabajo Cerca Laboratorio',
      app_type: 'frontend+backend',
      model: 'chat',
      initiator: 'user',
      type: 'release',
      intent: 'Approved Trabajo Cerca release ' + commitSha.slice(0, 12),
      description: 'Versioned and preverified self-service release',
      files: newFiles,
    });
    acceptedVersion = deploy.deployment?.snapshot_version;
    if (!acceptedVersion || !/^\d{12,20}$/.test(String(acceptedVersion))) {
      // The deployment call can commit server-side while its response is lost.
      // Never silently announce failure when a new version may be live.
      const observed = await client.call('get_app_status',
        { app_id: OFFICIAL_ID, limit: 5 });
      const current = observed.deployment?.snapshot_version;
      if (current && current !== baseline) {
        // Adopt the actual snapshot for the guarded QA/rollback path.
        acceptedVersion = current;
      } else if (current === baseline) {
        throw Error('No new AppDeploy version confirmed; baseline remains active');
      } else {
        throw Error('CRITICAL: deployment state indeterminate; manual reconciliation required');
      }
    }
    if (!/^\d{12,20}$/.test(String(acceptedVersion)))
      throw Error('CRITICAL: deployment version format unexpected');
    await confirmReleasedSources(client, acceptedVersion, expectedSources);
    candidateVerified = true;
    await untilReady(client, acceptedVersion, wait, request,
      Math.max(1, Math.floor(healthyBefore.count * 0.9)));
    const after = await readPublic(request);
    await checkOfficialPublicContracts(request);
    if (after.count < Math.max(1, Math.floor(healthyBefore.count * 0.9)))
      throw Error('Production feed count dropped beyond verified threshold');
    return { success: true, version: acceptedVersion,
      rollback: baseline, visibleJobs: after.count };
  } catch (cause) {
    if (!deployRequested) throw cause;
    if (!acceptedVersion) {
      // deploy_app can commit server-side and then lose its HTTP response.
      // One read-only reconciliation is safer than a second deploy request.
      let observed;
      try {
        observed = await client.call('get_app_status',
          { app_id: OFFICIAL_ID, limit: 5 });
      } catch {
        throw Error('CRITICAL: deployment response lost and production unreadable; manual reconciliation required; do not retry');
      }
      const current = observed.deployment?.snapshot_version;
      if (!current || current === baseline || !/^\d{12,20}$/.test(String(current)))
        throw Error('CRITICAL: deployment outcome unresolved; no safe automatic retry or rollback; inspect official version');
      acceptedVersion = current;
    }
    if (!candidateVerified) {
      try {
        await confirmReleasedSources(client, acceptedVersion, expectedSources);
        candidateVerified = true;
      } catch {
        // The changed snapshot may belong to another actor. Never roll it back.
        throw Error('CRITICAL: production snapshot changed but candidate ownership cannot be proved; manual reconciliation required');
      }
    }
    // Rollback CODE ONLY after snapshot contents prove they match our diffs.
    const rollback = await client.call('apply_app_version', {
      app_id: OFFICIAL_ID, version: baseline,
    });
    if (!rollback.success) throw Error('Critical: rollback rejected after ' + cause.message);
    await untilReady(client, baseline, wait, request, 1);
    const restored = await readPublic(request);
    if (restored.count < 1)
      throw Error('Critical: rollback restored code but no public jobs');
    throw Error('Release rolled back after failed postdeploy validation: ' + cause.message);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  if (env.TC_RELEASE_DRY_RUN === 'true') {
    const result = await testOwnerConnection(env);
    console.log('RELEASE_CONNECTION_TEST', JSON.stringify(result));
    process.exit(0);
  }
  const payload = JSON.parse(await readFile('release/payload.json', 'utf8'));
  const result = await runRelease({
    env, payload, commitSha: env.TC_CANDIDATE_SHA,
    baseline: env.TC_PRODUCTION_BASELINE,
  });
  console.log('RELEASE_CONFIRMED', JSON.stringify(result));
}
