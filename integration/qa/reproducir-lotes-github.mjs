import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [app, input, testedAt = '2026-11-27T20:00:00Z'] = process.argv.slice(2);
assert.ok(app && input, 'Pass the assembled candidate root and the directory containing the GitHub blobs.');
const timestamp = Date.parse(testedAt);
assert.ok(Number.isFinite(timestamp));
const runtime = name => pathToFileURL(resolve(app, 'backend', name)).href;
const { memoryDatabase } = await import(runtime('memory-appdeploy.mjs'));
const { db, tables } = memoryDatabase();
const rowCount = table => tables.get(table)?.size ?? 0;
const readBlob = async name => {
  const bytes = await readFile(resolve(input, name + '.json'));
  const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  return { sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64'), data: JSON.parse(bytes) };
};
const index = await readBlob('chatgpt-index');
const chatRoot = '/repos/mrvvergara-afk/Trabajo-Cerca-/contents/automation/chatgpt_ready/';
const geminiPath = '/repos/mrvvergara-afk/motor-rastreo-gemini/contents/output/trabajo_cerca_review_queue_v2.json';
const blobs = new Map([[chatRoot + 'index.json', index]]);
for (const row of index.data.batches) {
  const batch = await readBlob(row.batch_id);
  assert.equal(batch.data.batch_id, row.batch_id);
  assert.equal(batch.data.offers.length, row.count);
  blobs.set(chatRoot + row.file, batch);
}
const gemini = await readBlob('gemini-current');
const previous = await readBlob('gemini-processed');
blobs.set(geminiPath, gemini);

const sdkCode = `export const {db}=globalThis.tcReplaySdk;
export const secrets={listSecretNames:async()=>['MOTOR_C_GITHUB_READ_TOKEN'],readSecret:async()=>'local-fixture'};
export const isAppDatabaseError=error=>typeof error?.code==='string';
export const json=(body,statusCode=200)=>({statusCode,body:JSON.stringify(body)});
export const error=(message,statusCode)=>json({message},statusCode);`;
const verificationCode = `export async function checkOneReview(){return {status:'pending',reason:'source_verification_required'};}`;
const moduleUrl = code => 'data:text/javascript,' + encodeURIComponent(code);
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@appdeploy/sdk') return { url: moduleUrl(sdkCode), shortCircuit: true };
  if (context.parentURL === runtime('radar-review-queue.ts') && specifier === './radar-review-check')
    return { url: moduleUrl(verificationCode), shortCircuit: true };
  if (context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !specifier.endsWith('.ts'))
    return next(specifier + '.ts', context);
  return next(specifier, context);
} });
const originalFetch = globalThis.fetch;
const Clock = Date;
const warn = console.warn;
globalThis.tcReplaySdk = { db };
globalThis.Date = class extends Clock {
  constructor(...args) { super(...(args.length ? args : [timestamp])); }
  static now() { return timestamp; }
};
const unplannedRequests = [];
globalThis.fetch = async value => {
  const url = new URL(value);
  const saved = url.origin === 'https://api.github.com' && url.search === '?ref=main' && blobs.get(url.pathname);
  if (!saved) { unplannedRequests.push(url.origin); throw Error('Network is disabled for this replay.'); }
  const { data: _, ...metadata } = saved;
  return Response.json(metadata);
};
console.warn = () => {};
try {
  const { chatgptAutoImportHandler, confirmChatGPTPublications } = await import(runtime('chatgpt-auto-import.ts'));
  const { directChatGPTImport } = await import(runtime('chatgpt-direct-import.ts'));
  const { advancePublicFeed, readPublicFeedPage } = await import(runtime('public-feed.ts'));
  const { adaptGeminiCandidate, pullGeminiReviewQueue } = await import(runtime('motor-gemini-github-pull.ts'));
  const project = item => item.kind === 'job_offer' && item.verified === true && item.active === true ? item : null;
  const advance = () => advancePublicFeed({ project, refreshAt: () => null });
  for (let i = 0; i < 4 && !await readPublicFeedPage(); i++) await advance();
  assert.ok(await readPublicFeedPage(), 'Stable local manifest');

  const initialReports = [];
  for (const entry of index.data.batches) {
    const saved = blobs.get(chatRoot + entry.file);
    const { body } = await chatgptAutoImportHandler();
    const report = JSON.parse(body);
    assert.equal(report.state, 'chatgpt_imported_waiting_for_feed', JSON.stringify(report));
    assert.equal(report.indexSha, index.sha);
    assert.equal(report.batchSha, saved.sha);
    initialReports.push(report);
    await advance();
  }
  const result = await confirmChatGPTPublications();
  const chatgptRows = rowCount('radar_jobs');
  const receipts = [...tables.get('chatgpt_import_receipts').values()];
  const visible = (await readPublicFeedPage()).items.filter(item => item.verified === true);
  const expected = initialReports.reduce((sum, row) => sum + row.newCount, 0);
  assert.equal(result.published, expected);
  assert.equal(chatgptRows, expected);
  assert.equal(new Set(visible.map(row => row.id)).size, expected);
  assert.equal(receipts.reduce((sum, receipt) => sum + receipt.published, 0), expected);
  const retry = JSON.parse((await chatgptAutoImportHandler()).body);
  assert.equal(retry.processed, index.data.batches.length);
  assert.equal(rowCount('radar_jobs'), chatgptRows);
  const archived = [...blobs.values()].flatMap(blob => blob.data.offers ?? []).find(offer =>
    offer.fecha_publicacion === null && offer.fecha_cierre && Date.parse(offer.fecha_cierre + 'T23:59:59-03:00') < timestamp);
  assert.ok(archived, 'A historical undated offer with expired closing date');
  assert.equal(receipts.flatMap(row => row.results).find(row => row.id === archived.id_fuente)?.status, 'expired');
  const pending = rowCount('public_feed_changes');
  for (const fecha_cierre of [null, new Clock(timestamp + 7 * 86400000).toISOString().slice(0, 10)]) {
    const submission = await directChatGPTImport({ offers: [{ ...archived, fecha_cierre }], producer: 'chatgpt_territorial', commit: true });
    assert.equal(submission.statusCode, 400, 'Stale evidence cannot reopen or publish an undated vacancy');
  }
  assert.equal(rowCount('radar_jobs'), chatgptRows);
  assert.equal(rowCount('public_feed_changes'), pending);

  const primary = data => [...data.catalogo_principal_confirmadas, ...data.catalogo_principal_pendientes];
  const complementary = [...gemini.data.territorio_complementario_confirmadas, ...gemini.data.territorio_complementario_pendientes];
  const main = primary(gemini.data);
  const priorRows = primary(previous.data);
  const normalize = row => adaptGeminiCandidate(row)?.candidate_key;
  const priorKeys = new Set(priorRows.map(normalize).filter(Boolean));
  const currentKeys = new Set(main.map(normalize).filter(Boolean));
  assert.ok(main.length > 16 && complementary.length > 0);
  const imported = [];
  for (let cycle = 0; cycle < Math.ceil(main.length / 16); cycle++) {
    const report = await pullGeminiReviewQueue();
    assert.equal(report.state, 'import_completed', JSON.stringify(report));
    assert.equal(report.githubSha, gemini.sha);
    assert.equal(report.complementaryIsolated, complementary.length);
    assert.equal(report.published, 0);
    imported.push(report);
  }
  const replay = await pullGeminiReviewQueue();
  assert.equal(replay.inserted, 0);
  const reviewRows = [...tables.get('radar_review_inbox').values()].filter(row => row.kind === 'review_candidate');
  assert.equal(reviewRows.length, currentKeys.size);
  assert.ok(reviewRows.every(row => row.published === false && row.verified === false));
  assert.equal(rowCount('radar_jobs'), chatgptRows);
  assert.equal(imported.reduce((sum, row) => sum + row.received, 0), main.length);
  assert.equal(unplannedRequests.length, 0);
  const sum = field => imported.reduce((n, row) => n + row[field], 0);
  const outcomeCounts = Object.fromEntries([...new Set(receipts.flatMap(row => row.results.map(item => item.status)))].map(status =>
    [status, receipts.flatMap(row => row.results).filter(item => item.status === status).length]));
  process.stdout.write(JSON.stringify({ testedAt, scope: 'offline_replay_real_github_blobs_memory_database',
    chatgpt: { indexSha: index.sha, batches: receipts.map(row => ({ id: row.batchId, sha: row.batchSha, offers: row.results.length })),
      outcomes: outcomeCounts, locallyProjected: result.published, replayedBatches: retry.processed, duplicateRowsCreated: 0,
      staleOpenWithoutDeadlineRejected: true, staleOpenWithFutureDeadlineRejected: true },
    gemini: { blobSha: gemini.sha, previousObservedBlobSha: previous.sha, primary: main.length, complementaryExcluded: complementary.length,
      primaryKeysAddedSincePreviousBlob: [...currentKeys].filter(key => !priorKeys.has(key)).length,
      primaryKeysRemovedSincePreviousBlob: [...priorKeys].filter(key => !currentKeys.has(key)).length,
      received: sum('received'), receivedIntoReview: reviewRows.length, rejected: sum('rejected'), duplicateRowsCreatedOnReplay: replay.inserted,
      pendingIndependentSourceVerification: true, published: 0 },
    productionWrites: 0, appDeployCalls: 0, externalNetworkRequests: 0 }, null, 2) + '\n');
} finally {
  hooks.deregister();
  globalThis.fetch = originalFetch;
  globalThis.Date = Clock;
  console.warn = warn;
  delete globalThis.tcReplaySdk;
}
