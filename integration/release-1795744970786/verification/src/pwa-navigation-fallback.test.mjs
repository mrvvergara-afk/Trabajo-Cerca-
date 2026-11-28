import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function localWorker(status, hasCachedHome = true) {
  const listeners = new Map();
  const origin = 'http://127.0.0.1:4193';
  let writes = 0;
  const cachedHome = path => path === './' && hasCachedHome
    ? new Response('Versión anterior disponible', { headers: { 'Content-Type': 'text/html' } }) : undefined;
  const cache = { match: async path => cachedHome(path), put: async () => { writes++; } };
  runInNewContext(worker, {
    self: { location: { origin }, registration: { scope: origin + '/' },
      addEventListener: (name, callback) => listeners.set(name, callback) },
    URL, Request, Response, Date,
    fetch: async () => new Response('Respuesta del servidor', { status }),
    caches: { open: async () => cache, match: async () => undefined },
  });
  return {
    read(path) {
      let response;
      listeners.get('fetch')({
        request: { url: origin + path, mode: 'navigate', method: 'GET' },
        respondWith(value) { response = value; },
      });
      return response;
    },
    writes: () => writes,
  };
}

test('the installed PWA reuses its cached home when the server returns 503', async () => {
  const client = localWorker(503);
  const response = await client.read('/');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'Versión anterior disponible');
  assert.equal(client.writes(), 0);
});

test('the cache fallback preserves API errors and access denials', async () => {
  assert.equal((await localWorker(503).read('/api/listings')).status, 503);
  assert.equal((await localWorker(503, false).read('/')).status, 503);
  assert.equal((await localWorker(401).read('/admin')).status, 401);
});
