import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

registerHooks({ resolve(specifier, context, next) {
  return next(specifier === './backup-crypto' ? './backup-crypto.ts' : specifier, context);
}});
const { advanceBackup, checkBackupRun, newBackupRun } = await import('./backup-runner.ts');
const passphrase = 'fixture-password-long-enough';

async function backup(revision, rows) {
  let run = await newBackupRun(passphrase);
  for (let step = 0; step < 5 && run.phase !== 'complete'; step++) {
    run = await advanceBackup(run, async request => {
      if (request.kind === 'scope') return { kind: 'scope', revision, tables: ['motor_fixture'] };
      if (request.kind === 'table') return {kind: 'table', table: request.table, items: rows};
      if (request.kind === 'storage') return {kind: 'storage', paths: []};
      throw Error('Unexpected fixture request');
    });
  }
  assert.equal(run.phase,'complete');
  return checkBackupRun(run,passphrase);
}

test('v3 accepts repeated logical IDs at distinct physical keys', async () => {
  const rows = [{id:'logical',__appdeploy_ddb_id:'physical-1'}, {id:'logical',__appdeploy_ddb_id:'physical-2'}];
  assert.equal((await backup('application-backup-v3', rows)).records,2);
});

test('v3 fails on duplicate or missing physical keys', async () => {
  await assert.rejects(backup('application-backup-v3',[{id:'logical'}]),/duplicate_id/);
  await assert.rejects(backup('application-backup-v3',[{id:'a',__appdeploy_ddb_id:'key'},{id:'b',__appdeploy_ddb_id:'key'}]),/duplicate_id/);
});

test('legacy v2 copies still verify with logical IDs', async () => {
  assert.equal((await backup('application-backup-v2',[{id:'legacy'}])).records,1);
});

test('an archive claiming v3 cannot present a legacy identity page', async () => {
  const { appendEncrypted, beginEncryptedBackup, verifyEncryptedBackup } = await import('./backup-crypto.ts');
  const { envelope, key } = await beginEncryptedBackup(passphrase);
  await appendEncrypted(envelope, key, { kind:'table',table:'motor_fixture',items:[{id:'logical'}] });
  await appendEncrypted(envelope, key, { kind:'manifest',complete:true,revision:'application-backup-v3',
    tables:[{table:'motor_fixture',count:1}],files:0,parts:1 });
  await assert.rejects(verifyEncryptedBackup(JSON.stringify(envelope),passphrase),/Identidad del manifiesto/);
});
