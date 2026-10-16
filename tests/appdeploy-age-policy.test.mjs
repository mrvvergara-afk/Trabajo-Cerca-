import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const patch = JSON.parse(readFileSync(new URL('../integrations/appdeploy/age-policy-repair.json', import.meta.url), 'utf8'));
const diffs = patch.files.find(file => file.filename === 'backend/index.ts').diffs;
const functions = diffs.filter(diff => diff.to.startsWith('function ')).map(diff => diff.to).join('\n');
const literalDate = readFileSync(new URL('../integrations/appdeploy/social-evidence.ts', import.meta.url), 'utf8').replace(/^export /gm, '');
const now = Date.parse('2026-10-13T11:00:00Z');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const context = { Date:Clock, Intl, URL, DISCOVERY_MAX_AGE_DAYS:45 };
vm.createContext(context);
vm.runInContext(stripTypeScriptTypes(literalDate+'\n'+functions, { mode:'strip' }), context);

test('Original ISO hours are preserved at the exact 45-day boundary', () => {
  const edge = now-45*86400000;
  assert.equal(context.parseDiscoveryDate(new Date(edge).toISOString()), edge);
  assert.equal(context.staleDiscoveryDate(new Date(edge).toISOString()), false);
  assert.equal(context.staleDiscoveryDate(new Date(edge-1).toISOString()), true);
});

test('Capture dates and relative or yearless labels cannot create an original source date', () => {
  for (const value of ['hoy','ayer','hace 4 días','30 sep','verificada 30 sep','captura reciente','']) {
    assert.equal(context.parseDiscoveryDate(value), undefined, value);
  }
});

test('Invalid calendars and future source dates fail the age policy', () => {
  assert.equal(context.parseDiscoveryDate('2026-02-30'), undefined);
  assert.equal(context.staleDiscoveryDate(new Date(now+1).toISOString()), true);
  assert.equal(context.parseDiscoveryDate('2026-10-13T08:00:00-03:00'), now);
});
