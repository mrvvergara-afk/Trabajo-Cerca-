import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
const s=readFileSync(new URL('../appdeploy_staging/snapshot/backend/public-feed.ts',import.meta.url),'utf8');
test('backup is persisted before switching live manifest pointer',()=>{
 const backup=s.indexOf("await replaceSingle('public_feed_last_good', { manifestId:backupId, ...summary })");
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

test('backup points to previous immutable manifest when available',()=>{
 assert.match(s,/const backupId=previous\?\.manifestId \|\| manifestId/);
});
test('reader retries previous manifest if primary manifest missing',()=>{
 assert.match(s,/PUBLIC_FEED_RECOVERED_LAST_GOOD/);
 assert.match(s,/if \(!current && !cursor\?\.startsWith\('v2:'\)\)/);
});

test('missing primary leaf can recover from previous immutable leaf',()=>{
 assert.match(s,/reason:'primary_page_missing'/);
 assert.match(s,/if \(ref && !leaf && !cursor\?\.startsWith\('v2:'\)\)/);
 assert.match(s,/if \(backup && backupRef && backupLeaf\)/);
});
