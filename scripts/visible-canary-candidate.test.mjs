import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePayload } from './release-runner.mjs';

const payload = JSON.parse(
  readFileSync('release/candidates/visible-canary-20261121.json', 'utf8')
);
const baseline = readFileSync(
  'release/baselines/ux-preview-transfer-1795209664148.css', 'utf8'
);
const previewSelector = 'html[data-tc-release-preview="1"]';
const marker = 'Trabajo Cerca | version de prueba TC-20261121-A';

test('canary is pinned to the current official version and allowed CSS only', () => {
  assert.equal(payload.appId, 'trabajo-cerca-laboratorio-3ojgro');
  assert.equal(payload.expectedBaseline, '1795209664148');
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].filename, 'src/ux-preview-transfer.css');
  assert.equal(payload.files[0].diffs.length, 1);
  assert.equal(validatePayload(payload, payload.expectedBaseline,
    'a'.repeat(40)), true);
  assert.throws(() => validatePayload(payload, '1795209664149',
    'a'.repeat(40)));
});

test('diff applies exactly once and preserves all original CSS rules', () => {
  const { from, to } = payload.files[0].diffs[0];
  assert.equal(baseline.split(from).length - 1, 1);
  const output = baseline.replace(from, to);
  assert.ok(output.includes(marker));
  assert.equal(output.replace(to, from), baseline);
  assert.equal(output.split('html[data-tc-release-preview="1"]').length -
    baseline.split('html[data-tc-release-preview="1"]').length, 1);
});

test('release marker remains entirely behind explicit opt-in attribute', () => {
  const { to } = payload.files[0].diffs[0];
  const markerRule = to.slice(to.indexOf('html['));
  assert.ok(markerRule.startsWith(previewSelector + ' body::before {'));
  assert.ok(markerRule.includes('content: "' + marker + '"'));
  assert.equal(/(^|\n)\s*body::before\s*{/.test(markerRule), false);
  assert.ok(markerRule.includes('pointer-events: none'));
  assert.ok(markerRule.includes('max-width: calc(100vw - 20px)'));
});

test('candidate cannot deploy accidentally through the existing active payload', () => {
  const livePayload = JSON.parse(readFileSync('release/payload.json', 'utf8'));
  assert.equal(livePayload.expectedBaseline, payload.expectedBaseline);
  assert.equal(livePayload.files.length, 1);
  assert.equal(livePayload.files[0].filename, 'src/ux-preview-transfer.css');
  assert.notDeepEqual(livePayload.files[0].diffs, payload.files[0].diffs);
  assert.ok(!JSON.stringify(livePayload).includes(marker));
});

test('canary contains no production secret or data action', () => {
  const { to } = payload.files[0].diffs[0];
  assert.equal(/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|POST|DELETE)\b/.test(to), false);
  assert.equal(/https?:\/\//.test(to), false);
  assert.equal(/\burl\s*\(/.test(to), false);
});
