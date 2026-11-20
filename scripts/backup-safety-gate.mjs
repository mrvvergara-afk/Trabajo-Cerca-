/**
 * Trabajo Cerca — offline integrity gate for administrative backup exports.
 * No network, no AppDeploy credentials, no database writes, no output of
 * stored records. Exercise with synthetic data only in CI.
 *
 * This is NOT an atomic database backup, and an in-memory replay is NOT a
 * platform restore. A real restore receipt from an isolated environment
 * remains mandatory before production release.
 */
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const hash = value => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

export function exportPageHash(page) {
  const p = page || {};
  return hash({ kind: p.kind, table: p.table ?? null,
    items: p.items ?? null, paths: p.paths ?? null,
    nextToken: p.nextToken ?? null });
}

function validPath(value) {
  return typeof value === 'string' && value.length < 1024 &&
    !value.startsWith('/') && !value.includes('\\') &&
    value.split('/').every(segment => segment && segment !== '.' && segment !== '..');
}
function ensure(condition, message) {
  if (!condition) throw new Error('Backup validation: ' + message);
}
function pageChain(pages, kind, name) {
  ensure(Array.isArray(pages) && pages.length > 0,
    name + ': missing pages');
  const cursors = new Set();
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    ensure(page && page.kind === kind, name + ': incorrect kind');
    if (kind === 'table')
      ensure(page.table === name, name + ': wrong table');
    else ensure(page.table === undefined, name + ': storage table field');
    const values = kind === 'table' ? page.items : page.paths;
    ensure(Array.isArray(values) && values.length <= 5,
      name + ': invalid batch size (endpoint limit 5)');
    ensure(/^[a-f0-9]{64}$/.test(page.sha256 ?? '') &&
      page.sha256 === exportPageHash(page), name + ': checksum mismatch');
    const token = page.nextToken ?? null;
    if (index === pages.length - 1) {
      ensure(token === null, name + ': final cursor not exhausted');
    } else {
      ensure(typeof token === 'string' && token.length > 0 &&
        token.length <= 16000 && !cursors.has(token),
        name + ': cursor gap or loop');
      cursors.add(token);
    }
  }
}

export function auditBackupBundle(bundle) {
  ensure(bundle && bundle.format === 'TC_BACKUP_EVIDENCE_V1',
    'unknown bundle format');
  ensure(bundle.sourceEnvironment === 'isolated_lab',
    'refusing production or unknown environment');
  ensure(bundle.scope?.revision === 'application-backup-v2',
    'scope does not match exporter contract');
  ensure(bundle.scope?.consistency === 'rolling_non_atomic',
    'cannot assume atomic consistency');
  ensure(bundle.scope?.fullPlatformBackup === false &&
    bundle.scope?.restoreValidated === false,
    'unexpected exporter flags; review contract explicitly');
  ensure(Array.isArray(bundle.tables) && bundle.tables.length > 0,
    'missing table inventory');
  ensure(bundle.storage && Array.isArray(bundle.storage.pages),
    'missing storage inventory');
  const tableNames = new Set();
  const reconstructed = new Map();
  let records = 0;
  for (const table of bundle.tables) {
    ensure(table && typeof table.name === 'string' &&
      /^[a-z][a-z0-9_]{0,95}$/.test(table.name) &&
      !tableNames.has(table.name), 'duplicate or invalid table name');
    tableNames.add(table.name);
    pageChain(table.pages, 'table', table.name);
    const restored = new Map();
    for (const page of table.pages) for (const item of page.items) {
      ensure(item && typeof item === 'object' && !Array.isArray(item) &&
        typeof item.id === 'string' && item.id.length > 0 &&
        !restored.has(item.id), table.name + ': record id absent or duplicate');
      restored.set(item.id, structuredClone(item));
      records++;
    }
    reconstructed.set(table.name, restored);
  }
  pageChain(bundle.storage.pages, 'storage', 'storage');
  const paths = new Set();
  for (const page of bundle.storage.pages) for (const path of page.paths) {
    ensure(validPath(path) && !paths.has(path),
      'invalid or duplicate storage path');
    paths.add(path);
  }
  ensure(Array.isArray(bundle.storage.files), 'missing storage files');
  const files = new Map();
  for (const f of bundle.storage.files) {
    ensure(f && validPath(f.path) && paths.has(f.path) &&
      !files.has(f.path) && typeof f.content === 'string' &&
      typeof f.sha256 === 'string' &&
      createHash('sha256').update(f.content).digest('hex') === f.sha256,
      'missing or corrupt stored file');
    files.set(f.path, f.content);
  }
  ensure(files.size === paths.size, 'file inventory missing content');
  // Replay all JSON and files into ephemeral memory only, never a live DB.
  for (const table of bundle.tables) {
    const expected = table.pages.flatMap(page => page.items);
    const recreated = [...reconstructed.get(table.name).values()];
    ensure(hash(recreated) === hash(expected),
      table.name + ': in-memory replay mismatch');
  }
  return {
    structuralIntegrity: true,
    inMemoryReplayVerified: true,
    tableCount: reconstructed.size,
    recordCount: records,
    fileCount: files.size,
    platformRestoreVerified: false,
    backupAtomic: false,
    productionReady: false,
    blockingReasons: [
      'Exporter is rolling_non_atomic, not a platform snapshot',
      'Authenticated full export not yet inspected',
      'No restore to a second isolated real database has been verified',
      'No independent encrypted off-platform backup has been proven',
    ],
  };
}

