/**
 * Small controlled concurrency baseline; NEVER target the production bridge.
 * Up to 25 simultaneous users / 120 GET requests total.
 * Uses LAB-local database routes only. Does not write any data.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
const ROOT = 'https://api-v2.appdeploy.ai/app/trabajo-cerca-lab-aislado-xirg9w/';
assert.ok(ROOT.includes('/app/trabajo-cerca-lab-aislado-'));
if (process.env.TC_LAB_LOAD_BASELINE !== 'yes') throw Error('Explicit lab-only flag required');
const PAGES = [
  'api/listings?lab=1&limit=40',
  'api/local-directory?kind=all&place=Collipulli',
  'api/local-directory?kind=business&place=Renaico',
];
const phases = [5, 10, 25];
const iterations = 3;
const allResults = [];
let errorCount = 0;
function percentile(array, p) {
  if (!array.length) return null;
  return array[Math.min(array.length - 1, Math.ceil(array.length * p) - 1)];
}
async function visit(worker, pass) {
  const url = new URL(PAGES[(worker + pass) % PAGES.length], ROOT);
  assert.ok(url.href.startsWith(ROOT));
  const started = performance.now();
  try {
    const r = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(11000),
      headers: { accept: 'application/json' },
    });
    const body = await r.text();
    const valid = r.status === 200 &&
      /json/i.test(r.headers.get('content-type') || '') &&
      body.length < 1000000 && body.trim().startsWith('{');
    return { ms: performance.now() - started, status: r.status, valid };
  } catch (error) {
    return { ms: performance.now() - started, status: 0, valid: false };
  }
}
for (const count of phases) {
  const started = performance.now();
  const groups = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const result = [];
      for (let pass = 0; pass < iterations; pass++)
        result.push(await visit(index, pass));
      return result;
    })
  );
  const results = groups.flat();
  const latencies = results.map(x => Math.round(x.ms)).sort((a, b) => a - b);
  const errors = results.filter(x => !x.valid);
  errorCount += errors.length;
  const summary = {
    concurrentUsers: count,
    requests: results.length,
    passed: results.length - errors.length,
    failed: errors.length,
    minMs: latencies[0],
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    maxMs: latencies[latencies.length - 1],
    durationMs: Math.round(performance.now() - started),
    non200StatusCounts: Object.fromEntries(
      [...new Set(errors.map(x => x.status))].map(status => [
        String(status), errors.filter(x => x.status === status).length,
      ])
    ),
  };
  allResults.push(summary);
  console.log('LAB_LOAD_BASELINE', JSON.stringify(summary));
}
console.log(JSON.stringify({
  target: 'isolated-LAB-database-only',
  totalRequests: allResults.reduce((s, v) => s + v.requests, 0),
  maxConcurrentUsers: Math.max(...phases),
  productionTraffic: 0,
  productionWrites: 0,
  failed: errorCount,
  p95ByPhaseMs: allResults.map(x => ({ vu: x.concurrentUsers, p95: x.p95Ms })),
}, null, 2));
if (errorCount > 0) process.exitCode = 1;
