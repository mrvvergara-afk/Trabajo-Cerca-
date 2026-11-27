import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const resolve = { alias: { '@appdeploy/client': fileURLToPath(new URL('./experience-client.mjs', import.meta.url)) } };
const server = await createServer({ resolve, server: { host: '127.0.0.1', port: 4187, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.TC_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  for (const width of [320, 375, 430, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const response = await page.goto('http://127.0.0.1:4187/');
    assert.equal(response.status(), 200);
    const count = page.locator('.tcHomeVerifiedCount');
    await count.locator('strong').waitFor({ timeout: 8000 });
    assert.equal((await count.innerText()).trim(), '2 ofertas en las 12 comunas');
    if (width < 600) {
      const selector = page.locator('.tcMobilePlace select');
      for (const commune of ['Angol', 'Collipulli']) {
        await selector.selectOption(commune);
        assert.equal((await count.innerText()).trim(), '1 ofertas en ' + commune);
      }
    }
    await page.getByLabel('Abrir menú de Trabajo Cerca').click();
    const siteMenu = page.locator('.tcSiteMenuPanel');
    await siteMenu.waitFor();
    assert.doesNotMatch(await siteMenu.innerText(), /administraci[oó]n/i);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    console.log('Catálogo y navegación pública: ' + width + ' px OK');
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
