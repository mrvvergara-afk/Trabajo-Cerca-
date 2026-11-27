import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const scopedTables = [
  'growth_house_autonomy', 'growth_house_versions', 'growth_house_organic_metrics',
  'growth_house_organic_effects', 'municipal_open_recheck_state', 'territory_repair_audit',
];
const readCalls = [];
globalThis.backupTestSdk = {
  db: {
    async list(table, options) {
      readCalls.push({ table, options });
      return { items: [{ id: 'current', __appdeploy_ddb_id: table + ':current', synthetic: true }] };
    },
  },
};
const mockModule = 'data:text/javascript,' + encodeURIComponent(`
  export const { db } = globalThis.backupTestSdk;
  export const storage = {};
  export const isAppDatabaseError = () => false;
  export const json = (data, status = 200) => ({ status, data });
  export const error = (message, status) => json({ message }, status);
`);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@appdeploy/sdk') return { url: mockModule, shortCircuit: true };
    return next(specifier, context);
  },
});
const { adminBackupPage } = await import('./admin-backup.ts');
test.after(() => hooks.deregister());

test('the enlarged backup scope exports the six application tables by physical key and excludes the credential table', async () => {
  const scope = await adminBackupPage({ body: { kind: 'scope' } });
  const { revision, tables } = scope.data;
  assert.equal(revision, 'application-backup-v4');
  assert.equal(scope.data.fullPlatformBackup, false);
  for (const table of scopedTables) {
    assert.ok(tables.includes(table), table);
    const page = await adminBackupPage({ body: { kind: 'table', table, revision } });
    assert.equal(page.status, 200);
    assert.equal(page.data.revision, revision);
    assert.equal(page.data.items[0].__appdeploy_ddb_id, table + ':current');
    assert.match(page.headers['Cache-Control'], /no-store/);
  }
  assert.ok(!tables.includes('growth_house_metricool'));
  assert.equal((await adminBackupPage({ body: { kind: 'table', table: 'growth_house_metricool', revision } })).status, 400);
  assert.equal((await adminBackupPage({ body: { kind: 'table', table: scopedTables[0], revision: 'application-backup-v3' } })).status, 409);
  assert.deepEqual(readCalls.map(call => call.table), scopedTables);
  assert.ok(readCalls.every(call => call.options.appdeploy_system_id === true));
});
