import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {test} from 'node:test';

const source = await readFile(new URL('./chatgpt-auto-import.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, '').replaceAll('export async function', 'async function'));
const batchId = 'chatgpt-20261118-9c58b885edd5c23c79';
const offerId = 'cg_0123456789abcdef0123';
const indexSha = 'a'.repeat(40);
const batchSha = 'b'.repeat(40);
const index = {schema_version: 1, producer: 'chatgpt_territorial', batches: [{batch_id: batchId, file: '20261118/' + batchId + '.json'}]};
const batch = {schema_version: 1, producer: 'chatgpt_territorial', approval: 'approved_for_publication',
  batch_id: batchId, offers: [{id_fuente: offerId}]};

function fixture({old, lostResponse = false, recoveredSha, offeredBatchSha = batchSha} = {}) {
  let receipt = old, imports = 0, fetches = 0;
  const db = {
    get: async () => [receipt],
    tx: {add: async (_table, [row]) => {
      receipt = recoveredSha ? {...row, batchSha: recoveredSha} : row;
      if (lostResponse) throw Error('fixture_lost_response');
      return [row.id];
    }},
  };
  const fetch = async (url) => {
    fetches++;
    const isIndex = url.includes('/index.json?');
    const buffer = Buffer.from(JSON.stringify(isIndex ? index : batch));
    return Response.json({encoding: 'base64', content: buffer.toString('base64'), size: buffer.length,
      sha: isIndex ? indexSha : offeredBatchSha});
  };
  const secrets = {listSecretNames: async () => ['MOTOR_C_GITHUB_READ_TOKEN'], readSecret: async () => 'fixture'};
  const directChatGPTImport = async () => {
    imports++;
    return {statusCode: 200, body: JSON.stringify({results: [{id: offerId, status: 'already_imported_id'}]})};
  };
  const run = new Function('db','secrets','fetch','directChatGPTImport','console', code + '\nreturn chatgptAutoImportHandler;')
    (db, secrets, fetch, directChatGPTImport, {warn() {}});
  return {run: async () => JSON.parse((await run()).body), stats: () => ({receipt, imports, fetches})};
}

test('new receipts and bridge logs record both blob SHAs, including readback after a lost acknowledgement', async () => {
  const f = fixture({lostResponse: true});
  const result = await f.run();
  assert.equal(result.state, 'chatgpt_imported_waiting_for_feed');
  for (const row of [result, f.stats().receipt]) {
    assert.equal(row.indexSha, indexSha);
    assert.equal(row.batchSha, batchSha);
  }
  assert.equal(f.stats().imports, 1);
});

test('legacy receipts are counted without attaching an unproven SHA or reimporting', async () => {
  const old = {results: [{id: offerId}]};
  const f = fixture({old});
  const result = await f.run();
  assert.equal(result.indexSha, indexSha);
  assert.equal(result.legacyReceiptsWithoutSha, 1);
  assert.deepEqual(f.stats(), {receipt: old, imports: 0, fetches: 1});
});

test('readback from a different blob does not confirm this transfer', async () => {
  const f = fixture({lostResponse: true, recoveredSha: 'c'.repeat(40)});
  assert.equal((await f.run()).state, 'chatgpt_bridge_error');
});

test('rejects an invalid GitHub SHA before importing candidates', async () => {
  const f = fixture({offeredBatchSha: 'invalid'});
  assert.equal((await f.run()).state, 'chatgpt_bridge_error');
  assert.equal(f.stats().imports, 0);
});

test('public confirmation requires a verified active job in the expected commune', async () => {
  let receipt = {
    id: batchId, batchId, status: 'awaiting_public_feed', newCount: 1, published: 0,
    results: [{ id: offerId, status: 'direct_record_queued_for_public_projection', expectedWorkCommunes: ['Angol'] }],
  };
  const db = {
    list: async () => ({ items: [receipt] }),
    tx: { update: async (_table, [row]) => { receipt = row.record; return [true]; } },
  };
  const entry = { id: 'chatgpt_' + offerId, kind: 'job_offer', verified: true, active: true, workCommunes: ['Angol'] };
  let item;
  const readPublicFeedPage = async () => ({ items: [item], totalJobOffers: 1 });
  const confirm = new Function('db', 'readPublicFeedPage', code + '\nreturn confirmChatGPTPublications;')(db, readPublicFeedPage);

  for (const patch of [
    { kind: 'worker_available' }, { verified: false }, { active: false }, { review: true }, { workCommunes: ['Purén'] },
  ]) {
    item = { ...entry, ...patch };
    assert.equal((await confirm()).published, 0);
    assert.equal(receipt.status, 'awaiting_public_feed');
  }
  item = entry;
  assert.equal((await confirm()).published, 1);
  assert.equal(receipt.status, 'published');
});
