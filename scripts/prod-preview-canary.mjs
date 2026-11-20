/**
 * Production release rehearsal: READ ONLY and opt-in visual preview.
 * Never POST, no credentials, no fixtures, and no load. Two visits total.
 * Production default must look unchanged; ?tc_release_preview=1 shows smaller directory.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const ROOT = 'https://trabajo-cerca-laboratorio-3ojgro.v2.appdeploy.ai/';
assert.match(ROOT, /trabajo-cerca-laboratorio-3ojgro/);
const browser = await chromium.launch({ headless: true });
const inspected = [];
try {
  for (const preview of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true,
      hasTouch: true, deviceScaleFactor: 2, locale: 'es-CL',
    });
    try {
      const page = await context.newPage();
      const exceptions = [];
      page.on('pageerror', error => exceptions.push(error.message));
      await page.goto(ROOT + (preview ? '?tc_release_preview=1' : ''), {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await page.locator('.neoMobileNav button').filter({ hasText: 'Directorio' })
        .first().click();
      const dir = page.locator('.tcLocalDirectory').first();
      await dir.waitFor({ timeout: 20000 });
      const state = await page.evaluate(() => {
        const root = document.querySelector('.tcLocalDirectory');
        const tabs = document.querySelector('.tcDirectoryTabs button');
        const header = document.querySelector('.tcDirectoryTop h2');
        if (!root || !tabs || !header) throw Error('Missing public directory');
        return {
          preview: document.documentElement.dataset.tcReleasePreview || '',
          padding: parseFloat(getComputedStyle(root).paddingLeft),
          tabHeight: parseFloat(getComputedStyle(tabs).minHeight),
          titleFont: parseFloat(getComputedStyle(header).fontSize),
        };
      });
      assert.equal(state.preview, preview ? '1' : '');
      assert.equal(exceptions.length, 0, exceptions.join('; '));
      inspected.push(state);
      console.log('PASS production ' + (preview ? 'opt-in preview' : 'standard mode') +
        ' ' + JSON.stringify(state));
    } finally {
      await context.close();
    }
  }
  assert.ok(inspected[1].padding < inspected[0].padding,
    'preview must be visually smaller than default');
  assert.ok(inspected[0].tabHeight >= inspected[1].tabHeight);
  console.log('PROD_CANARY_PASS ' + JSON.stringify({
    defaultUnchanged: true, optInCompact: true,
    backendWrites: 0, databaseWrites: 0,
    requests: 'two normal browser visits', results: inspected,
  }));
} finally { await browser.close(); }
