import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';

const fixtures = {
  'motor-d.json': { schema_version: 1, producer: 'motor_d_territorial', scan_completed_at: '2026-11-27T19:09:45-03:00', sources_total: 175 },
  'gemini.json': { scanFinishedAt: '2026-11-27T15:41:32-03:00', sourcesAttempted: 143 },
  'chatgpt-20261123.json': {
    schema_version: 1, date: '2026-11-23', run_at: '2026-11-23T20:16:23Z',
    sources: [{ source_id: 'a', status: 'checked_found', checked_at: '2026-11-23T20:16:23Z' }],
  },
  'chatgpt-20261126.json': {
    schema_version: 1, date: '2026-11-26',
    waves: { 0: { heartbeat_at: '2026-11-26T11:59:15.577Z', results: [{ key: 'a', status: 'not_attempted' }] } },
  },
};
const sourceDirectory = process.env.TC_TELEMETRY_REPORT_DIR;
if (sourceDirectory) {
  for (const filename of Object.keys(fixtures)) {
    fixtures[filename] = JSON.parse(await readFile(resolve(sourceDirectory, filename), 'utf8'));
  }
}
const sdk = 'data:text/javascript,' + encodeURIComponent(`
  export const secrets = {
    listSecretNames: async () => ['MOTOR_C_GITHUB_READ_TOKEN'],
    readSecret: async () => 'synthetic-test-only',
  };
`);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@appdeploy/sdk') return { url: sdk, shortCircuit: true };
    if (context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !specifier.endsWith('.ts'))
      return next(specifier + '.ts', context);
    return next(specifier, context);
  },
});
const { producerAuditSnapshot } = await import('./engine-source-audit.ts');
const originalFetch = globalThis.fetch;
const realNow = Date.now;
let clock = Date.parse('2026-11-28T01:00:00Z');
Date.now = () => clock;
globalThis.fetch = async address => {
  const url = new URL(address);
  assert.equal(url.hostname, 'api.github.com');
  if (url.pathname.endsWith('/commits')) return Response.json([]);
  const filename = url.pathname.split('/').at(-1);
  const key = filename === 'producer_heartbeat.json' ? 'motor-d.json'
    : filename === 'gemini_source_audit_v2.json' ? 'gemini.json' : 'chatgpt-' + filename;
  const report = fixtures[key];
  if (!report) return new Response(null, { status: 404 });
  const bytes = Buffer.from(JSON.stringify(report));
  return Response.json({ encoding: 'base64', content: bytes.toString('base64'), size: bytes.length });
};
test.after(() => {
  globalThis.fetch = originalFetch;
  Date.now = realNow;
  hooks.deregister();
});

test('a heartbeat without source measurements preserves the latest measured day', async () => {
  const report = await producerAuditSnapshot();
  const row = report.rows.CHATGPT;
  assert.equal(row.observedAt, '2026-11-23T20:16:23.000Z');
  assert.ok(row.counts.attempted > 0);
  assert.match(row.notes.join(' '), /26T11:59:15.*sin consultas/i);
  assert.deepEqual(report.history.filter(point => point.engine === 'CHATGPT').map(point => point.day), ['2026-11-23']);
  assert.equal(report.sourceHistoryDays.CHATGPT, 1);
  assert.equal(report.rows.D.counts.attempted, 175);
  assert.equal(report.rows.GEMINI.counts.attempted, 143);
  if (sourceDirectory) console.log(JSON.stringify({
    motorD: report.rows.D.counts.attempted, gemini: report.rows.GEMINI.counts.attempted,
    chatgptAttempts: row.counts.attempted, chatgptObservation: row.observedAt,
    chatgptHeartbeatWithoutMeasurements: '2026-11-26T11:59:15.577Z',
  }));
});

test('wave results count measured sources once and ignore unread placeholders', async () => {
  clock += 31 * 60_000;
  fixtures['chatgpt-20261127.json'] = {
    schema_version: 1, date: '2026-11-27',
    waves: {
      0: {
        heartbeat_at: '2026-11-27T17:00:00-03:00',
        results: [{ key: 'read', status: 'checked_empty' }, { key: 'blocked', status: 'blocked' }],
      },
      1: {
        heartbeat_at: '2026-11-27T18:00:00-03:00',
        results: [{ key: 'read', status: 'not_attempted' }, { key: 'unmeasured', status: 'not_attempted' }],
      },
    },
  };
  const report = await producerAuditSnapshot();
  const row = report.rows.CHATGPT;
  assert.equal(row.counts.attempted, 2);
  assert.equal(row.counts.useful, 1);
  assert.equal(row.counts.blocked, 1);
  assert.equal(row.observedAt, '2026-11-27T20:00:00.000Z');
  assert.match(row.notes[0], /1\/6/);
  assert.equal(report.sourceHistoryDays.CHATGPT, 2);
});
