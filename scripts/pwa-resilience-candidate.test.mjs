import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';
import { validatePayload } from './release-runner.mjs';

const candidate = JSON.parse(
  readFileSync('release/candidates/pwa-resilience-20261120.json', 'utf8')
);
const baseline = readFileSync(
  'release/baselines/sw-1795209664148.js', 'utf8'
);

function applyReleaseDiffs() {
  let code = baseline;
  for (const item of candidate.files) {
    assert.equal(item.filename, 'public/sw.js');
    for (const { from, to } of item.diffs) {
      const count = code.split(from).length - 1;
      assert.equal(count, 1, 'Non-unique or missing source anchor');
      code = code.replace(from, to);
    }
  }
  return code;
}

test('release proposal targets only the pinned official PWA code', () => {
  assert.equal(candidate.schema, 'tc-release-v1');
  assert.equal(candidate.appId, 'trabajo-cerca-laboratorio-3ojgro');
  assert.equal(candidate.expectedBaseline, '1795209664148');
  assert.equal(candidate.files.length, 1);
  assert.equal(candidate.files[0].filename, 'public/sw.js');
  assert.equal(candidate.files[0].diffs.length, 4);
  assert.equal(
    validatePayload(candidate, candidate.expectedBaseline, 'a'.repeat(40)),
    true
  );
});

test('all source diffs apply uniquely and keep the worker parseable', () => {
  const patched = applyReleaseDiffs();
  assert.ok(patched.includes('caches.match(request)'));
  assert.ok(patched.includes("previous.slice(0,4)"));
  assert.ok(patched.includes("await cache.add('./')"));
  new Script(baseline, { filename: 'baseline-sw.js' });
  new Script(patched, { filename: 'candidate-sw.js' });
});

function makeWorker(code = applyReleaseDiffs()) {
  const handlers = new Map();
  const stores = new Map();
  const calls = [];
  const key = request => typeof request === 'string' ? request : request.url;
  const requestFetch = async request => {
    const url = key(request);
    calls.push(url);
    if (url.endsWith('icon-512.png')) throw new Error('Optional icon offline');
    return new Response('<html lang="es"></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  };
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        async put(request, response) {
          data.set(key(request), response);
        },
        async match(request) {
          return data.get(key(request));
        },
        async add(request) {
          const response = await requestFetch(request);
          if (!response.ok) throw new Error('cache add failed');
          data.set(key(request), response.clone());
        },
      };
    },
    async match(request) {
      for (const bucket of stores.values()) {
        const matched = bucket.get(key(request));
        if (matched) return matched;
      }
      return undefined;
    },
    async keys() {
      return Array.from(stores.keys());
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
  const self = {
    registration: { scope: 'https://trabajo-cerca.test/' },
    location: { origin: 'https://trabajo-cerca.test' },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(name, handler) {
      handlers.set(name, handler);
    },
  };
  runInNewContext(
    code,
    { self, caches, fetch: requestFetch, Request, Response, URL,
      URLSearchParams, Promise, Date, console },
    { timeout: 2000 }
  );
  return { handlers, stores, calls, caches };
}

test('PWA installation survives an optional icon download failure', async () => {
  const worker = makeWorker();
  let wait;
  worker.handlers.get('install')({
    waitUntil(promise) { wait = promise; },
  });
  await wait;
  assert.ok(worker.stores.get('trabajo-cerca-shell-icons-20261120-v3').has('./'));
  assert.ok(worker.calls.some(path => path.endsWith('icon-512.png')));
});

test('activation retains four previous revisions and unrelated caches', async () => {
  const worker = makeWorker();
  for (const name of [
    'trabajo-cerca-shell-icons-20261110-v1',
    'trabajo-cerca-shell-icons-20261111-v1',
    'trabajo-cerca-shell-icons-20261112-v1',
    'trabajo-cerca-shell-icons-20261113-v1',
    'trabajo-cerca-shell-icons-20261114-v1',
    'trabajo-cerca-shell-icons-20261120-v2',
    'trabajo-cerca-share-v1',
    'unrelated-app-cache',
  ]) worker.stores.set(name, new Map());
  let wait;
  worker.handlers.get('activate')({
    waitUntil(promise) { wait = promise; },
  });
  await wait;
  assert.ok(worker.stores.has('trabajo-cerca-shell-icons-20261120-v2'));
  assert.ok(worker.stores.has('trabajo-cerca-shell-icons-20261114-v1'));
  assert.ok(worker.stores.has('trabajo-cerca-shell-icons-20261113-v1'));
  assert.ok(worker.stores.has('trabajo-cerca-shell-icons-20261112-v1'));
  assert.ok(!worker.stores.has('trabajo-cerca-shell-icons-20261111-v1'));
  assert.ok(!worker.stores.has('trabajo-cerca-shell-icons-20261110-v1'));
  assert.ok(worker.stores.has('trabajo-cerca-share-v1'));
  assert.ok(worker.stores.has('unrelated-app-cache'));
});

test('older cached lazy module is served without downloading an obsolete chunk', async () => {
  const worker = makeWorker();
  const url = 'https://trabajo-cerca.test/assets/old-module-1234.js';
  worker.stores.set('trabajo-cerca-shell-icons-20261120-v2',
    new Map([[url, new Response('cached previous module')]]));
  let responsePromise;
  const background = [];
  worker.handlers.get('fetch')({
    request: new Request(url),
    respondWith(promise) { responsePromise = promise; },
    waitUntil(promise) { background.push(promise); },
  });
  assert.ok(responsePromise);
  assert.equal(await (await responsePromise).text(), 'cached previous module');
  assert.equal(worker.calls.filter(item => item === url).length, 0);
  await Promise.all(background);
});

test('administrator API is network-only and cannot leak into shared cache', async () => {
  const worker = makeWorker();
  const url = 'https://trabajo-cerca.test/api/admin/session';
  let responsePromise;
  worker.handlers.get('fetch')({
    request: new Request(url),
    respondWith(promise) { responsePromise = promise; },
  });
  assert.ok(responsePromise);
  await responsePromise;
  assert.equal(worker.calls.filter(item => item === url).length, 1);
  assert.ok(!Array.from(worker.stores.values())
    .some(bucket => bucket.has(url)));
});
