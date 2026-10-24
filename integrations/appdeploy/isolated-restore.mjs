import { stripTypeScriptTypes } from 'node:module';
import { readFileSync, mkdtempSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const cryptoSource = stripTypeScriptTypes(readFileSync(new URL('./backup-crypto.ts', import.meta.url), 'utf8'));
const { verifyEncryptedBackup } = await import('data:text/javascript;base64,' + Buffer.from(cryptoSource).toString('base64'));
const hash = value => createHash('sha256').update(value).digest('hex');
const SOURCE_APP = 'trabajo-cerca-laboratorio-3ojgro';

// Prepare the entire plan before touching any destination. No SDK/network imports.
export async function prepareRestorePlan(text, password) {
  const tables = new Map();
  const files = new Map();
  let confirmed = false;
  let totalBytes = 0;
  const summary = await verifyEncryptedBackup(text, password, async block => {
    totalBytes += Buffer.byteLength(JSON.stringify(block));
    if (totalBytes > 50000000) throw Error('restore_budget');
    if (block.kind === 'manifest') {
      if (block.appId !== SOURCE_APP) throw Error('foreign_source');
      confirmed = true;
    } else if (block.kind === 'table') {
      if (!tables.has(block.table)) tables.set(block.table, []);
      tables.get(block.table).push(...block.items);
    } else if (block.kind === 'file') files.set(block.path, block.content);
  });
  if (!confirmed || summary.records > 50000) throw Error('invalid_source');
  const units = [];
  for (const [table, rows] of tables) {
    units.push({ kind: 'table', table }); // Preserve empty tables too.
    for (const record of rows) units.push({ kind: 'record', table, id: record.id, record });
  }
  for (const [path, content] of files) units.push({ kind: 'file', path, content });
  const entries = units.map(unit => {
    const text = JSON.stringify(unit);
    return { key: hash(JSON.stringify([unit.kind, unit.table ?? null, unit.id ?? unit.path ?? null])), text, sha256: hash(text) };
  });
  if (new Set(entries.map(entry => entry.key)).size !== entries.length) throw Error('duplicate_target_key');
  return { sourceApp: SOURCE_APP, sourceSha256: hash(text), summary, entries };
}

// Only a temporary local SQLite destination exists. There is no AppDeploy adapter.
// All payloads at rest are encrypted with a fresh key that is never saved.
export function createTemporaryRestoreTarget() {
  const directory = mkdtempSync(join(tmpdir(), 'tc-isolated-restore-'));
  chmodSync(directory, 0o700);
  const path = join(directory, 'restore.sqlite');
  const key = randomBytes(32);
  let db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec('PRAGMA journal_mode=MEMORY; CREATE TABLE units (key TEXT PRIMARY KEY, iv BLOB NOT NULL, tag BLOB NOT NULL, payload BLOB NOT NULL)');
  let disposed = false;
  function saveEntry(entry, replace) {
    if (disposed) throw Error('target_closed');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(entry.key));
    const payload = Buffer.concat([cipher.update(entry.text, 'utf8'), cipher.final()]);
    if (replace) {
      const result = db.prepare('UPDATE units SET iv = ?, tag = ?, payload = ? WHERE key = ?').run(iv, cipher.getAuthTag(), payload, entry.key);
      if (Number(result.changes) !== 1) throw Error('missing_target_unit');
    } else db.prepare('INSERT INTO units VALUES (?, ?, ?, ?)').run(entry.key, iv, cipher.getAuthTag(), payload);
  }
  return {
    identity: { kind: 'temporary-local-sqlite', sourceApp: SOURCE_APP, sideEffectsDisabled: true },
    count() { return Number(db.prepare('SELECT count(*) AS n FROM units').get().n); },
    write(entry) { saveEntry(entry, false); },
    replace(entry) { saveEntry(entry, true); },
    remove(entryKey) {
      if (disposed) throw Error('target_closed');
      return Number(db.prepare('DELETE FROM units WHERE key = ?').run(entryKey).changes);
    },
    reopen() { db.close(); db = new DatabaseSync(path); },
    read(entryKey) {
      const row = db.prepare('SELECT * FROM units WHERE key = ?').get(entryKey);
      if (!row) throw Error('missing_target_unit');
      const decipher = createDecipheriv('aes-256-gcm', key, row.iv);
      decipher.setAAD(Buffer.from(entryKey));
      decipher.setAuthTag(row.tag);
      return Buffer.concat([decipher.update(row.payload), decipher.final()]).toString('utf8');
    },
    transaction(operation) {
      db.exec('BEGIN IMMEDIATE');
      try { operation(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    dispose() {
      if (disposed) return;
      db.close();
      rmSync(directory, { recursive: true });
      key.fill(0);
      disposed = true;
    }
  };
}

export function restorePreparedPlan(plan, target) {
  if (target.identity?.kind !== 'temporary-local-sqlite' || target.identity?.sideEffectsDisabled !== true) throw Error('unsafe_target');
  if (target.count() !== 0) throw Error('target_not_empty');
  for (const entry of plan.entries) if (hash(entry.text) !== entry.sha256) throw Error('plan_changed');
  target.transaction(() => { for (const entry of plan.entries) target.write(entry); });
  target.reopen();
  if (target.count() !== plan.entries.length) throw Error('target_count_mismatch');
  for (const entry of plan.entries) if (hash(target.read(entry.key)) !== entry.sha256) throw Error('target_payload_mismatch');
  return {
    schema: 'trabajo-cerca.isolated-sqlite-restore.v1', checkedAt: new Date().toISOString(),
    ...plan.summary, sourceSha256: plan.sourceSha256,
    comparedUnits: plan.entries.length, mismatches: 0, durableReopenTested: true,
    payloadsEncryptedAtRest: true, networkRequests: 0, productionWrites: 0,
    platformRestoreTested: false, authenticatedFlowsTested: false
  };
}
