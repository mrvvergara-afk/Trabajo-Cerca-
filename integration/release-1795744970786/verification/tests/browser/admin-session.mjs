import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  resolve: { alias: { '@appdeploy/client': fileURLToPath(new URL('./admin-session-client.mjs', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 4191, strictPort: true },
});
await server.listen();
let browser;

async function openPage(session = 'granted') {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 }, serviceWorkers: 'block' });
  await page.addInitScript(value => { window.tcAdminFixture = { session: value }; }, session);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  assert.equal((await page.goto('http://127.0.0.1:4191/admin')).status(), 200);
  return page;
}
const status = value => page => page.getByText(value, { exact: true });
const authorized = status('Sesión autorizada');
const restricted = status('Acceso restringido');
const motors = page => page.getByRole('navigation', { name: 'Secciones administrativas' }).getByRole('button', { name: 'Motores' });

try {
  browser = await chromium.launch({
    executablePath: process.env.TC_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await openPage();
  await authorized(page).waitFor({ timeout: 8000 });
  await motors(page).click();
  const panel = page.getByRole('region', { name: 'Centro de Control de Trabajo Cerca' });
  await panel.getByText('Ver detalle ›').first().waitFor();

  await page.evaluate(() => {
    window.tcAdminFixture.session = 'expired';
    window.dispatchEvent(new Event('focus'));
  });
  await restricted(page).waitFor({ timeout: 4000 });
  assert.equal(await panel.count(), 0);
  await page.getByText('Inicia sesión con la cuenta administradora autorizada.').waitFor();
  await page.evaluate(() => { window.tcAdminFixture.session = 'granted'; });
  await page.getByRole('button', { name: 'Verificar acceso' }).click();
  await authorized(page).waitFor();
  await page.getByRole('heading', { name: 'Resumen', exact: true }).waitFor();

  await motors(page).click();
  await page.getByRole('button', { name: 'Actualizar tablero' }).waitFor();
  await page.evaluate(() => {
    window.tcAdminFixture.delaySession = true;
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForFunction(() => Boolean(window.tcReleaseAdminCheck), undefined, { timeout: 4000 });
  await page.evaluate(() => { window.tcAdminFixture.telemetryDenial = 403; });
  await page.getByRole('button', { name: 'Actualizar tablero' }).click();
  await restricted(page).waitFor({ timeout: 4000 });
  assert.equal(await panel.count(), 0);
  await page.evaluate(async () => {
    window.tcReleaseAdminCheck();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await authorized(page).count(), 0);
  await page.getByText('Esta cuenta no tiene acceso administrativo.').waitFor();

  const temporary = await openPage();
  await authorized(temporary).waitFor();
  await temporary.getByRole('button', { name: 'Respaldo' }).click();
  const pass = temporary.getByLabel('Contraseña del respaldo');
  await pass.fill('clave-de-prueba-local');
  await temporary.getByLabel('Repetir contraseña').fill('clave-de-prueba-local');
  await temporary.getByRole('button', { name: 'Crear copia cifrada' }).click();
  const resume = temporary.getByRole('button', { name: 'Reanudar copia' });
  await resume.waitFor();
  await temporary.evaluate(async () => {
    window.tcAdminFixture.session = 'unavailable';
    window.dispatchEvent(new Event('focus'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await pass.inputValue(), 'clave-de-prueba-local');
  assert.equal(await authorized(temporary).count(), 1);
  await resume.click();
  await temporary.getByText(/Copia cifrada comprobada: 6 tablas, 7 registros y 1 archivos/).waitFor();

  const denied = await openPage('forbidden');
  await denied.getByText('Esta cuenta no tiene acceso administrativo.').waitFor({ timeout: 4000 });
  assert.equal(await motors(denied).count(), 0);
  console.log(JSON.stringify({
    scope: 'local_chromium_simulated_auth_provider', normalAdminRoute: true,
    unauthorizedAccountDenied: true, expiredSessionClosesWorkspace: true,
    protectedReportDenialClosesWorkspace: true, delayedGrantCannotRestoreAccess: true,
    manualReverificationRestoresAccess: true, temporaryReadErrorPreservesBackupWork: true,
    liveAppDeploySessionVerified: false,
  }));
} finally {
  await browser?.close();
  await server.close();
}
