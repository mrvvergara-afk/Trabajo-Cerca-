import { createHash } from 'node:crypto';
import { db, json, storage, isAppDatabaseError } from '@appdeploy/sdk';

const control = 'qa_coordinated_backup_control_20261127';
const intake = 'qa_coordinated_backup_intake_20261127';
const publisher = 'qa_coordinated_backup_publisher_20261127';
const restored = 'qa_coordinated_backup_restore_20261127';
const prefix = 'qa-coordinated-backup-20261127/';
const intakeKeys = ['a', 'b', 'c'];
const publishKeys = ['chatgpt', 'gemini'];
type Row = { id: string; name: string; revision: number };
type Manifest = { id: string; revision: number; file: string; fileSha256: string };
type Receipt = { id: 'proof'; firstRevision: number; currentRevision: number; rows: number; files: number;
  pages: number; previousBytesPreserved: boolean; orphanInvisible: boolean; corruptedReferenceRejected: boolean; restoredRevision: number };
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const makeRows = (keys: string[], revision: number) => keys.map(name => ({ id: revision + '-' + name, name, revision }));

async function prepareObject(revision: number) {
  const bytes = Buffer.from(JSON.stringify({ fixture: 'motor-backup', revision }));
  const fileSha256 = hash(bytes);
  const path = prefix + fileSha256 + '.json';
  const [saved] = await storage.write([{ path, content: bytes.toString('base64'), contentType: 'application/json' }]);
  const [stored] = await storage.read([path]);
  if (!saved || !stored || stored.path !== path || !stored.content || hash(Buffer.from(stored.content, 'base64')) !== fileSha256)
    throw Error('qa_coordinated_storage_readback_failed');
  return { file: path, fileSha256 };
}

async function publishRevision(revision: number, previous?: number) {
  const attachment = await prepareObject(revision);
  const manifest: Manifest = { id: 'revision-' + revision, revision, ...attachment };
  const head = { id: 'head', revision };
  await db.transact([
    db.tx.add(intake, makeRows(intakeKeys, revision)),
    db.tx.add(publisher, makeRows(publishKeys, revision)),
    db.tx.add(control, [manifest]),
    previous === undefined
      ? db.tx.add(control, [head])
      : db.tx.update(control, [{ id: 'head', if: { revision: previous }, record: head }]),
  ]);
}

async function currentManifest() {
  const [head] = await db.get<{ revision: number }>(control, ['head'], { consistent: true });
  if (!head) throw Error('qa_coordinated_missing_head');
  const [manifest] = await db.get<Manifest>(control, ['revision-' + head.revision], { consistent: true });
  if (!manifest || manifest.revision !== head.revision) throw Error('qa_coordinated_missing_manifest');
  return manifest;
}

async function copyPinned(manifest: Manifest, afterFirstPage?: () => Promise<void>) {
  const rows: Row[] = [];
  let pages = 0;
  for (const [table, names] of [[intake, intakeKeys], [publisher, publishKeys]] as const) {
    for (let offset = 0; offset < names.length; offset += 2) {
      const keys = names.slice(offset, offset + 2);
      const batch = await db.get<Row>(table, keys.map(name => manifest.revision + '-' + name), { consistent: true });
      if (batch.length !== keys.length || batch.some((row, index) => row?.name !== keys[index] || row.revision !== manifest.revision))
        throw Error('qa_coordinated_mixed_rows');
      rows.push(...batch.flatMap(row => row ? [row] : []));
      if (++pages === 1 && afterFirstPage) await afterFirstPage();
    }
  }
  const [object] = await storage.read([manifest.file]);
  if (!object || object.path !== manifest.file || !object.content || hash(Buffer.from(object.content, 'base64')) !== manifest.fileSha256)
    throw Error('qa_coordinated_wrong_object');
  const fileRevision = JSON.parse(Buffer.from(object.content, 'base64').toString('utf8')).revision;
  if (fileRevision !== manifest.revision) throw Error('qa_coordinated_mixed_file');
  return { revision: manifest.revision, rows: rows.length, pages, files: 1, fileSha256: manifest.fileSha256, records: rows, content: object.content };
}

export async function motorCoordinatedBackupProof() {
  const [prior] = await db.get<Receipt>(control, ['proof'], { consistent: true });
  if (prior) return json({ ok: true, replay: true, ...prior });
  const [claimed] = await db.tx.add(control, [{ id: 'run' }]);
  if (!claimed) return json({ ok: false, state: 'already_claimed' });

  await publishRevision(1);
  const pinned = await currentManifest();
  const original = await copyPinned(pinned, () => publishRevision(2, 1));
  const latest = await copyPinned(await currentManifest());
  const restoredPath = prefix + 'restore/' + original.fileSha256 + '.json';
  const [restoredFile] = await storage.write([{ path: restoredPath, content: original.content, contentType: 'application/json' }]);
  if (!restoredFile) throw Error('qa_coordinated_restore_file_write_failed');
  await db.transact([db.tx.add(restored, original.records)]);
  const restoredRows = await db.get<Row>(restored, original.records.map(row => row.id), { consistent: true });
  const [restoredObject] = await storage.read([restoredPath]);
  if (restoredRows.length !== original.rows || restoredRows.some((row, i) => row?.id !== original.records[i].id || row.revision !== 1) ||
      !restoredObject?.content || hash(Buffer.from(restoredObject.content, 'base64')) !== original.fileSha256)
    throw Error('qa_coordinated_restore_readback_failed');

  let staleRejected = false;
  try {
    await publishRevision(3, 1);
  } catch (cause) {
    if (!isAppDatabaseError(cause) || cause.code !== 'AppDatabaseConditionFailed') throw cause;
    staleRejected = true;
  }
  const [unpublishedManifest] = await db.get<Manifest>(control, ['revision-3'], { consistent: true });
  const [unpublishedRow] = await db.get<Row>(intake, ['3-a'], { consistent: true });
  const orphanInvisible = staleRejected && !unpublishedManifest && !unpublishedRow && (await currentManifest()).revision === 2;

  let corruptedReferenceRejected = false;
  try {
    await copyPinned({ ...pinned, fileSha256: latest.fileSha256 });
  } catch (cause) {
    if (!(cause instanceof Error) || cause.message !== 'qa_coordinated_wrong_object') throw cause;
    corruptedReferenceRejected = true;
  }
  const previousBytesPreserved = original.fileSha256 !== latest.fileSha256 && original.revision === 1 && latest.revision === 2;
  if (!orphanInvisible || !corruptedReferenceRejected || !previousBytesPreserved || original.rows !== 5 || original.pages !== 3)
    throw Error('qa_coordinated_proof_mismatch');
  const receipt: Receipt = { id: 'proof', firstRevision: original.revision, currentRevision: latest.revision,
    rows: original.rows, pages: original.pages, files: original.files, previousBytesPreserved, orphanInvisible, corruptedReferenceRejected, restoredRevision: original.revision };
  const [saved] = await db.tx.add(control, [receipt]);
  if (!saved) throw Error('qa_coordinated_receipt_missing');
  return json({ ok: true, replay: false, ...receipt });
}
