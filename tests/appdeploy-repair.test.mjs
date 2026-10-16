import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const patch = JSON.parse(readFileSync(new URL('../integrations/appdeploy/radar-repair.json', import.meta.url), 'utf8'));
const functions = patch.files[0].diffs.filter(diff => diff.from.startsWith('async function'));
const code = version => stripTypeScriptTypes(functions.map(diff => diff[version]).join('\n'), { mode: 'strip' });

function candidate(id, extra = {}) {
  return {
    id, title: 'Operador ' + id, url: 'https://example.test/trabajo/' + id,
    active: true, kind: 'candidate', note: 'Oferta de prueba Angol',
    workCommunes: ['Angol'], recruitmentCommunes: ['Angol'], recruitmentZones: ['Angol'],
    review: true, verified: false, createdAt: '2026-10-10T12:00:00Z', ...extra,
  };
}

function harness(version, { candidates = [], jobs = [], candidateToken, jobToken, cursor,
                           addedIds, updateSuccess = true, relevant = true } = {}) {
  const calls = [];
  let storedCandidates = structuredClone(candidates);
  const context = {
    console, AbortSignal, Date,
    PILOT: ['Angol'], PUBLIC_FEED_PAGE_SIZE: 20,
    VERIFICATION_VERSION: 'test-version',
    db: {
      async list(table, options) {
        calls.push({ method: 'list', table, options });
        if (table.endsWith('_cursor')) return { items: cursor ? [{ id: 'cursor-id', nextToken: cursor }] : [] };
        if (table === 'radar_candidates') return { items: structuredClone(storedCandidates), nextToken: candidateToken };
        if (table === 'radar_jobs') return { items: structuredClone(jobs), nextToken: jobToken };
        return { items: [] };
      },
      async add(table, records) {
        calls.push({ method: 'add', table, records });
        return table === 'radar_jobs' && addedIds ? addedIds : records.map((_, i) => 'generated-' + i);
      },
      async update(table, updates) {
        calls.push({ method: 'update', table, updates: structuredClone(updates) });
        if (table === 'radar_candidates' && updateSuccess) {
          storedCandidates = storedCandidates.map(item => {
            const update = updates.find(change => change.id === item.id);
            return update ? { id: item.id, ...update.record } : item;
          });
        }
        return updates.map(() => updateSuccess);
      },
      async delete(table, ids) {
        calls.push({ method: 'delete', table, ids });
        return ids.map(() => true);
      },
    },
    fetch: async () => ({ ok: true, text: async () => 'Oferta laboral Angol ' + 'contenido '.repeat(50) }),
    ai: { scrape: async () => { throw new Error('AI forbidden in these tests'); } },
    candidateSignature: (title, places) => title + places.join(','),
    isSpecificJobResult: () => true,
    cleanHtml: text => text,
    relevantEmploymentSignal: () => relevant,
    moderate: () => true,
    expiredSourceSignal: () => false,
    extractCommunes: () => ['Angol'],
    verificationHost: () => 'example.test',
    sourceVerificationTier: () => 'portal',
    verifyPendingOffer: async item => ({ id: item.id, record: { ...item, verified: true, review: false } }),
    isCurrentlyActive: item => item.active,
    normalizeText: text => String(text ?? ''),
    unsafeContentReason: () => null,
    parseDiscoveryDate: () => Date.now(),
    staleDiscoveryDate: () => false,
    publicRecord: item => item,
    publicFeedTable: page => 'feed-' + page,
    writeSingleRecord: async (table, record) => calls.push({ method: 'writeFeed', table, record }),
  };
  vm.createContext(context);
  vm.runInContext(code(version), context);
  return { context, calls, get candidates() { return storedCandidates; } };
}

