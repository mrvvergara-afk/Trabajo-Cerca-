import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
const route = source.match(/'POST \/api\/notifications\/test': \[requireAuth\(\), publicQuota\('notification-test',2,3600000,10\), async \(ctx\) => \{([\s\S]*?)\n  \}\],/);
assert.ok(route, 'La ruta de prueba conserva sesión y cuota');
const handler = stripTypeScriptTypes(`async function handle(ctx, getNotificationPreference, notifications, json, error, console) {${route[1]}\n}`);
const handle = new Function(handler + '\nreturn handle;')();
const testId = 'a09c564a-9801-4c3f-9d21-66a1f09c6068';

async function send(body, active = true) {
  const messages = [];
  const logs = [];
  const response = await handle(
    { body, user: { userId: 'qa-user' } },
    async () => ({ active }),
    { async send(message) { messages.push(message); return { sent: 1, failed: 0 }; } },
    data => ({ status: 200, data }),
    (message, status) => ({ status, message }),
    { warn: message => logs.push(message) },
  );
  return { messages, response, logs };
}

test('notification route preserves the diagnostic ID only in the push payload', async () => {
  const result = await send({ testId });
  assert.deepEqual(result.messages[0].data, { kind: 'notification_test', testId });
  assert.deepEqual(result.messages[0].userIds, ['qa-user']);
  assert.deepEqual(result.response.data, { sent: 1, failed: 0 });
  assert.doesNotMatch(result.logs.join(' '), new RegExp(testId));
  const legacy = await send(undefined);
  assert.deepEqual(legacy.messages[0].data, { kind: 'notification_test' });
});

test('notification route rejects malformed IDs and requires active alerts', async () => {
  for (const body of [{ testId: 'bad' }, { testId: testId + '\n' }, { testId: { id: testId } }]) {
    const result = await send(body);
    assert.equal(result.response.status, 400);
    assert.deepEqual(result.messages, []);
  }
  const inactive = await send({ testId }, false);
  assert.equal(inactive.response.status, 400);
  assert.deepEqual(inactive.messages, []);
});
