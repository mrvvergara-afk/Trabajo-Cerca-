import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  resolve: { alias: { '@appdeploy/client': fileURLToPath(new URL('./backup-client.mjs', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 4189, strictPort: true },
});
await server.listen();
let browser;
const passphrase = 'clave-sintetica-de-qa';
const target = 'http://127.0.0.1:4189/tests/browser/backup.html';

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 375, height: 880 }, acceptDownloads: true });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  assert.equal((await page.goto(target)).status(), 200);
  return page;
}

async function download(page, name) {
  const [saved] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).click()]);
  assert.equal(await saved.failure(), null);
  return saved;
}

async function tempStoreCount(page) {
  return page.evaluate(async () => (await indexedDB.databases()).filter(db => db.name?.startsWith('tc-restore-rehearsal-')).length);
}

try {
  browser = await chromium.launch({
    executablePath: process.env.TC_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const source = await newPage();
  await source.getByLabel('Contraseña del respaldo').fill(passphrase);
  await source.getByLabel('Repetir contraseña').fill(passphrase);
  await source.getByRole('button', { name: 'Crear copia cifrada' }).click();
  const partial = await download(source, 'Descargar copia parcial');
  const partialPath = await partial.path();
  assert.match(partial.suggestedFilename(), /PARCIAL/);
  await source.getByLabel('Comprobar una copia').setInputFiles(partialPath);
  await source.getByText(/No se pudo validar/).waitFor();
  await source.getByRole('button', { name: 'Reanudar copia' }).click();
  const full = await download(source, 'Descargar copia cifrada');
  const fullPath = await full.path();
  const envelope = await readFile(fullPath, 'utf8');
  assert.doesNotMatch(envelope, /contenido-privado-sintetico|same-logical-id|foto-qa|clave-sintetica/);
  const calls = await source.evaluate(() => window.tcBackupReads);
  const tables = calls.filter(call => call.kind === 'table');
  assert.deepEqual(tables.slice(0, 3).map(call => call.cursor), [null, 'second', 'second']);
  assert.equal(calls.filter(call => call.kind === 'scope').length, 1);
  assert.equal(await tempStoreCount(source), 0);

  const destination = await newPage();
  await destination.getByLabel('Contraseña del respaldo').fill('clave-incorrecta-qa');
  await destination.getByLabel('Copia para la prueba').setInputFiles(fullPath);
  await destination.getByRole('button', { name: 'Probar recuperación local' }).click();
  await destination.getByText(/La prueba local no se completó/).waitFor();
  assert.equal(await tempStoreCount(destination), 0);
  await destination.getByLabel('Contraseña del respaldo').fill(passphrase);
  await destination.getByRole('button', { name: 'Probar recuperación local' }).click();
  await destination.getByText(/Prueba local aprobada: 6 tablas lógicas, 7 registros, 1 archivos y 0 diferencias/).waitFor();
  assert.equal(await tempStoreCount(destination), 0);
  assert.deepEqual(await destination.evaluate(() => window.tcBackupReads ?? []), []);
  const report = JSON.parse(await readFile(await (await download(destination, 'Descargar informe de prueba')).path(), 'utf8'));
  assert.equal(report.comparedElements, 8);
  assert.equal(report.temporaryStoreDeleted, true);
  assert.equal(report.platformRestoreTested, false);
  console.log(JSON.stringify({
    tables: report.tables, records: report.records, files: report.files, mismatches: report.mismatches,
    resumeFromCursor: true, partialRejected: true, wrongPasswordRejected: true, independentBrowserContext: true,
    usedIndexedDB: true, temporaryStoreDeleted: true, restoreNetworkRequests: report.networkRequests,
    productionWrites: report.productionWrites, platformRestoreTested: report.platformRestoreTested,
  }));
} finally {
  await browser?.close();
  await server.close();
}
