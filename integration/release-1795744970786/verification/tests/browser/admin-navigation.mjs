import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build, preview } from 'vite';

const outDir = await mkdtemp(join(tmpdir(), 'tc-admin-'));
let server;
let browser;
const widths = [320, 375, 430, 1440];
const labels = ['Inicio', 'Empleos', 'Rescate', 'Motores', 'Fuentes', 'Solicitudes', 'Publicidad',
  'Negocios y servicios', 'Respaldo', 'Importación y datos'];

async function openPage(width, path = '/admin', session = 'granted') {
  const page = await browser.newPage({ viewport: { width, height: 880 }, serviceWorkers: 'block' });
  await page.addInitScript(value => { window.tcAdminFixture = { session: value }; }, session);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const response = await page.goto('http://127.0.0.1:4192' + path);
  assert.equal(response.status(), 200);
  return page;
}

try {
  await build({
    resolve: { alias: { '@appdeploy/client': fileURLToPath(new URL('./admin-session-client.mjs', import.meta.url)) } },
    build: { outDir },
  });
  server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 4192, strictPort: true } });
  browser = await chromium.launch({
    executablePath: process.env.TC_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  for (const width of widths) {
    const page = await openPage(width);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const nav = page.getByRole('navigation', { name: 'Secciones administrativas' });
    const button = name => nav.getByRole('button', { name, exact: true });
    const landing = page.getByRole('region', { name: 'Resumen ejecutivo' });
    await landing.waitFor();
    assert.deepEqual(await nav.getByRole('button').allTextContents(), labels);
    assert.equal(await landing.getByRole('button').count(), 0);
    assert.equal(await landing.locator('dt').count(), 4);
    const tiles = await nav.getByRole('button').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { height: rect.height, left: rect.left, right: rect.right };
    }));
    assert.ok(tiles.every(tile => tile.height >= 44 && tile.left >= 0 && tile.right <= width));
    if (process.env.TC_ADMIN_SCREENSHOTS && width === 320) {
      await page.screenshot({ path: join(process.env.TC_ADMIN_SCREENSHOTS, 'inicio.png') });
    }

    const visit = async (module, title) => {
      await button(module).click();
      await title.waitFor();
      assert.equal(await button(module).getAttribute('aria-current'), 'page');
      assert.equal(await nav.locator('[aria-current="page"]').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    };

    await visit('Empleos', page.getByRole('heading', { name: 'Revisión de avisos detectados' }));
    assert.equal(await page.getByRole('button', { name: /Rescate y conciliación de ofertas/ }).count(), 0);
    await page.getByRole('button', { name: 'Catálogo público', exact: true }).click();
    await page.getByRole('heading', { name: 'Inventario y trazabilidad del catálogo' }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Bandeja laboral privada' }).count(), 0);
    await visit('Rescate', page.getByRole('region', { name: 'Conciliación de ofertas internas' }));
    await visit('Motores', page.getByRole('heading', { name: 'Motores de rastreo' }));
    await page.getByRole('button', { name: 'Ver detalle de Motor C' }).click();
    await page.getByRole('dialog', { name: 'Detalle de Motor C' }).waitFor();
    await page.getByRole('button', { name: 'Cerrar detalle' }).click();
    assert.equal(await page.getByText('Registros individuales B y C', { exact: true }).count(), 0);
    assert.ok(!(await page.evaluate(() => window.tcAdminReads)).includes('/api/admin/territorial-coverage'));

    await visit('Fuentes', page.getByRole('rowheader', { name: 'Municipalidad de Angol' }));
    assert.equal((await page.evaluate(() => window.tcAdminReads)).filter(path => path === '/api/admin/territorial-coverage').length, 1);
    await page.getByText('Cobertura de las 12 comunas', { exact: true }).click();
    await page.getByRole('rowheader', { name: 'Angol', exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.tcAdminReads)).filter(path => path === '/api/admin/territorial-coverage').length, 1);
    assert.equal(await page.locator('.tcSourceCoverage thead th').first().evaluate(node => getComputedStyle(node).position), 'sticky');

    await visit('Solicitudes', page.getByRole('region', { name: 'Solicitudes publicitarias privadas' }));
    await visit('Publicidad', page.getByRole('region', { name: 'Gestión de campañas comerciales' }));
    assert.ok(!(await page.evaluate(() => window.tcAdminReads)).includes('/api/admin/marketing/house'));
    await page.getByRole('button', { name: 'Campañas propias', exact: true }).click();
    await page.getByRole('heading', { name: 'Campañas propias y promoción' }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Gestión de campañas comerciales' }).count(), 0);
    await visit('Negocios y servicios', page.getByRole('region', { name: 'Moderación de servicios y negocios' }));
    assert.equal(await page.getByRole('link', { name: 'Abrir bandeja de moderación' }).count(), 0);
    await visit('Respaldo', page.getByRole('region', { name: 'Respaldo cifrado' }));
    await visit('Importación y datos', page.getByRole('heading', { name: 'Conector directo ChatGPT' }));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, moduleLinks: labels.length, duplicateHomeLinks: 0,
      confirmedDirectModules: ['Rescate', 'Motores', 'Fuentes', 'Solicitudes', 'Publicidad', 'Moderación', 'Respaldo', 'Importación'], territorialRequests: 1 }));
    await page.close();
  }

  const deepLink = await openPage(375, '/admin?seccion=moderacion');
  await deepLink.getByRole('region', { name: 'Moderación de servicios y negocios' }).waitFor();
  await deepLink.close();
  const guest = await openPage(375, '/admin?seccion=moderacion', 'forbidden');
  await guest.getByText('Esta cuenta no tiene acceso administrativo.').waitFor();
  assert.equal(await guest.getByRole('region', { name: 'Moderación de servicios y negocios' }).count(), 0);
  assert.ok(!(await guest.evaluate(() => window.tcAdminReads)).includes('/api/admin/local-directory'));
  console.log(JSON.stringify({ legacyModerationLink: true, moderationBehindSession: true }));
} finally {
  await browser?.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  await rm(outDir, { recursive: true, force: true });
}
