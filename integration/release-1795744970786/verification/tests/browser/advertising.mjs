import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const bank = process.env.TC_CREATIVE_BANK;
assert.ok(bank, 'Define TC_CREATIVE_BANK con el directorio marketing/bank');
const catalogue = JSON.parse(await readFile(resolve(bank, 'index.json'), 'utf8'));
const squares = JSON.parse(await readFile(new URL('../../marketing/bank/carousel-squares.json', import.meta.url)));
const officialAppId = 'trabajo-cerca-laboratorio-3ojgro';
const qaAppId = 'trabajo-cerca-qa-sdk-aislado-lykn7b';
const media = new Map();
const slots = Object.keys(squares.slots);
const editions = [0, 1].map(edition => slots.map((slot, index) => {
  const asset = catalogue.assets.filter(entry => entry.slot === slot)[edition];
  const imageUrl = '/api/growth/institutional/media/' + asset.web.sha256;
  for (const appId of [officialAppId, qaAppId]) {
    media.set('https://api-v2.appdeploy.ai/app/' + appId + imageUrl, {
      filename: asset.web.sha256 + '.webp', contentType: 'image/webp',
    });
  }
  const square = squares.slots[slot][asset.web.sha256];
  assert.ok(square, 'Derivada cuadrada de ' + slot);
  media.set(squares.baseUrl + square, { filename: square, contentType: 'image/jpeg' });
  return {
    slot, imageUrl, alt: asset.alt,
    title: index % 2 ? 'Tu experiencia, tus oficios y tus servicios al alcance de las comunas de Malleco' : 'Empleo local',
    message: index % 2 ? 'Encuentra personas, empresas y oportunidades de trabajo en el territorio. Revisa los avisos vigentes y conoce las opciones de cada comuna.' : 'Busca empleo cerca.',
    mobile: index % 2 ? 'Encuentra oficios y otros servicios en tu comuna, con experiencia y contacto directo.' : 'Busca empleo cerca.',
  };
}));
for (const item of media.values()) {
  item.bytes = await readFile(resolve(bank, item.filename));
  assert.equal(createHash('sha256').update(item.bytes).digest('hex'), item.filename.split('.')[0]);
}
const snapTime = new Date('2026-11-27T20:00:00Z');

