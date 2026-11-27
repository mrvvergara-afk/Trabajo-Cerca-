import { db, json } from '@appdeploy/sdk';
import { ids, inputs, tables } from './resume-fixture';
import { shadowPdfBatch } from './resume-worker';

const source = {
  queue: 'qa_resume_source_a_20261127',
  attempts: 'qa_resume_source_attempts_20261127',
  documents: 'qa_resume_source_docs_20261127',
  receipts: 'qa_resume_source_receipts_20261127',
};

async function restoreGroup(from: string, to: string, expected: number) {
  let page = await db.list(from, { limit: 5, appdeploy_system_id: true });
  for (const delay of [80, 200, 450]) {
    if (page.items.length === expected) break;
    await new Promise(resolve => setTimeout(resolve, delay));
    page = await db.list(from, { limit: 5, appdeploy_system_id: true });
  }
  if (page.items.length !== expected || page.nextToken) throw Error('qa_resume_export_count');
  const writes = page.items.map(({ __appdeploy_ddb_id: id, ...record }) => ({ id, record }));
  return { write: db.tx.update(to, writes) };
}

export async function motorQueueResumeProof() {
  const [prior] = await db.get<Record<string, unknown>>(tables.proof, ['proof'], { consistent: true });
  if (prior) return json({ ok: true, replay: true, ...prior });
  const [claimed] = await db.tx.add(tables.proof, [{ id: 'run' }]);
  if (!claimed) return json({ ok: false, state: 'already_claimed' });

  const now = Date.now();
  const seen = now - 120000;
  await db.transact([
    db.tx.add(source.queue, [{ id: 'cursor', items: inputs }]),
    db.tx.add(source.attempts, [
      { id: ids[0], token: 'previous', attempt: 1, due: 0, state: 'completed', firstSeenAt: seen },
      { id: ids[1], token: 'deferred', attempt: 2, due: now + 3600000, state: 'retry', firstSeenAt: seen },
    ]),
    db.tx.add(source.documents, [{ id: ids[0], stage: 'recoverable', reason: 'completed_before_backup', publicEligible: false }]),
    db.tx.add(source.receipts, [{ id: 'previous', candidateId: ids[0], attempt: 1, state: 'recoverable' }]),
  ]);
  const copies = await Promise.all([
    [source.queue, tables.queue, 1], [source.attempts, tables.attempts, 2],
    [source.documents, tables.docs, 1], [source.receipts, tables.receipts, 1],
  ].map(([from, to, count]) => restoreGroup(String(from), String(to), Number(count))));
  await db.transact(copies.map(copy => copy.write));

  const first = await shadowPdfBatch();
  const [deferred] = await db.get<{state: string; attempt: number; due: number}>(tables.attempts, [ids[1]], { consistent: true });
  if (first.processed !== 1 || first.replayedDocumentInputs !== 1 || first.deferredDocumentInputs !== 1 ||
      deferred?.state !== 'retry' || deferred.attempt !== 2 || deferred.due <= now)
    throw Error('qa_resume_first_pass_mismatch');
  const [changed] = await db.tx.update(tables.attempts,
    [{ id: ids[1], if: { token: 'deferred' }, record: { due: 0 } }], { patch: true });
  if (!changed) throw Error('qa_resume_force_due_failed');
  const second = await shadowPdfBatch();
  const repeat = await shadowPdfBatch();
  const attempts = await db.get<{token: string; attempt: number; state: string; firstSeenAt: number}>(tables.attempts, ids, { consistent: true });
  if (second.processed !== 1 || repeat.processed !== 0 || repeat.replayedDocumentInputs !== 3 ||
      attempts[0]?.token !== 'previous' || attempts[0].attempt !== 1 ||
      attempts[1]?.attempt !== 3 || attempts[1].firstSeenAt !== seen || attempts[2]?.attempt !== 1 ||
      attempts.some(row => row?.state !== 'completed'))
    throw Error('qa_resume_final_attempts_mismatch');
  const tokens = attempts.flatMap(row => row ? [row.token] : []);
  const receipts = await db.get<{candidateId: string; state: string}>(tables.receipts, tokens, { consistent: true });
  if (new Set(tokens).size !== 3 || receipts.some((row, index) => row?.candidateId !== ids[index] || row?.state !== 'recoverable'))
    throw Error('qa_resume_receipts_mismatch');

  const receipt = { id: 'proof', tablesRestored: 4, rowsRestored: 5, firstProcessed: first.processed,
    deferredBeforeDue: first.deferredDocumentInputs, processedAfterDue: second.processed,
    completedReplayed: repeat.replayedDocumentInputs, duplicateWorkOnRepeat: repeat.processed,
    attempts: attempts.map(row => row?.attempt), receiptsVerified: receipts.length };
  await db.tx.add(tables.proof, [receipt]);
  return json({ ok: true, replay: false, ...receipt });
}
