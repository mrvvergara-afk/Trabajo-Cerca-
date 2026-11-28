import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('.ts') && specifier.startsWith('.') && !specifier.endsWith('.ts'))
      return next(specifier + '.ts', context);
    return next(specifier, context);
  },
});
const { observeVisibleJobs } = await import('./notification-visible-offers.ts');
const { offerRetentionReason } = await import('./offer-retention.ts');
test.after(() => hooks.deregister());

const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
const functions = stripTypeScriptTypes(
  source.slice(source.indexOf('async function runNotificationSweep()'), source.indexOf('function projectFeedListing')) +
  source.slice(source.indexOf('async function getNotificationPreference('), source.indexOf('async function saveNotificationPreference(')),
);
const handlers = new Function('db', 'notifications', 'readPublicFeedSummary', 'readPublicFeedPage', 'writeSingleRecord',
  'observeVisibleJobs', 'offerRetentionReason', 'notificationPreferenceMatches', 'Date', functions +
  'return {runNotificationSweep,getNotificationPreference};');

const date = localTime => '2026-11-27T' + localTime + '-03:00';
function listing(overrides = {}) {
  return { id:'rigger-original', kind:'job_offer', active:true, verified:true, review:false, title:'Rigger - Angol',
    company:'Empresa de grúas', workCommunes:['Angol'], tags:['rigger'],
    url:'https://www.chiletrabajos.cl/trabajo/rigger-angol-3940244',
    firstVerifiedAt:date('16:10:00'), createdAt:date('16:05:00'), ...overrides };
}
function fixture() {
  let clock = Date.parse(date('16:41:00'));
  let state = { lastRunAt:date('16:11:00'), publicObservations:{} };
  let feed = [];
  let rejectedProvider = true;
  const dispatches = [];
  const checkpoints = new Map();
  const prefs = Array.from({length:500}, (_, index) => ({ userId:'account-'+index, active:true,
    createdAt:date('12:00:00'), communes:['Purén'], keywords:[] }));
  prefs[499].communes = ['Angol'];
  const db = {
    async list(table, {nextToken} = {}) {
      if (table === 'notification_dispatch_state') return { items:[state] };
      const start = Number(nextToken || 0);
      return { items:prefs.slice(start, start + 200), nextToken:start+200 < prefs.length ? String(start + 200) : undefined };
    },
    async get(_table, ids) { return ids.map(id => checkpoints.get(id)); },
    tx: { async update(_table, rows) { for (const row of rows) checkpoints.set(row.id, row.record); return rows.map(() => true); } },
    async add() { return ['log']; },
  };
  const actions = handlers(db, {
    async send(message) {
      dispatches.push(message);
      return rejectedProvider ? { sent:0, failed:1 } : { sent:1, failed:0 };
    },
  }, async () => ({ manifestId:'published-manifest' }), async cursor => {
    assert.equal(cursor, 'v2:published-manifest:0');
    return { items:feed, hasMore:false };
  }, async (_table, record) => { state = record; }, observeVisibleJobs, offerRetentionReason,
  (item, pref) => pref.communes.some(city => item.workCommunes.includes(city)) &&
    (!pref.keywords.length || pref.keywords.some(word => item.title.toLowerCase().includes(word))), class extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
  });
  return { ...actions, dispatches, publish: offers => { feed = offers; }, allowDelivery: () => { rejectedProvider = false; },
    tick: () => { clock += 30 * 60 * 1000; } };
}

test('the account lookup reaches a valid preference on the third page', async () => {
  const f = fixture();
  assert.equal((await f.getNotificationPreference('account-499'))?.userId, 'account-499');
  assert.equal(await f.getNotificationPreference('unregistered'), undefined);
});

test('an offer that becomes public after the verification sweep gets one accepted Angol alert', async () => {
  const f = fixture();
  assert.equal((await f.runNotificationSweep()).sent, 0);
  f.tick();
  f.publish([listing(), listing({id:'rigger-copy', url:'https://www.chiletrabajos.cl/trabajo/3940244'}),
    listing({ id:'unapproved', verified:false, url:undefined })]);
  const first = await f.runNotificationSweep();
  assert.equal(first.checkedAccounts, 500);
  assert.equal(first.matchedUsers, 1);
  assert.equal(first.pending, 1);
  assert.equal(first.sent, 0);
  assert.equal(f.dispatches[0].data.count, '1');

  f.tick();
  f.allowDelivery();
  assert.equal((await f.runNotificationSweep()).sent, 1);
  assert.deepEqual(f.dispatches[1].userIds, ['account-499']);
  assert.match(f.dispatches[1].notification.body, /Rigger - Angol/);

  f.tick();
  f.publish([listing({id:'rigger-copy', url:'https://www.chiletrabajos.cl/trabajo/3940244'})]);
  assert.equal((await f.runNotificationSweep()).matchedUsers, 0);
  assert.equal(f.dispatches.length, 2);
});

test('introducing public observations preserves the legacy eligibility of already visible offers', () => {
  const now = Date.parse(date('17:00:00'));
  const floor = now - 48 * 3600000;
  const before = observeVisibleJobs([listing()], undefined, now, floor);
  assert.equal(before.offers[0].at, Date.parse(date('16:10:00')));
  const after = observeVisibleJobs([listing()], before.observations, now + 1, floor);
  assert.equal(after.offers[0].at, before.offers[0].at);
});