test('SDK partial insertion: only candidates with a real returned ID are closed', async () => {
  const options = { candidates: [candidate('one'), candidate('two')], addedIds: [null, 'job-two'] };
  const before = harness('from', options);
  const result = await before.context.enrichRadarCandidates(2);
  assert.equal(result.promoted, 2, 'Reproduces the original length-versus-success bug');
  assert.equal(before.candidates.filter(item => !item.active).length, 2);

  const after = harness('to', options);
  await assert.rejects(after.context.enrichRadarCandidates(2), /Partial radar job insertion/);
  assert.equal(after.candidates.find(item => item.id === 'one').active, true);
  assert.equal(after.candidates.find(item => item.id === 'two').radarJobId, 'job-two');
  assert.equal(after.candidates.find(item => item.id === 'two').active, false);
  assert.equal(after.calls.filter(call => call.method === 'delete').length, 0);
});

test('Unpromotable candidates get an attempt timestamp and stop monopolizing the first batch', async () => {
  const after = harness('to', { candidates: [candidate('one'), candidate('two')], relevant: false });
  await after.context.enrichRadarCandidates(1);
  await after.context.enrichRadarCandidates(1);
  const attempted = after.calls.filter(call => call.table === 'radar_candidates' && call.method === 'update')
    .flatMap(call => call.updates.map(update => update.id));
  assert.deepEqual(attempted, ['one', 'two']);
  assert.equal(after.candidates.filter(item => item.active).length, 2);
});

test('Enrichment follows one bounded page using a persisted cursor', async () => {
  const after = harness('to', { candidates: [candidate('one')], cursor: 'page-two', candidateToken: 'page-three' });
  await after.context.enrichRadarCandidates(1);
  const reads = after.calls.filter(call => call.method === 'list' && call.table === 'radar_candidates');
  assert.equal(reads.length, 1);
  assert.equal(reads[0].options.nextToken, 'page-two');
  const saved = after.calls.find(call => call.method === 'update' && call.table === 'radar_enrichment_cursor');
  assert.equal(saved.updates[0].record.nextToken, 'page-three');
});

test('Verification follows a bounded page instead of silently draining ten pages per cron', async () => {
  const after = harness('to', { jobs: [candidate('one', { kind: 'job_offer' })],
    cursor: 'page-two', jobToken: 'page-three' });
  const result = await after.context.processPendingOffers(8);
  assert.equal(result.verified, 1);
  const reads = after.calls.filter(call => call.method === 'list' && call.table === 'radar_jobs');
  assert.equal(reads.length, 1);
  assert.equal(reads[0].options.nextToken, 'page-two');
  assert.equal(after.calls.find(call => call.method === 'update' &&
    call.table === 'radar_verification_cursor').updates[0].record.nextToken, 'page-three');
});

test('A failed verification write cannot report a successful verified count', async () => {
  const options = { jobs: [candidate('one', { kind: 'job_offer' })], updateSuccess: false };
  const before = harness('from', options);
  assert.equal((await before.context.processPendingOffers(8)).verified, 1);
  const after = harness('to', options);
  await assert.rejects(after.context.processPendingOffers(8), /Partial verification write/);
});

test('Feed construction retains the previous feed when the inventory is incomplete', async () => {
  const options = { jobs: [], jobToken: 'there-are-more-records' };
  const before = harness('from', options);
  await before.context.rebuildPublicFeed();
  assert.equal(before.calls.find(call => call.method === 'writeFeed').record.totalJobOffers, 0);
  const after = harness('to', options);
  await assert.rejects(after.context.rebuildPublicFeed(), /Incomplete inventory/);
  assert.equal(after.calls.filter(call => ['writeFeed', 'delete'].includes(call.method)).length, 0);
});

test('A complete bounded inventory still produces the existing feed format', async () => {
  const after = harness('to', { jobs: [candidate('one', {
    kind: 'job_offer', review: false, verified: true, sourcePublishedAt: '2026-10-10',
  })] });
  const result = await after.context.rebuildPublicFeed();
  assert.equal(result.totalVerifiedJobOffers, 1);
  assert.equal(after.calls.find(call => call.method === 'writeFeed' && call.table === 'feed-0').record.items.length, 1);
});

test('Cursor persistence failure is visible to the scheduled handler', async () => {
  const after = harness('to', { cursor: 'page-two', updateSuccess: false });
  await assert.rejects(after.context.enrichRadarCandidates(6), /Radar cursor update failed/);
});
