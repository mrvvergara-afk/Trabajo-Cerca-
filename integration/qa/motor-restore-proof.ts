import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db, json } from '@appdeploy/sdk';

const source = 'qa_motor_restore_source_20261127_v2';
const target = 'qa_motor_restore_target_20261127_v2';
const control = 'qa_motor_restore_control_20261127_v2';
const fixture = [
  { id: 'a', engine: 'A', state: 'detected', sequence: 1 },
  { id: 'b', engine: 'B', state: 'needs_review', sequence: 2 },
  { id: 'c', engine: 'C', state: 'verified', sequence: 3 },
  { id: 'chatgpt', engine: 'CHATGPT', state: 'duplicate', sequence: 4 },
  { id: 'gemini', engine: 'GEMINI', state: 'deferred', sequence: 5 },
];
type FixtureRow = typeof fixture[number];
type Envelope = { id: 'archive'; ciphertext: string; iv: string; tag: string; sha256: string };
type Receipt = { id: 'restore'; rows: number; exportedPages: number; sha256: string; tamperRejected: boolean };
const canonical = (rows: FixtureRow[]) => JSON.stringify([...rows]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map(({ id, engine, state, sequence }) => ({ id, engine, state, sequence })));
const digest = (data: string) => createHash('sha256').update(data).digest('hex');

async function readFixturePages(table: string) {
  const rows: FixtureRow[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let pages = 1; pages <= 5; pages++) {
    const page = await db.list<FixtureRow>(table, { limit: 2, ...(cursor ? { nextToken: cursor } : {}) });
    rows.push(...page.items);
    cursor = page.nextToken;
    if (!cursor) return { rows, pages };
    if (cursors.has(cursor)) throw Error('qa_repeated_cursor');
    cursors.add(cursor);
  }
  throw Error('qa_export_incomplete');
}

function decrypt(envelope: Envelope, key: Buffer) {
  const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  cipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]).toString('utf8');
}

export async function motorRestoreProof() {
  const [prior] = await db.get<Receipt>(control, ['restore'], { consistent: true });
  if (prior) {
    const readback = await db.get<FixtureRow>(target, fixture.map(row => row.id), { consistent: true });
    const restored = readback.flatMap(row => row ? [row] : []);
    if (restored.length !== fixture.length || digest(canonical(restored)) !== prior.sha256)
      throw Error('qa_restore_replay_mismatch');
    return json({ ok: true, replay: true, ...prior });
  }

  const [claimed] = await db.tx.add(control, [{ id: 'run', scope: 'synthetic_fixture' }]);
  if (!claimed) return json({ ok: false, state: 'already_claimed' });
  await db.transact([db.tx.add(source, fixture)]);

  const expected = canonical(fixture);
  let exportResult = await readFixturePages(source);
  for (const delay of [80, 200, 450]) {
    if (canonical(exportResult.rows) === expected && exportResult.pages >= 2) break;
    await new Promise(resolve => setTimeout(resolve, delay));
    exportResult = await readFixturePages(source);
  }
  const { rows, pages } = exportResult;
  const plaintext = canonical(rows);
  if (rows.length !== fixture.length || plaintext !== expected || pages < 2)
    throw Error('qa_export_fixture_mismatch_rows_' + rows.length + '_pages_' + pages);

  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const envelope: Envelope = {
    id: 'archive', ciphertext: encrypted.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), sha256: digest(plaintext),
  };
  const [saved] = await db.tx.add(control, [envelope]);
  if (!saved) throw Error('qa_archive_write_unconfirmed');
  const [archive] = await db.get<Envelope>(control, ['archive'], { consistent: true });
  if (!archive) throw Error('qa_archive_readback_missing');
  const restoredPlaintext = decrypt(archive, key);
  if (digest(restoredPlaintext) !== archive.sha256 || restoredPlaintext !== canonical(fixture))
    throw Error('qa_archive_integrity_mismatch');

  const damaged = Buffer.from(archive.ciphertext, 'base64');
  damaged[0] ^= 1;
  let tamperRejected = false;
  try {
    decrypt({ ...archive, ciphertext: damaged.toString('base64') }, key);
  } catch {
    tamperRejected = true;
  }
  if (!tamperRejected) throw Error('qa_tamper_not_detected');

  const receipt: Receipt = { id: 'restore', rows: rows.length, exportedPages: pages, sha256: archive.sha256, tamperRejected };
  await db.transact([
    db.tx.add(target, JSON.parse(restoredPlaintext) as FixtureRow[]),
    db.tx.add(control, [receipt]),
  ]);
  const readback = await db.get<FixtureRow>(target, fixture.map(row => row.id), { consistent: true });
  const restored = readback.flatMap(row => row ? [row] : []);
  if (restored.length !== fixture.length || digest(canonical(restored)) !== receipt.sha256)
    throw Error('qa_restore_readback_mismatch');
  return json({ ok: true, replay: false, ...receipt });
}