function synthetic() {
  const page = { kind: 'table', table: 'tc_local_directory_v1',
    items: [{ id: 'local_fixture_0001', kind: 'business',
      title: 'LAB ficticio', status: 'pending', commune: 'Collipulli' }],
    nextToken: null };
  page.sha256 = exportPageHash(page);
  const storage = { kind: 'storage', paths: [], nextToken: null };
  storage.sha256 = exportPageHash(storage);
  return {
    format: 'TC_BACKUP_EVIDENCE_V1',
    sourceEnvironment: 'isolated_lab',
    scope: { revision: 'application-backup-v2',
      consistency: 'rolling_non_atomic', fullPlatformBackup: false,
      restoreValidated: false },
    tables: [{ name: 'tc_local_directory_v1', pages: [page] }],
    storage: { pages: [storage], files: [] },
  };
}

export function selfTest() {
  const good = synthetic();
  const result = auditBackupBundle(good);
  assert.equal(result.structuralIntegrity, true);
  assert.equal(result.inMemoryReplayVerified, true);
  assert.equal(result.productionReady, false);
  assert.equal(result.recordCount, 1);
  console.log('PASS synthetic backup integrity and in-memory replay');
  const badChecksum = structuredClone(good);
  badChecksum.tables[0].pages[0].items[0].title = 'tampered';
  assert.throws(() => auditBackupBundle(badChecksum), /checksum mismatch/);
  console.log('PASS tampered data is rejected');
  const missingPage = structuredClone(good);
  missingPage.tables[0].pages[0].nextToken = 'unfinished';
  missingPage.tables[0].pages[0].sha256 =
    exportPageHash(missingPage.tables[0].pages[0]);
  assert.throws(() => auditBackupBundle(missingPage), /final cursor/);
  console.log('PASS incomplete pagination is rejected');
  const duplicate = structuredClone(good);
  duplicate.tables[0].pages[0].items.push(
    structuredClone(duplicate.tables[0].pages[0].items[0]));
  duplicate.tables[0].pages[0].sha256 =
    exportPageHash(duplicate.tables[0].pages[0]);
  assert.throws(() => auditBackupBundle(duplicate), /duplicate/);
  console.log('PASS duplicate records are rejected');
  const missingAsset = structuredClone(good);
  missingAsset.storage.pages[0].paths = ['illustrations/fake.jpg'];
  missingAsset.storage.pages[0].sha256 =
    exportPageHash(missingAsset.storage.pages[0]);
  assert.throws(() => auditBackupBundle(missingAsset), /missing content/);
  console.log('PASS missing storage content is rejected');
  const wrongSource = structuredClone(good);
  wrongSource.sourceEnvironment = 'production';
  assert.throws(() => auditBackupBundle(wrongSource), /refusing production/);
  console.log('PASS production backup is not accepted for a LAB-only drill');
  console.log('LAB_DR_GATE', JSON.stringify({
    syntheticChecksPassed: 6,
    structuralIntegrity: true, inMemoryReplayVerified: true,
    actualPlatformRestoreVerified: false,
    productionReady: false,
    realUserDataProcessed: false,
  }));
}

if (process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--self-test') {
    selfTest();
  } else if (process.argv[2] === '--verify-file') {
    // Optional local use with an authorized export supplied by the operator.
    // Never print original records or back them up in this repository.
    const path = process.argv[3];
    if (!path) throw Error('Local bundle path required');
    const data = JSON.parse(await readFile(path, 'utf8'));
    console.log('LAB_DR_GATE', JSON.stringify(auditBackupBundle(data)));
  } else {
    throw Error('Use --self-test or --verify-file <local file>');
  }
}
