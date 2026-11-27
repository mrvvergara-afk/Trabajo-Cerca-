import { db, json } from '@appdeploy/sdk';
import { chatgptAutoImportHandler, confirmChatGPTPublications } from './bridge-worker';
import { control, newBatch, oldBatch, oldOffer, receiptTable, shas } from './bridge-fixture';

const archive = 'qa_bridge_source_receipt_20261127';
const executed = '2026-11-26T00:00:00.000Z';
export async function motorBridgeResumeProof() {
  const [prior] = await db.get<Record<string, unknown>>(control, ['proof'], { consistent: true });
  if (prior) return json({ ok: true, replay: true, ...prior });
  const [claim] = await db.tx.add(control, [{ id: 'run' }]);
  if (!claim) return json({ ok: false, state: 'already_claimed' });

  await db.tx.add(archive, [{ id: oldBatch, batchId: oldBatch, status: 'published', newCount: 0,
    published: 1, at: executed, results: [{ id: oldOffer, status: 'already_imported_id' }] }]);
  let page = await db.list(archive, { limit: 2, appdeploy_system_id: true });
  for (const delay of [80, 200, 450]) {
    if (page.items.length === 1) break;
    await new Promise(resolve => setTimeout(resolve, delay));
    page = await db.list(archive, { limit: 2, appdeploy_system_id: true });
  }
  if (page.items.length !== 1 || page.nextToken) throw Error('qa_bridge_backup_incomplete');
  const { __appdeploy_ddb_id: id, ...record } = page.items[0];
  if (id !== oldBatch) throw Error('qa_bridge_backup_key_mismatch');
  await db.transact([
    db.tx.update(receiptTable, [{ id, record }]),
    db.tx.add(control, [{ id: 'feed', mode: 'degraded' }]),
  ]);

  const imported = JSON.parse((await chatgptAutoImportHandler()).body);
  const repeated = JSON.parse((await chatgptAutoImportHandler()).body);
  if (imported.state !== 'chatgpt_imported_waiting_for_feed' || imported.batchId !== newBatch ||
      imported.indexSha !== shas.index || imported.batchSha !== shas.batch ||
      repeated.processed !== 2 || repeated.legacyReceiptsWithoutSha !== 1)
    throw Error('qa_bridge_import_receipt_mismatch');

  const degraded = await confirmChatGPTPublications();
  await db.tx.update(control, [{ id: 'feed', record: { mode: 'wrong_commune' } }], { patch: true });
  const wrongCommune = await confirmChatGPTPublications();
  await db.tx.update(control, [{ id: 'feed', record: { mode: 'correct' } }], { patch: true });
  const publicMatch = await confirmChatGPTPublications();
  const after = await confirmChatGPTPublications();
  const [legacy, current] = await db.get<{status: string; at: string; published: number; batchSha?: string}>(receiptTable,
    [oldBatch, newBatch], { consistent: true });
  if (degraded.status !== 'feed_unavailable' || degraded.published !== 0 || wrongCommune.published !== 0 ||
      publicMatch.published !== 1 || after.status !== 'idle' || after.published !== 0 ||
      legacy?.at !== executed || legacy.batchSha || current?.batchSha !== shas.batch ||
      current.status !== 'published' || current.published !== 1)
    throw Error('qa_bridge_publication_confirmation_mismatch');

  const receipt = { id: 'proof', restoredReceipts: 1, batchesRecognized: repeated.processed,
    legacyWithoutSha: repeated.legacyReceiptsWithoutSha, candidateQueued: imported.newCount,
    indexSha: shas.index, batchSha: shas.batch, degradedFeedConfirmed: degraded.published,
    wrongCommuneConfirmed: wrongCommune.published, correctFeedConfirmed: publicMatch.published,
    confirmedAgain: after.published };
  const [saved] = await db.tx.add(control, [receipt]);
  if (!saved) throw Error('qa_bridge_proof_write_failed');
  return json({ ok: true, replay: false, ...receipt });
}
