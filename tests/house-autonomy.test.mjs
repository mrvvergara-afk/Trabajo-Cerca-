import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

const bankUrl = new URL('../marketing/bank/', import.meta.url);
const bank = readFileSync(new URL('index.json', bankUrl));
const archives = new Map();
const unavailable = new Set();
const media = new Map();
let source = bank;

const tables = new Map();
function table(name) {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
}
function lazy(run) {
  return { run, then(resolve, reject) { return Promise.resolve().then(() => run(false)).then(resolve, reject); } };
}
function conflict() {
  return Object.assign(new Error('conflict'), { code: 'AppDatabaseConditionFailed' });
}
const mock = {
  db: {
    async get(name, ids) { return ids.map(id => structuredClone(table(name).get(id) ?? null)); },
    tx: {
      add(name, rows) {
        return lazy(strict => rows.map(row => {
          if (table(name).has(row.id)) {
            if (strict) throw conflict();
            return null;
          }
          table(name).set(row.id, structuredClone(row));
          return row.id;
        }));
      },
      update(name, rows) {
        return lazy(strict => rows.map(row => {
          const old = table(name).get(row.id);
          if (!old || Object.entries(row.if || {}).some(([field, expected]) => old[field] !== expected)) {
            if (strict) throw conflict();
            return false;
          }
          table(name).set(row.id, structuredClone({ ...old, ...row.record }));
          return true;
        }));
      },
    },
    async transact(operations) {
      const backup = structuredClone(tables);
      try { return operations.map(operation => operation.run(true)); }
      catch (cause) {
        tables.clear();
        for (const [key, value] of backup) tables.set(key, value);
        throw cause;
      }
    },
  },
  storage: {
    async read(paths) { return paths.map(path => ({ path, content: media.get(path) || null })); },
    async write(rows) { return rows.map(row => { media.set(row.path, row.content); return true; }); },
    async url(paths) { return paths.map(path => ({ path, url: 'https://bucket.s3.amazonaws.com/' + path })); },
  },
  increment(amount) { return amount; },
  error(message, statusCode) { return { statusCode, headers: {}, body: JSON.stringify({ message }) }; },
  json(body, statusCode = 200) { return { statusCode, headers: {}, body: JSON.stringify(body) }; },
  isAppDatabaseError(e) { return Boolean(e?.code); },
};
globalThis.houseAutonomyTestSdk = mock;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@appdeploy/sdk') {
      return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(
        'export const { db, storage, error, increment, json, isAppDatabaseError } = globalThis.houseAutonomyTestSdk;',
      ) };
    }
    if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', context);
    return next(specifier, context);
  },
});
globalThis.fetch = async url => {
  assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/mrvvergara-afk\/Trabajo-Cerca-\/refs\/heads\//);
  const name = url.split('/').pop();
  if (name === 'index.json') return new Response(source);
  if (url.includes('/archive/')) {
    const payload = archives.get(name);
    return payload ? Response.json(payload) : new Response('', { status: 404 });
  }
  if (unavailable.has(name)) return new Response('', { status: 503 });
  return new Response(readFileSync(new URL(name, bankUrl)));
};
const {
  refreshInstitutional, institutionalArchiveQueue, institutionalMedia, verifyWebp,
} = await import('../backend/house-autonomy.ts');
const { editorialPeriod, editorialPlan, validateBank, validatePublicManifest } =
  await import('../shared/house-autonomy.ts');
const readCurrent = () => table('growth_house_autonomy').get('current');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('el banco tiene seis objetivos y los derivados cumplen sus huellas y presupuesto', () => {
  const assets = validateBank(JSON.parse(bank));
  assert.equal(assets.length, 12);
  for (const asset of assets) {
    const web = readFileSync(new URL(asset.web.sha256 + '.webp', bankUrl));
    const social = readFileSync(new URL(asset.social.sha256 + '.jpg', bankUrl));
    verifyWebp(web, asset.web);
    assert.equal(digest(social), asset.social.sha256);
    assert.ok(social.length <= 200000);
    assert.throws(() => verifyWebp(web.subarray(0, -2), asset.web));
  }
  const damaged = JSON.parse(bank);
  damaged.assets[0].rights = 'desconocido';
  assert.throws(() => validateBank(damaged));
});

test('el calendario editorial usa medianoche en Chile y rota territorio y objetivo', () => {
  assert.equal(editorialPeriod(new Date('2026-11-30T02:59:00Z')).period, '2026-11-23');
  assert.equal(editorialPeriod(new Date('2026-11-30T03:01:00Z')).period, '2026-11-30');
  const assets = validateBank(JSON.parse(bank));
  const first = editorialPlan(assets, new Date('2026-11-26T13:00:00Z'));
  const second = editorialPlan(assets, new Date('2026-12-03T13:00:00Z'));
  assert.equal(first.slides.length, 6);
  assert.notEqual(first.territory, second.territory);
  assert.notEqual(first.campaign.slot, second.campaign.slot);
  assert.equal(first.season, 'primavera');
  assert.equal(second.season, 'verano');
});

