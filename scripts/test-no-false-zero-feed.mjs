// Run: node --test scripts/test-no-false-zero-feed.mjs
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
const patch=readFileSync(new URL('../appdeploy_staging/patches/no-false-zero-feed.patch',import.meta.url),'utf8');
test('patch targets the actual public endpoint and retains staged fallback',()=>{
 assert.match(patch,/Update File: backend\/index\.ts/);
 assert.match(patch,/if\(staged && staged\.items\.length\) return json\(staged\)/);
});
test('no empty catalog is fabricated when manifest is missing',()=>{
 assert.match(patch,/\+      return error\(.+503\)/);
 assert.match(patch,/\+      console\.warn\('PUBLIC_FEED_UNAVAILABLE/);
 assert.doesNotMatch(patch,/^\+.*totalItems:visible\.length/m);
});
