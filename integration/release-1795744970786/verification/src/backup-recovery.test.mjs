import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !specifier.endsWith('.ts'))
    return next(specifier + '.ts', context);
  return next(specifier, context);
} });
const { advanceBackup, backupFailure, checkBackupRun, newBackupRun } = await import('./backup-runner.ts');
const { rehearseRestore } = await import('./restore-rehearsal.ts');
test.after(() => hooks.deregister());
const revision = 'application-backup-v3';
const password = 'synthetic-fixture-only';
const table = 'fast_bc_documents_v1';
const rows = [
  { id: 'same-logical-id', __appdeploy_ddb_id: 'row-a', status: 'resolved' },
  { id: 'same-logical-id', __appdeploy_ddb_id: 'row-b', status: 'deferred' },
];
const path = 'evidence/fixture.png';

function reader(body) {
  if (body.kind === 'scope') return { kind: 'scope', revision, tables: [table] };
  assert.equal(body.revision, revision);
  if (body.kind === 'table') return { kind: 'table', revision, table, items: [rows[body.cursor ? 1 : 0]], nextToken: body.cursor ? null : 'second' };
  if (body.kind === 'storage') return { kind: 'storage', revision, paths: [path] };
  return { kind: 'file', revision, path, content: 'AAECAw==' };
}

test('a source version change aborts pagination without advancing the encrypted checkpoint', async () => {
  let run = await advanceBackup(await newBackupRun(password), reader);
  run = await advanceBackup(run, reader);
  assert.equal(run.cursor, 'second');
  await assert.rejects(advanceBackup(run, body => ({ ...reader(body), revision: undefined })), cause => {
    assert.equal(backupFailure(cause).resumable, false);
    return cause.message === 'backup_revision_changed';
  });
  assert.equal(run.cursor, 'second');
  assert.equal(run.envelope.parts.length, 1);
});

test('a paginated encrypted backup restores physical IDs and its attachment in the isolated store', async () => {
  let run = await newBackupRun(password);
  while (run.phase !== 'complete') run = await advanceBackup(run, reader);
  const summary = await checkBackupRun(run, password);
  assert.deepEqual(summary, { tables: 1, records: 2, files: 1, platformRestoreTested: false });
  const recovered = [];
  const report = await rehearseRestore(JSON.stringify(run.envelope), password, { createStore: async () => ({
    write: async items => recovered.push(...items), read: async (start, count) => recovered.slice(start, start + count),
    dispose: async () => { recovered.length = 0; },
  }) });
  assert.equal(report.comparedElements, 3);
  assert.equal(report.mismatches, 0);
  assert.equal(report.temporaryStoreDeleted, true);
});
