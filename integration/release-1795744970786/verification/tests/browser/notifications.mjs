import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({
  resolve: { alias: { '@appdeploy/client': fileURLToPath(new URL('./notification-client.mjs', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 4190, strictPort: true },
});
await server.listen();
let browser;

try {
  browser = await chromium.launch({
    executablePath: process.env.TC_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 375, height: 900 }, serviceWorkers: 'block' });
  await page.clock.install({ time: new Date('2026-11-27T23:00:00Z') });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  assert.equal((await page.goto('http://127.0.0.1:4190/')).status(), 200);
  await page.getByLabel('Abrir menú de Trabajo Cerca').click({ timeout: 8000 });
  await page.locator('.tcSiteMenuPanel').getByRole('button', { name: /Configurar avisos/i }).click({ timeout: 8000 });
  await page.getByRole('button', { name: 'Notificaciones automáticas (opcional)' }).click();
  const panel = page.getByRole('dialog', { name: 'Notificaciones automáticas' });
  const start = panel.getByRole('button', { name: 'Probar envío' });
  const accepted = panel.getByText(/Proveedor aceptó/);
  const received = panel.getByText(/Prueba push recibida/);
  const unconfirmed = panel.getByText(/Este dispositivo no confirmó la recepción/);
  const waiting = panel.getByText(/Esperando confirmación de este dispositivo/);
  const deliver = testId => page.evaluate(id => {
    window.tcDeliverPush({ data: { kind: 'notification_test', testId: id } });
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, testId);

  await start.click();
  await accepted.waitFor();
  await deliver('ae44a53a-fcc9-4bed-89ad-acecb7657dd4');
  assert.equal(await received.count(), 0, 'Un envío ajeno se marcó como recibido');
  await waiting.waitFor({ timeout: 4000 });
  const id = await page.evaluate(() => window.tcTestId);
  assert.match(id, /^[a-f0-9-]{36}$/);
  await page.clock.fastForward('00:00:31');
  await unconfirmed.waitFor({ timeout: 4000 });

  await deliver(id);
  await received.waitFor({ timeout: 4000 });
  assert.equal(await unconfirmed.count(), 0);

  await start.click();
  await accepted.waitFor();
  const nextId = await page.evaluate(() => window.tcTestId);
  assert.notEqual(nextId, id);
  await deliver(id);
  assert.equal(await received.count(), 0, 'Una prueba previa confirmó el nuevo envío');
  await deliver(nextId);
  await received.waitFor({ timeout: 4000 });

  await page.evaluate(() => { window.tcTestMode = 'early'; });
  await start.click();
  await accepted.waitFor();
  await received.waitFor({ timeout: 4000 });
  assert.equal(await waiting.count(), 0);

  await page.evaluate(() => { window.tcTestMode = 'rejected'; });
  await start.click();
  await panel.getByRole('alert').getByText(/El servicio no aceptó el envío/).waitFor();
  assert.equal(await received.count(), 0);
  assert.equal(await waiting.count(), 0);
  console.log(JSON.stringify({
    scope: 'local_chromium_simulated_notification_sdk', acceptedDistinctFromReceived: true,
    unrelatedReceiptIgnored: true, oldReceiptIgnored: true, timeoutReported: true, lateReceiptRecognized: true,
    receiptBeforeProviderResponseRecognized: true, providerRejectionReported: true, realPhoneDeliveryVerified: false,
  }));
} finally {
  await browser?.close();
  await server.close();
}
