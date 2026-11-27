import { createHash } from 'node:crypto';
import { db, json } from '@appdeploy/sdk';

const dataTable = 'qa_motor_consistency_data_20261127';
const metadata = 'qa_motor_consistency_control_20261127';
const ids = ['a', 'b', 'c', 'chatgpt', 'gemini'];
type Head = { id: 'head'; revision: number };
type Row = { id: string; revision: number };
type Receipt = {
  id: 'proof'; rejectedMixedCopy: boolean; publishedRevision: number;
  pages: number; rows: number; sha256: string;
};

async function head() {
  const [record] = await db.get<Head>(metadata, ['head'], { consistent: true });
  if (!record) throw Error('qa_consistency_head_missing');
  return record.revision;
}

async function capture(afterFirstPage?: () => Promise<void>) {
  const before = await head();
  const rows: Row[] = [];
  let pages = 0;
  for (let offset = 0; offset < ids.length; offset += 2) {
    const keys = ids.slice(offset, offset + 2);
    const page = await db.get<Row>(dataTable, keys, { consistent: true });
    if (page.length !== keys.length || page.some((row, index) => !row || row.id !== keys[index]))
      throw Error('qa_consistency_incomplete_read');
    rows.push(...page.flatMap(row => row ? [row] : []));
    if (++pages === 1 && afterFirstPage) await afterFirstPage();
  }
  const after = await head();
  const observedRevisions = [...new Set(rows.map(row => row.revision))];
  if (before !== after || observedRevisions.some(revision => revision !== before))
    return { accepted: false as const, before, after, observedRevisions };
  const sha256 = createHash('sha256').update(JSON.stringify(rows.map(({ id, revision }) => ({id, revision})))).digest('hex');
  return { accepted: true as const, revision: before, pages, rows: rows.length, sha256 };
}

async function writeRevision() {
  await db.transact([
    db.tx.update(metadata, [{ id: 'head', if: { revision: 1 }, record: { id: 'head', revision: 2 } }]),
    db.tx.update(dataTable, ids.map(id => ({ id, if: { revision: 1 }, record: { id, revision: 2 } }))),
  ]);
}

export async function motorBackupConsistencyProof() {
  const [previous] = await db.get<Receipt>(metadata, ['proof'], { consistent: true });
  if (previous) return json({ ok: true, replay: true, ...previous });
  const [claimed] = await db.tx.add(metadata, [{ id: 'run' }]);
  if (!claimed) return json({ ok: false, state: 'already_claimed' });
  await db.transact([
    db.tx.add(metadata, [{ id: 'head', revision: 1 }]),
    db.tx.add(dataTable, ids.map(id => ({ id, revision: 1 }))),
  ]);

  const mixed = await capture(writeRevision);
  if (mixed.accepted || mixed.before !== 1 || mixed.after !== 2 || mixed.observedRevisions.length !== 2)
    throw Error('qa_consistency_expected_mixed_capture');
  const stable = await capture();
  if (!stable.accepted || stable.revision !== 2 || stable.rows !== 5)
    throw Error('qa_consistency_expected_stable_capture');
  const receipt: Receipt = { id: 'proof', rejectedMixedCopy: true, publishedRevision: stable.revision,
    pages: stable.pages, rows: stable.rows, sha256: stable.sha256 };
  await db.transact([
    db.tx.update(metadata, [{ id: 'head', if: { revision: stable.revision }, record: { lastConfirmedBackup: receipt.id } }], { patch: true }),
    db.tx.add(metadata, [receipt]),
  ]);
  const [confirmed] = await db.get<Receipt>(metadata, ['proof'], { consistent: true });
  if (confirmed?.sha256 !== receipt.sha256) throw Error('qa_consistency_receipt_missing');
  return json({ ok: true, replay: false, rejected: mixed, ...confirmed });
}