test('dos ejecuciones concurrentes publican una versión y un respaldo', async () => {
  const now = Date.parse('2026-11-26T13:00:00Z');
  const results = await Promise.all(Array.from({ length: 10 }, () => refreshInstitutional(true, now)));
  assert.equal(results.filter(x => x === 'comprobado').length, 1);
  const active = readCurrent();
  assert.ok(validatePublicManifest(active.active.manifest));
  assert.equal(active.pending.length, 1);
  assert.equal(table('growth_house_versions').size, 1);
  assert.equal(media.size, 6);
  assert.equal((await institutionalMedia({ params: { hash: 'https://otro.dominio/archivo' } })).statusCode, 404);
  const queue = JSON.parse((await institutionalArchiveQueue()).body);
  assert.equal(queue.releases.length, 1);
  assert.equal(queue.releases[0].id, active.active.manifest.revision);
});

test('el respaldo queda en cola tras fallo y se confirma desde GitHub sin duplicados', async () => {
  const now = Date.parse('2026-11-26T14:00:00Z');
  await refreshInstitutional(true, now);
  const item = readCurrent().pending[0];
  assert.equal(item.attempts, 1);
  assert.ok(item.nextAt > now);
  const release = readCurrent().active;
  // GitHub format and key order can differ from the database.
  archives.set(item.id + '.json', Object.fromEntries(Object.entries(release).reverse()));
  await refreshInstitutional(true, item.nextAt + 1);
  assert.deepEqual(readCurrent().pending, []);
  assert.equal(table('growth_house_versions').size, 1);
});

test('un banco defectuoso conserva la edición y una pérdida de medios recupera la anterior', async () => {
  const original = readCurrent().active;
  source = Buffer.from('{"schema":1,"assets":[]}');
  await refreshInstitutional(true, Date.parse('2026-11-27T13:00:00Z'));
  assert.equal(readCurrent().exception, 'banco_no_verificado');
  assert.equal(readCurrent().active.manifest.revision, original.manifest.revision);
  source = bank;
  const later = Date.parse('2026-12-03T13:00:00Z');
  await refreshInstitutional(true, later);
  assert.notEqual(readCurrent().active.manifest.revision, original.manifest.revision);
  const difference = readCurrent().active.media.find(m => !original.media.some(v => v.sha256 === m.sha256));
  assert.ok(difference);
  const file = difference.sha256 + '.webp';
  media.delete('institutional-bank/' + file);
  unavailable.add(file);
  await refreshInstitutional(true, later + 60_000);
  assert.equal(readCurrent().active.manifest.revision, original.manifest.revision);
  assert.equal(readCurrent().exception, 'banco_no_verificado');
  unavailable.clear();
  await refreshInstitutional(true, later + 120_000);
  assert.equal(readCurrent().active.manifest.period, '2026-11-30');
  assert.equal(table('growth_house_versions').size, 2);
  const malformed = structuredClone(readCurrent().active.manifest);
  malformed.slides[0].imageUrl = 'https://otro.dominio/imagen.webp';
  assert.equal(validatePublicManifest(malformed), null);
  assert.equal(tables.has('growth_campaigns'), false);
});

test('carrusel propio y operación comercial conservan los espacios contratados', async () => {
  const { allocateAdvertising, HOUSE_DEFAULTS } = await import('../shared/house-ads.ts');
  const thirdParty = {
    id: 'comercio-local-prueba', businessName: 'Taller de prueba', headline: 'Atención local',
    detail: 'Sucursal de prueba', communes: ['Todas'], category: 'servicios',
    status: 'active', startAt: '2026-11-01T00:00:00Z', endAt: '2026-12-15T00:00:00Z',
    priority: 3, placements: ['search'], pages: ['home'], adType: 'COMMERCIAL_PAID',
  };
  const input = {
    house: HOUSE_DEFAULTS, commercial: [thirdParty], complete: true, place: 'Angol',
    page: 'home', now: Date.parse('2026-11-26T13:00:00Z'), turn: 7, seen: {},
    completed: [], slots: ['search', 'listing'],
  };
  const result = allocateAdvertising(input);
  assert.deepEqual(result.search, { type: 'COMMERCIAL', campaign: thirdParty });
  assert.equal(result.listing.type, 'HOUSE_AD');
  assert.equal(table('growth_house_versions').size, 2);
});

test('las métricas cifradas se validan con la clave y destino correctos', async () => {
  const { spawnSync } = await import('node:child_process');
  const { generateKeyPairSync } = await import('node:crypto');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { decryptMetricoolSnapshot } = await import('../backend/house-metricool.ts');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const tmp = mkdtempSync(tmpdir() + '/tc-metrics-');
  try {
    const bridge = tmp + '/bridge.json';
    const report = tmp + '/report.json';
    const data = { schema: 1, brandId: '7187503', from: '2026-11-01', to: '2026-11-26',
      networks: [
        { network: 'Facebook', reach: null, impressions: 0, clicks: null, views: null },
        { network: 'Instagram', reach: 2, impressions: null, clicks: null, views: 9 },
      ],
    };
    writeFileSync(bridge, JSON.stringify({ target: 'lab', analyticsPublicKey: publicKey }));
    writeFileSync(report, JSON.stringify(data));
    const sealed = spawnSync(process.execPath, ['marketing/seal-metricool.mjs', bridge, report], { encoding: 'utf8' });
    assert.equal(sealed.status, 0, sealed.stderr);
    const envelope = JSON.parse(sealed.stdout);
    assert.deepEqual(decryptMetricoolSnapshot(envelope, privateKey), data);
    assert.throws(() => decryptMetricoolSnapshot({ ...envelope, target: 'prod' }, privateKey));
    assert.throws(() => decryptMetricoolSnapshot({ ...envelope, tag: Buffer.alloc(16).toString('base64') }, privateKey));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
