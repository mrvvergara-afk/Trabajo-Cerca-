import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
const s=readFileSync(new URL('../appdeploy_staging/snapshot/backend/public-feed.ts',import.meta.url),'utf8');
test('summary reads immutable manifest rather than stale control counters',()=>{
 const summary=s.slice(s.indexOf('export async function readPublicFeedSummary()'),s.indexOf('export async function currentPublicFeedManifest()'));
 assert.match(summary,/readablePublicManifest\(\)/);
 assert.match(summary,/\.\.\.readable\.manifest/);
 assert.doesNotMatch(summary,/\.\.\.current/);
});
test('invalid primary manifest is skipped and last-good pointer attempted',()=>{
 const body=s.slice(s.indexOf('async function readablePublicManifest()'),s.indexOf('export async function readPublicFeedSummary()'));
 assert.match(body,/current\?\.manifestId,lastGood\?\.manifestId/);
 assert.match(body,/Array\.isArray\(record\.pages\)/);
 assert.match(body,/Number\.isSafeInteger\(record\.itemCount\)/);
 assert.match(body,/record\.pages\.length===0 && record\.itemCount!==0/);
});
test('explicit historical cursor never silently switches to another manifest',()=>{
 const body=s.slice(s.indexOf('export async function readPublicFeedPage('),s.indexOf('export async function readPublicFeedItem('));
 assert.match(body,/!cursor\?\.startsWith\('v2:'\)/);
 assert.match(body,/PUBLIC_FEED_RECOVERED_LAST_GOOD/);
});
test('verified offer regression protection remains enabled',()=>{
 assert.match(s,/PUBLIC_FEED_REGRESSION_BLOCKED/);
 assert.match(s,/regressionBlocked:true/);
 assert.match(s,/missingSourceDiagnostics/);
});