const server = await createServer({
  resolve: { alias: { '@appdeploy/client': fileURLToPath(new URL('./advertising-client.mjs', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 4188, strictPort: true },
});
await server.listen();
let browser;

async function checkPhoto(image, { naturalHeight, withControls }) {
  await image.scrollIntoViewIfNeeded();
  await image.evaluate(node => node.decode());
  const layout = await image.evaluate(node => {
    const art = node.parentElement;
    const controls = art.querySelector('[role="group"]');
    const card = node.closest('aside');
    const px = node.getBoundingClientRect();
    const frame = art.getBoundingClientRect();
    const surroundings = card.getBoundingClientRect();
    const buttons = controls?.getBoundingClientRect();
    const within = (inner, outer) => inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1 &&
      inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
    return {
      naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight,
      fit: getComputedStyle(node).objectFit,
      photoInsideFrame: within(px, frame) && within(px, surroundings),
      controlsInsideCard: buttons ? within(buttons, surroundings) : null,
      photoAboveControls: buttons ? px.bottom <= buttons.top + 1 : null,
      cardHeight: Math.round(surroundings.height),
    };
  });
  assert.equal(layout.naturalWidth, 840);
  assert.equal(layout.naturalHeight, naturalHeight);
  assert.equal(layout.fit, 'contain');
  assert.ok(layout.photoInsideFrame, 'La foto rebasa el marco: ' + JSON.stringify(layout));
  if (withControls) {
    assert.ok(layout.controlsInsideCard, 'Los controles rebasan la tarjeta: ' + JSON.stringify(layout));
    assert.ok(layout.photoAboveControls, 'Los controles tapan la foto: ' + JSON.stringify(layout));
  }
  return layout.cardHeight;
}

async function openPage(width, appId, { commercial = [], edition = 0, unavailable = [] } = {}) {
  const page = await browser.newPage({
    viewport: { width, height: 920 }, reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  await page.clock.install({ time: snapTime });
  const manifest = {
    schema: 1, revision: String(edition).repeat(64), period: '2026-11-23',
    season: 'primavera', territory: 'Malleco', slides: editions[edition],
  };
  await page.addInitScript(({ appId, manifest, commercial }) => {
    window.__APPDEPLOY_APP_ID = appId;
    window.tcAdvertisingFixture = { manifest, commercial };
  }, { appId, manifest, commercial });
  await page.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).hostname === '127.0.0.1') return route.continue();
    const asset = media.get(url);
    if (unavailable.includes(url)) return route.fulfill({ status: 404 });
    return asset ? route.fulfill({ body: asset.bytes, contentType: asset.contentType }) : route.abort();
  });
  const response = await page.goto('http://127.0.0.1:4188/');
  assert.equal(response.status(), 200);
  return page;
}

async function checkCampaignPriority() {
  const fixture = {
    businessName: 'Comercio regional de prueba', headline: 'Campaña vigente', detail: 'Datos simulados',
    communes: ['Todas'], category: 'Servicios', status: 'active', startAt: '2026-11-26T16:00:00Z',
    endAt: '2026-11-27T21:00:00Z', pages: ['home'], placements: ['search'],
  };
  const page = await openPage(375, officialAppId, { commercial: [
    { ...fixture, id: 'qa-vencida', businessName: 'Campaña vencida', priority: 100, adType: 'COMMERCIAL_PAID', endAt: '2026-11-27T19:00:00Z' },
    { ...fixture, id: 'qa-pagada', priority: 1, adType: 'COMMERCIAL_PAID' },
    { ...fixture, id: 'qa-gratuita', businessName: 'Campaña gratuita', priority: 100, adType: 'COMMERCIAL_FREE', endAt: '2026-11-28T00:00:00Z' },
  ] });
  const commercial = page.locator('.tcCommercialCard[data-placement="search"]');
  await commercial.getByRole('heading', { name: fixture.businessName }).waitFor({ timeout: 10000 });
  await page.clock.fastForward('02:00:00');
  await commercial.getByRole('heading', { name: 'Campaña gratuita' }).waitFor({ timeout: 10000 });
  await page.clock.fastForward('03:00:00');
  await page.locator('.tcInlineHousePromo[data-placement="search"] .tcInstitutionalPhoto').waitFor({ timeout: 10000 });
  assert.equal(await commercial.count(), 0);
  console.log(JSON.stringify({ commercialPriority: 'paid_then_free_then_house', expiredCampaignDisplayed: false }));
  await page.close();
}

async function checkMediaRecovery() {
  const ref = editions[0][0].imageUrl;
  const squareUrl = squares.baseUrl + squares.slots.explore[ref.split('/').pop()];
  const mediaUrl = appId => 'https://api-v2.appdeploy.ai/app/' + appId + ref;
  for (const [appId, unavailable, expectedUrl, naturalHeight] of [
    [officialAppId, squareUrl, mediaUrl(officialAppId), 560],
    [qaAppId, mediaUrl(qaAppId), squareUrl, 840],
  ]) {
    const page = await openPage(375, appId, { unavailable: [unavailable] });
    const card = page.locator('.tcAdvertisingFeaturedSlot .tcPremiumAd');
    const image = card.locator('.tcInstitutionalPhoto[src="' + expectedUrl + '"]');
    await card.scrollIntoViewIfNeeded();
    await image.waitFor({ timeout: 4000 });
    await checkPhoto(image, { naturalHeight, withControls: true });
    await page.close();
  }
  const page = await openPage(375, officialAppId, { unavailable: [squareUrl, mediaUrl(officialAppId)] });
  const card = page.locator('.tcAdvertisingFeaturedSlot .tcPremiumAd');
  await card.scrollIntoViewIfNeeded();
  const illustration = card.locator('img.tcCampaignFallbackArt[src="/house-creatives/explore.svg"]');
  await illustration.waitFor({ timeout: 4000 });
  await illustration.evaluate(node => node.decode());
  await page.close();
  console.log(JSON.stringify({ mediaRecovery: 'alternate_photo_then_illustration' }));
}

try {
  browser = await chromium.launch({
    executablePath: process.env.TC_CHROMIUM || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  await checkCampaignPriority();
  await checkMediaRecovery();
  for (const [appId, naturalHeight, edition] of [[officialAppId, 840, 0], [officialAppId, 840, 1], [qaAppId, 560, 0], [qaAppId, 560, 1]]) {
    for (const width of [320, 375, 430, 1440]) {
      const page = await openPage(width, appId, { edition });
      const heightsByPlacement = {};
      for (const [placement, selector] of Object.entries({
        buscador: '.tcInlineHousePromo[data-placement="search"]',
        destacada: '.tcAdvertisingFeaturedSlot .tcPremiumAd',
      })) {
        const card = page.locator(selector);
        const controls = card.getByRole('group').getByRole('button');
        const image = card.locator('.tcInstitutionalPhoto');
        await image.waitFor({ timeout: 10000 });
        assert.equal(await controls.count(), 6);
        const files = new Set();
        const heights = new Set();
        for (const button of await controls.all()) {
          await button.click();
          heights.add(await checkPhoto(image, { naturalHeight, withControls: true }));
          assert.equal(await button.getAttribute('aria-pressed'), 'true');
          files.add(await image.getAttribute('src'));
        }
        assert.equal(files.size, 6);
        heightsByPlacement[placement] = [...heights];
      }
      await page.getByLabel('Abrir menú de Trabajo Cerca').click({ timeout: 10000 });
      await page.locator('.tcSiteMenuPanel').getByRole('button', { name: 'Necesito un servicio' }).click({ timeout: 10000 });
      heightsByPlacement.formulario = [await checkPhoto(page.locator('.tcFormEditorialAd .tcInstitutionalPhoto'), { naturalHeight, withControls: false })];
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      console.log(JSON.stringify({ appId, width, edition, heightsByPlacement }));
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
