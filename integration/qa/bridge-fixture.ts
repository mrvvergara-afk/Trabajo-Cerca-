import { createHash } from 'node:crypto';
import { db } from '@appdeploy/sdk';

export const receiptTable = 'qa_bridge_restored_receipts_20261127';
export const control = 'qa_bridge_state_20261127';
const queue = 'qa_bridge_projection_queue_20261127';
export const oldBatch = 'chatgpt-20261126-111111111111111111';
export const newBatch = 'chatgpt-20261127-222222222222222222';
export const oldOffer = 'cg_11111111111111111111';
const newOffer = 'cg_22222222222222222222';
const newId = 'chatgpt_' + newOffer;
const index = { schema_version: 1, producer: 'chatgpt_territorial', batches: [
  { batch_id: oldBatch, file: '20261126/' + oldBatch + '.json' },
  { batch_id: newBatch, file: '20261127/' + newBatch + '.json' },
]};
const batch = { schema_version: 1, producer: 'chatgpt_territorial', approval: 'approved_for_publication',
  batch_id: newBatch, offers: [{ id_fuente: newOffer }] };
function githubBlob(value: unknown) {
  const bytes = Buffer.from(JSON.stringify(value));
  return { encoding: 'base64', content: bytes.toString('base64'), size: bytes.length,
    sha: createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') };
}
export const shas = { index: githubBlob(index).sha, batch: githubBlob(batch).sha };

export async function readBridgeFixture(path: string) {
  if (path.endsWith('/index.json')) return Response.json(githubBlob(index));
  if (path.endsWith('/' + newBatch + '.json')) return Response.json(githubBlob(batch));
  throw Error('qa_bridge_unexpected_old_batch_read');
}

export async function directChatGPTImport({ offers }: { offers: Array<Record<string, unknown>> }) {
  if (offers.length !== 1 || offers[0].id_fuente !== newOffer) throw Error('qa_bridge_unexpected_offer');
  const [id] = await db.tx.add(queue, [{ id: newId, workCommunes: ['Negrete'] }]);
  if (!id) throw Error('qa_bridge_duplicate_projection');
  return { statusCode: 200, body: JSON.stringify({ results: [{id: newOffer,
    internalId: newId, expectedWorkCommunes: ['Negrete'], status: 'direct_record_queued_for_public_projection'}] }) };
}

export async function readPublicFeedPage(cursor?: string) {
  const [state] = await db.get<{ mode: string }>(control, ['feed'], { consistent: true });
  if (state?.mode === 'degraded') return { items: [], totalJobOffers: 1, degraded: true, nextCursor: null };
  if (!cursor) return { items: [{ id: 'another_fixture', workCommunes: ['Angol'] }], totalJobOffers: 2, nextCursor: 'second' };
  if (cursor !== 'second') throw Error('qa_bridge_wrong_cursor');
  const [offer] = await db.get<{ id: string; workCommunes: string[] }>(queue, [newId], { consistent: true });
  if (!offer) throw Error('qa_bridge_projection_missing');
  return { items: [{ ...offer, workCommunes: state?.mode === 'wrong_commune' ? ['Angol'] : offer.workCommunes }],
    totalJobOffers: 2, nextCursor: null };
}
