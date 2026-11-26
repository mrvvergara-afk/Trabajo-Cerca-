import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium, request } from 'playwright';

const web = 'https://trabajo-cerca-lab-aislado-xirg9w.v2.appdeploy.ai';
const api = 'https://api-v2.appdeploy.ai/app/trabajo-cerca-lab-aislado-xirg9w';
const resource = '/api/growth/institutional';
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
const proxy = proxyUrl ? (() => {
  const url = new URL(proxyUrl);
  return { server: url.protocol + '//' + url.host,
    ...(url.username ? { username: decodeURIComponent(url.username), password: decodeURIComponent(url.password) } : {}) };
})() : undefined;
const testClient = await request.newContext({ timeout: 30_000, proxy });
const get = path => testClient.get(api + path);
if (!process.argv.includes('--ui-only')) {
const publicManifest = await get(resource);
assert.equal(publicManifest.status(), 200);
const { manifest } = await publicManifest.json();
assert.equal(manifest.slides.length, 6);
const parallel = await Promise.all(Array.from({ length: 4 }, () => get(resource)));
for (const response of parallel) {
  assert.equal(response.status(), 200);
  assert.equal((await response.json()).manifest.revision, manifest.revision);
}
const begin = performance.now();
const downloaded = await Promise.all(manifest.slides.map(async slide => {
  const response = await get(slide.imageUrl);
  assert.equal(response.status(), 200);
  assert.match(response.headers()['content-type'], /^image\/webp/);
  const data = await response.body();
  assert.equal(createHash('sha256').update(data).digest('hex'), slide.imageUrl.split('/').at(-1));
  assert.ok(data.length <= 200000);
  return data.length;
}));
assert.equal((await get(resource + '/media/' + 'a'.repeat(64))).status(), 404);
const privateRoute = '/api/admin/marketing/institutional';
assert.equal((await get(privateRoute)).status(), 401);
assert.equal((await testClient.post(api + privateRoute, { data: { action: 'restore', revision: manifest.revision } })).status(), 401);
console.log(JSON.stringify({ revision: manifest.revision, images: downloaded, mediaAndAuthMs: Math.round(performance.now() - begin) }));

}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'], proxy });
try {
  for (const width of process.argv.includes('--commercial-only') ? [] : [320, 360, 390, 430, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 850 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', cause => errors.push(cause.message));
    await page.goto(web, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const card = page.locator('aside[data-ad-type="HOUSE_AD"]').first();
    await card.scrollIntoViewIfNeeded({ timeout: 45_000 });
    const photo = card.locator('img[src*="/api/growth/institutional/media/"]');
    await photo.waitFor({ state: 'visible', timeout: 25_000 });
    await page.waitForFunction(() => {
      const first = document.querySelector('aside[data-ad-type="HOUSE_AD"] img[src*="/api/growth/institutional/media/"]');
      return first instanceof HTMLImageElement && first.complete && first.naturalWidth === 840;
    }, undefined, { timeout: 25_000 });
    const buttons = card.locator('.tcHouseGalleryControls button');
    assert.equal(await buttons.count(), 6);
    await buttons.nth(3).click();
    assert.equal(await buttons.nth(3).getAttribute('aria-pressed'), 'true');
    const bounds = await card.boundingBox();
    assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
    const fits = await card.evaluate(node => {
      const copy = node.querySelector('.tcCampaignCopy');
      return !copy || copy.scrollWidth <= copy.clientWidth + 1;
    });
    assert.ok(fits);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, cardWidth: Math.round(bounds.width), controls: 6, assetDecoded: true }));
    await ctx.close();
  }

  if (!process.argv.includes('--commercial-only')) {
  const context = await browser.newContext({ viewport: { width: 390, height: 850 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.route('**/api/growth/institutional/media/**', route => route.abort());
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 300, downloadThroughput: 85_000, uploadThroughput: 35_000,
  });
  await page.goto(web, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const card = page.locator('aside[data-ad-type="HOUSE_AD"]').first();
  await card.scrollIntoViewIfNeeded({ timeout: 45_000 });
  const art = card.locator('img.tcCampaignFallbackArt');
  await art.waitFor({ timeout: 25000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('aside[data-ad-type="HOUSE_AD"] img.tcCampaignFallbackArt');
    return img instanceof HTMLImageElement && img.naturalWidth > 0;
  }, undefined, { timeout: 25_000 });
  assert.equal(await card.locator('.tcHouseGalleryControls button').count(), 6);
  await context.close();
  console.log(JSON.stringify({ slowNetwork: true, failedImage: true, fallbackDecoded: true }));
  }
  const protectedSlot = await browser.newContext({ viewport: { width: 390, height: 850 }, reducedMotion: 'reduce' });
  const page = await protectedSlot.newPage();
  const name = 'Taller institucional QA';
  const seed = await get('/api/growth/advertising?place=Todas&page=home&turn=0');
  assert.equal(seed.status(), 200);
  const real = await seed.json();
  const fixture = {
    id: 'tc-qa-commercial-proof', businessName: name, headline: 'Servicio protegido de prueba',
    detail: 'Inventario simulado en el navegador', category: 'servicios', communes: ['Todas'],
    startAt: new Date(Date.now() - 86_400_000).toISOString(),
    endAt: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'active', priority: 90, placements: ['featured', 'search'], pages: ['home'],
    adType: 'COMMERCIAL_PAID', label: 'Publicidad local', format: 'featured',
  };
  await page.route('**/api/growth/advertising?**', route => route.fulfill({
    json: { ...real, complete: true, commercial: [fixture] },
  }));
  await page.route('**/api/growth/commercial-events', route => route.fulfill({ json: { received: true } }));
  await page.goto(web, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const reserved = page.getByText(name, { exact: true }).first();
  await reserved.scrollIntoViewIfNeeded({ timeout: 45_000 });
  assert.equal(await reserved.evaluate(node => Boolean(node.closest('aside[data-ad-type="HOUSE_AD"]'))), false);
  console.log(JSON.stringify({ commercialFixture: fixture.id, paidSlotPreserved: true }));
  await protectedSlot.close();
} finally {
  await browser.close();
  await testClient.dispose();
}
