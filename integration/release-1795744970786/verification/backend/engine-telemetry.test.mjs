import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const at = minutes => new Date(Date.now() - minutes * 60_000).toISOString();
const chileDay = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date(value));
const stageTime = at(5);
const records = {
  free_public_source_cursor_v3: { checkedAt: at(10), summary: { sourcesRead: 0, audits: [] } },
  motor_c_local_latest: { at: at(20), visited: 8 },
  fast_bc_state_v2: { lastRunAt: at(80), runId: 'older', lastBatch: { remainingPdf: 40, decisions: { blocked: 18 } } },
};
const receipts = [
  { id: 'one-B', engine: 'B', runId: 'one', finishedAt: stageTime, status: 'completed', processed: 0, inputCount: 0, remainingDocuments: 0 },
  { id: 'one-C', engine: 'C', runId: 'one', finishedAt: stageTime, status: 'failed', processed: null, error: 'lectura fallida' },
  { id: 'older-C', engine: 'C', runId: 'older', finishedAt: at(6), status: 'completed', processed: 3, inputCount: 8 },
];
const engineSnapshot = {
  rows: {
    D: { id: 'D', observedAt: at(600), status: 'stale', counts: { attempted: 12 }, notes: [] },
    GEMINI: { id: 'GEMINI', observedAt: at(10), status: 'recent', counts: { attempted: 30 }, notes: [] },
  },
  history: [], historyDays: 1, sourceHistoryDays: { D: 1, GEMINI: 1 }, sourceWarnings: [],
};
globalThis.telemetryFixture = {
  async list(table) {
    if (table === 'bc_stage_execution_receipts_v1') return { items: receipts };
    if (table === 'engine_telemetry_snapshots_v1') throw Error('snapshot store unavailable');
    return { items: [] };
  },
  async get(table) {
    return [records[table] ?? null];
  },
  producerAuditSnapshot: async () => engineSnapshot,
};
const sdk = 'data:text/javascript,' + encodeURIComponent('export const db = globalThis.telemetryFixture;');
const producer = 'data:text/javascript,' + encodeURIComponent('export const { producerAuditSnapshot } = globalThis.telemetryFixture;');
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@appdeploy/sdk') return { url: sdk, shortCircuit: true };
    if (specifier === './engine-source-audit') return { url: producer, shortCircuit: true };
    if (context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !specifier.endsWith('.ts'))
      return next(specifier + '.ts', context);
    return next(specifier, context);
  },
});
const { executiveEngineTelemetry } = await import('./engine-telemetry.ts');
test.after(() => hooks.deregister());

test('six engines distinguish a completed zero, a failed cycle and a missing report', async () => {
  const report = await executiveEngineTelemetry();
  const engine = id => report.engines.find(item => item.id === id);
  assert.deepEqual(report.engines.map(row => row.id), ['A', 'B', 'C', 'D', 'CHATGPT', 'GEMINI']);
  assert.equal(engine('A').counts.attempted, 0);
  assert.equal(engine('B').counts.processed, 0);
  assert.equal(engine('B').status, 'recent');
  assert.equal(engine('C').status, 'error');
  assert.equal(engine('C').counts.processed, null);
  assert.equal(engine('C').observedAt, stageTime);
  assert.equal(engine('D').status, 'stale');
  assert.equal(engine('CHATGPT').status, 'unreported');
  assert.equal(engine('CHATGPT').counts.attempted, null);
  assert.equal(engine('GEMINI').counts.attempted, 30);
  assert.equal(report.bcOperations.pdf.pending, 0);
  assert.deepEqual(report.bcOperations.pdf.decisions, {});
  assert.deepEqual(report.missingOrFailed, ['C', 'CHATGPT']);
  assert.equal(report.rollup.recent, 3);

  assert.ok(report.history.some(point => point.engine === 'B' && point.day === chileDay(stageTime) && point.value === 0));
  assert.ok(report.history.some(point => point.engine === 'C' && point.measure === 'docs_processed' && point.value === 3));
  assert.ok(!report.history.some(point => point.engine === 'CHATGPT'));
});

test('an unavailable snapshot store marks the historical coverage partial', async () => {
  const report = await executiveEngineTelemetry();
  const durable = report.historyQuality.sources.find(item => item.table === 'engine_telemetry_snapshots_v1');
  assert.equal(durable.readError, true);
  assert.equal(durable.complete, false);
  assert.match(report.historyQuality.note, /Recuperación parcial/);
});
