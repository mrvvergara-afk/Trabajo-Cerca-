import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

const source = await readFile(new URL('./fast-bc-html.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function'));
const outsideHint = 'https://jobs.arauco.com/job/Santiago-Mantenimiento/123456/';
const local = 'https://jobs.arauco.com/job/Angol-Operador/223456/';
const unsupported = 'https://fixture.invalid/job/12';

function fixture(limit) {
  const visits = [];
  const records = new Map();
  const db = {
    get: async (_, [id]) => [records.get(id)],
    tx: {
      add: async (_, [record]) => { records.set(record.id, record); return [record.id]; },
      update: async (_, [{ id, record }]) => { records.set(id, record); return [true]; },
    },
  };
  const fetchPage = async url => { visits.push(url); return { url, status: 200, raw: 'fixture' }; };
  const run = new Function('db', 'createHash', 'publicDocumentUrl', 'saveVerifiedPublicOffer', 'safePublicUrl',
    'publicSourceAdapter', 'fetchPublicPage', 'evaluatePublicJob', 'bcCheckLimit', 'console', code + '\nreturn runFastBCHtml;')(
    db, createHash, () => false, async () => 'saved', url => url,
    url => new URL(url).hostname === 'jobs.arauco.com' ? { family: 'ats' } : null,
    fetchPage, () => ({ status: 'verified', reason: 'worksite_confirmed' }), () => limit, { warn() {} },
  );
  const work = (rechecks = []) => ({ checkedAt: new Date().toISOString(), recheckWork: rechecks,
    summary: { reviewed: [outsideHint, local, unsupported].map(url => ({ url, status: 'pending' })) }, documentWork: { items: [] } });
  return { run, work, visits, records };
}

test('territorial URL hints defer low-priority rows and still permit verified worksites', async () => {
  const incomplete = fixture(1);
  const result = await incomplete.run(incomplete.work());
  assert.deepEqual(incomplete.visits, [local]);
  assert.equal(result.deferredOutside, 1);
  assert.equal(result.budgetDeferred, 1);
  assert.equal(result.unsupported, 1);
  const complete = fixture(2);
  const finished = await complete.run(complete.work());
  assert.deepEqual(complete.visits, [local, outsideHint]);
  assert.equal(finished.verified, 2);
});

test('a due recheck is attempted ahead of ordinary candidates regardless of the URL hint', async () => {
  const f = fixture(1);
  await f.run(f.work([{ url: outsideHint }]));
  assert.deepEqual(f.visits, [outsideHint]);
});

test('a revised worksite rule rechecks one legacy rejection within the existing budget', async () => {
  const f = fixture(1);
  const key = createHash('sha256').update('fast-bc-html:' + local).digest('hex').slice(0, 48);
  f.records.set(key, { id: key, decision: 'pending_evidence', checkedAt: new Date().toISOString(),
    reason: 'worksite_missing_or_multiple', attempts: 2 });
  await f.run(f.work());
  assert.deepEqual(f.visits, [local]);
  assert.equal(f.records.get(key).decision, 'stored_pending_public_feed');
  assert.equal(f.records.get(key).worksiteRule, 'functional-requirements-v2');
});
