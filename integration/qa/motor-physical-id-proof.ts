import { db, json } from '@appdeploy/sdk';

const from = 'qa_motor_physical_source_20261127';
const to = 'qa_motor_physical_restore_20261127';
const control = 'qa_motor_physical_control_20261127';
const payload = { id: 'fixture-logical-id', state: 'deferred', attempts: 3 };
type Row = typeof payload;
type Receipt = { id: 'proof'; distinctIds: boolean; logicalIdPreserved: boolean; physicalIdPreserved: boolean; retryStatePreserved: boolean };

export async function motorPhysicalIdProof() {
  const [prior] = await db.get<Receipt>(control, ['proof'], { consistent: true });
  if (prior) return json({ ok: true, replay: true, ...prior });
  const [claimed] = await db.tx.add(control, [{ id: 'run' }]);
  if (!claimed) return json({ ok: false, state: 'already_claimed' });

  const [physicalId] = await db.add(from, [payload]);
  if (!physicalId || physicalId === payload.id) throw Error('qa_legacy_key_fixture_invalid');
  let page = await db.list<Row>(from, { limit: 5, appdeploy_system_id: true });
  for (const delay of [80, 200, 450]) {
    if (page.items.length) break;
    await new Promise(resolve => setTimeout(resolve, delay));
    page = await db.list<Row>(from, { limit: 5, appdeploy_system_id: true });
  }
  if (page.items.length !== 1 || page.nextToken) throw Error('qa_legacy_page_mismatch');
  const { __appdeploy_ddb_id: key, ...record } = page.items[0];
  if (key !== physicalId || record.id !== payload.id) throw Error('qa_legacy_export_changed_identity');

  const receipt: Receipt = { id: 'proof', distinctIds: true, logicalIdPreserved: true,
    physicalIdPreserved: true, retryStatePreserved: true };
  await db.transact([
    db.tx.update(to, [{ id: key, record }]),
    db.tx.add(control, [receipt]),
  ]);
  const [restored, incorrect] = await db.get<Row>(to, [physicalId, payload.id], { consistent: true });
  if (incorrect || restored?.id !== payload.id || restored.state !== 'deferred' || restored.attempts !== 3)
    throw Error('qa_legacy_restore_changed_identity_or_retry_state');
  return json({ ok: true, replay: false, ...receipt });
}
