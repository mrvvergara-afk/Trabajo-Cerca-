// Run: node --test scripts/test-public-feed-snapshot.mjs
// Static staging checks only: does not compile or exercise the AppDeploy runtime.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
const source = readFileSync(new URL('../appdeploy_staging/snapshot/backend/public-feed.ts', import.meta.url), 'utf8');
test('AppDeploy snapshot contains public manifest reader and immutable pages', () => {
  assert.match(source, /export async function readPublicFeedPage\(/);
  assert.match(source, /public_feed_manifests/);
  assert.match(source, /public_feed_versions/);
});
test('regression guard must block unexplained loss', () => {
  assert.match(source, /PUBLIC_FEED_REGRESSION_BLOCKED/);
  assert.match(source, /regressionBlocked:true/);
  assert.match(source, /if\(unexpected\.length\)/);
});
test('change queue is not acknowledged after blocked regression', () => {
  assert.match(source, /!\('regressionBlocked' in result && result\.regressionBlocked\)/);
});
test('page reader returns stable versioned cursor', () => {
  assert.match(source, /'v2:' \+ manifestId/);
  assert.match(source, /Feed cursor invalid/);
});
