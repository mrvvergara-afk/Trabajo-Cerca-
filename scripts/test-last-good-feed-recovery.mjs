import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
const s=readFileSync(new URL('../appdeploy_staging/snapshot/backend/public-feed.ts',import.meta.url),'utf8');
test('backup is persisted before switching live manifest pointer',()=>{
 const backup=s.indexOf("await replaceSingle('public_feed_last_good', { manifestId, ...summary })");
 const live=s.indexOf("await replaceSingle('public_feed_control', { ...fields, ...summary, manifestId })");
 assert.ok(backup>0 && live>backup);
});
test('missing live pointer uses last-good backup',()=>{
 assert.match(s,/if \(!manifestId\) manifestId = \(await single<Control>\('public_feed_last_good'\)\)\?\.manifestId/);
});
test('last-good backup is not sourced from private source tables',()=>{
 const segment=s.slice(s.indexOf('export async function readPublicFeedPage('));
 assert.match(segment,/db\.get<Manifest>\('public_feed_manifests'/);
 assert.match(segment,/db\.get<\{ entries:Entry\[\] \}>\('public_feed_versions'/);
});
