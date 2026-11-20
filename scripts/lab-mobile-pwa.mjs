/**
 * Real LAB mobile UI checks on headless Chromium/Android-sized viewport.
 * In the update test we replace only the browser's ServiceWorkerContainer
 * with a local fake to exercise the on-screen opt-in control safely.
 * No production calls, credentials, new posts or cache erasure.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = 'https://trabajo-cerca-lab-aislado-xirg9w.v2.appdeploy.ai/';
assert.match(BASE, /^https:\/\/trabajo-cerca-lab-aislado-[^/]+\.v2\.appdeploy\.ai\/$/);
const browser = await chromium.launch({ headless: true });
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('PASS', name);
  } catch (err) {
    results.push({ name, ok: false });
    console.error('FAIL', name, err instanceof Error ? err.message : String(err));
  }
}

const mobile = () => browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  locale: 'es-CL', serviceWorkers: 'allow',
});
await check('Mobile LAB shell and geographic controls', async () => {
  const ctx = await mobile(), page = await ctx.newPage();
  try {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByText('LAB · PRUEBAS', { exact: true }).first()
      .waitFor({ timeout: 20000 });
    await page.getByText('LAB · Ofertas públicas reales', { exact: true })
      .waitFor({ timeout: 20000 });
    const filter = page.locator('.communePicker select');
    assert.ok(await filter.count() > 0, 'missing mobile commune selector');
    const options = await filter.first().locator('option').allTextContents();
    assert.ok(options.some(v => /Nacimiento/i.test(v)));
    assert.ok(options.some(v => /Collipulli/i.test(v)));
    await filter.first().selectOption({ label: 'Nacimiento' });
    assert.match(await filter.first().inputValue(), /Nacimiento/);
    assert.equal(errors.length, 0, errors.join('; '));
  } finally { await ctx.close(); }
});
await check('PWA identity, PNG icon dimensions, and active service worker', async () => {
  const ctx = await mobile(), page = await ctx.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    const pwa = await page.evaluate(async () => {
      const manifestUrl = document.querySelector('link[rel="manifest"]')?.href;
      if (!manifestUrl) throw Error('No linked manifest');
      const m = await (await fetch(manifestUrl, { cache: 'no-store' })).json();
      const icons = await Promise.all(m.icons.map(async icon => {
        const url = new URL(icon.src, manifestUrl).toString();
        const res = await fetch(url, { cache: 'no-store' });
        const blob = await res.blob();
        if (!res.ok || blob.type !== 'image/png') {
          return { url, status: res.status, type: blob.type, valid: false };
        }
        const bitmap = await createImageBitmap(blob);
        const data = { status: res.status, type: blob.type,
          width: bitmap.width, height: bitmap.height, valid: true,
          purpose: icon.purpose };
        bitmap.close(); return data;
      }));
      const reg = await navigator.serviceWorker.ready;
      return { shortName: m.short_name, id: m.id, display: m.display,
        registeredScope: reg.scope, icons };
    });
    assert.equal(pwa.shortName, 'TC LAB');
    assert.equal(pwa.id, './lab-qa');
    assert.equal(pwa.display, 'standalone');
    assert.equal(pwa.icons.length, 3);
    for (const icon of pwa.icons) {
      assert.ok(icon.valid, JSON.stringify(icon));
      assert.ok([192,512].includes(icon.width));
      assert.equal(icon.width, icon.height);
    }
    assert.ok(pwa.registeredScope.startsWith(BASE));
  } finally { await ctx.close(); }
});
await check('PWA postpones update and retains draft', async () => {
  const ctx = await mobile();
  await ctx.addInitScript(() => {
    window.__labSWMessages = [];
    const listeners = new EventTarget();
    const registration = {
      waiting: { postMessage: x => window.__labSWMessages.push(x) },
      installing: null,
      addEventListener: listeners.addEventListener.bind(listeners),
      removeEventListener: listeners.removeEventListener.bind(listeners),
      update: async () => {},
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: {},
        getRegistration: async () => registration,
        register: async () => registration,
        addEventListener: listeners.addEventListener.bind(listeners),
        removeEventListener: listeners.removeEventListener.bind(listeners),
      },
    });
  });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const prompt = page.getByText('Actualización disponible', { exact: true });
    await prompt.waitFor({ timeout: 15000 });
    await page.evaluate(() => {
      const form = document.createElement('form');
      form.id = 'tc-lab-test-draft';
      const input = document.createElement('input');
      input.name = 'message';
      form.appendChild(input);
      document.body.appendChild(form);
      input.value = 'Texto de prueba sin enviar';
      // Reflect React-controlled input behavior where a rerender can update
      // defaultValue, so currentValue !== defaultValue is not a safe guard.
      input.defaultValue = input.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Más tarde' }).click();
    assert.equal(await prompt.count(), 0);
    const state = await page.evaluate(() => ({
      draft: document.querySelector('#tc-lab-test-draft input')?.value,
      messages: window.__labSWMessages.length,
    }));
    assert.equal(state.draft, 'Texto de prueba sin enviar');
    assert.equal(state.messages, 0);
  } finally { await ctx.close(); }
});
await check('PWA update requires discard confirmation even for controlled input', async () => {
  const ctx = await mobile();
  await ctx.addInitScript(() => {
    window.__labSWMessages = [];
    const events = new EventTarget();
    const registration = {
      waiting: { postMessage: x => window.__labSWMessages.push(x) },
      installing: null,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      update: async () => {},
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true,
      value: { controller: {}, getRegistration: async () => registration,
        register: async () => registration,
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events) } });
    window.__labConfirmCalls = 0;
    window.confirm = () => { window.__labConfirmCalls++; return false; };
  });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByText('Actualización disponible', { exact: true })
      .waitFor({ timeout: 15000 });
    await page.evaluate(() => {
      const form = document.createElement('form');
      form.id = 'tc-lab-test-dirty';
      const input = document.createElement('input');
      input.type = 'text';
      form.appendChild(input);
      document.body.appendChild(form);
      input.value = 'Borrador sin enviar';
      input.defaultValue = 'Borrador sin enviar';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    const result = await page.evaluate(() => ({
      confirms: window.__labConfirmCalls,
      posted: window.__labSWMessages.length,
      draft: document.querySelector('#tc-lab-test-dirty input')?.value,
    }));
    assert.equal(result.confirms, 1, 'must warn before discarding a touched form');
    assert.equal(result.posted, 0, 'must not advance service worker if user declines');
    assert.equal(result.draft, 'Borrador sin enviar');
  } finally { await ctx.close(); }
});
await browser.close();
console.log('LAB_MOBILE_PWA', JSON.stringify({
  passed: results.filter(x => x.ok).length,
  failed: results.filter(x => !x.ok).length,
  realAndroidVerified: false,
  environment: 'Chromium emulated mobile + isolated LAB',
  results,
}));
if (results.some(x => !x.ok)) process.exitCode = 1;
