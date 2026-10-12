import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const code = stripTypeScriptTypes(readFileSync(new URL('../integrations/appdeploy/verification-schedule.ts',import.meta.url),'utf8'),{ mode:'strip' }).replace(/^export /gm,'');
const context = vm.createContext({ Intl,Date });
vm.runInContext(code,context);
const event = scheduledTime => ({ type:'cron',name:'verify-publish',scheduledTime });

test('Quarter-hour persistence preserves exactly the seven original provider-capable slots', () => {
  const slots = [];
  for (let hour=0; hour<24; hour++) for (const minute of [5,20,35,50]) {
    const timestamp = new Date(Date.UTC(2026,9,12,hour,minute)).toISOString();
    if (context.isOriginalVerificationSlot(event(timestamp))) slots.push(timestamp);
  }
  assert.equal(slots.length,7);
  assert.ok(slots.every(value => value.includes(':35:')));
});

test('Scheduled time controls provider work even when the invocation arrives late', () => {
  const value = { ...event('2026-10-12T12:35:00Z'), invokedTime:'2026-10-12T13:10:00Z' };
  assert.equal(context.isOriginalVerificationSlot(value),true);
  assert.equal(context.isOriginalVerificationSlot(event('2026-10-12T12:20:00Z')),false);
});

test('A missing, invalid or unrelated context never triggers provider-capable work', () => {
  for (const value of [undefined,event('bad-time'),{ ...event('2026-10-12T12:35:00Z'),name:'other' },
    { ...event('2026-10-12T12:35:00Z'),type:'manual' }]) assert.equal(context.isOriginalVerificationSlot(value),false);
});
