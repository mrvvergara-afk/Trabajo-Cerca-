import { createHash, timingSafeEqual } from 'node:crypto';
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
export function enforceAttestations(env, now = Date.now()) {
  if (env.TC_RELEASE_ENABLE !== 'approved') throw Error('Release disabled');
  const fields = [
    ['TC_RESTORE_VERIFIED_AT', 7 * 86400000],
    ['TC_FEED_ATOMIC_VERIFIED_AT', 2 * 86400000],
    ['TC_ADMIN_E2E_VERIFIED_AT', 7 * 86400000],
  ];
  for (const [key, age] of fields) {
    const date = Date.parse(env[key] || '');
    if (!Number.isFinite(date) || date > now || now - date > age)
      throw Error('Missing or stale independent evidence: ' + key);
  }
  if (!env.TC_APPDEPLOY_MCP_TOKEN || env.TC_APPDEPLOY_MCP_TOKEN.length < 30)
    throw Error('Owner-connected AppDeploy credential missing');
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
  const total = Number(data.totalVerifiedJobOffers || 0);
  return { rows: data.items.length,
    count: Number.isSafeInteger(total) && total > 0 ? total : data.items.length };
}
async function untilReady(client, version, wait = ms => new Promise(r => setTimeout(r, ms))) {
  for (let n = 0; n < 40; n++) {
    const status = await client.call('get_app_status', { app_id: OFFICIAL_ID, limit: 10 });
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
export async function runRelease({
  env = process.env, request = fetch, wait,
  payload, commitSha, baseline
}) {
  // No network call to deploy is permitted before all static guards.
  enforceAttestations(env);
  validatePayload(payload, baseline, commitSha);
  const client = new AppDeployMcp(env.TC_APPDEPLOY_MCP_TOKEN, request);
  await client.initialize();
  const who = await client.call('appdeploy_who_am_i');
  if (!who || who.is_guest) throw Error('AppDeploy owner login not confirmed');

  const before = await client.call('get_app_status', { app_id: OFFICIAL_ID, limit: 5 });
  if (before.deployment?.snapshot_version !== baseline ||
      before.deployment?.status !== 'ready')
    throw Error('Production changed since release approval');
  const known = await client.call('get_app_versions', { app_id: OFFICIAL_ID });
  if (!known.versions?.some(v => String(v.version) === baseline))
    throw Error('Rollback snapshot missing');
  const healthyBefore = await readPublic(request);
  const newFiles = payload.files.map(f => ({
    filename: f.filename,
    diffs: f.diffs.map(d => ({ from: d.from, to: d.to })),
  }));
  let acceptedVersion = null;
  try {
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
    if (!acceptedVersion || !/^\d{12,20}$/.test(String(acceptedVersion)))
      throw Error('Deployment was not confirmed with a version');
    await untilReady(client, acceptedVersion, wait);
    const after = await readPublic(request);
    if (after.count < Math.max(1, Math.floor(healthyBefore.count * 0.9)))
      throw Error('Production feed count dropped beyond verified threshold');
    return { success: true, version: acceptedVersion,
      rollback: baseline, visibleJobs: after.count };
  } catch (cause) {
    if (!acceptedVersion) throw cause;
    // Rollback code ONLY: external durable data restoration is separate.
    const rollback = await client.call('apply_app_version', {
      app_id: OFFICIAL_ID, version: baseline,
    });
    if (!rollback.success) throw Error('Critical: rollback rejected after ' + cause.message);
    await untilReady(client, baseline, wait);
    const restored = await readPublic(request);
    if (restored.count < 1)
      throw Error('Critical: rollback restored code but no public jobs');
    throw Error('Release rolled back after failed postdeploy validation: ' + cause.message);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const payload = JSON.parse(await readFile('release/payload.json', 'utf8'));
  const result = await runRelease({
    env, payload, commitSha: env.TC_CANDIDATE_SHA,
    baseline: env.TC_PRODUCTION_BASELINE,
  });
  console.log('RELEASE_CONFIRMED', JSON.stringify(result));
}
