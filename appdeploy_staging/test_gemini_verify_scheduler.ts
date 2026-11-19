import assert from 'node:assert/strict';
import { geminiRetryableReason, nextGeminiVerifyCursor } from './gemini-verify-scheduler.ts';

// A partial scan must re-run within four hours, not after 43/4 x four hours.
assert.equal(nextGeminiVerifyCursor(0,4,43,['duplicate_check_in_progress']),0);
assert.equal(nextGeminiVerifyCursor(8,4,43,['public_duplicate_catalog_unavailable']),8);
assert.equal(nextGeminiVerifyCursor(4,4,43,['public_duplicate_page_unavailable']),4);
assert.equal(nextGeminiVerifyCursor(8,4,43,['duplicate_scan_concurrent_change']),8);
assert.equal(nextGeminiVerifyCursor(0,4,43,[]),4);
assert.equal(nextGeminiVerifyCursor(40,3,43,[]),0);
assert.equal(nextGeminiVerifyCursor(4,4,43,['ambiguous_jobposting']),8);
assert.equal(nextGeminiVerifyCursor(0,0,0,[]),0);
assert.equal(geminiRetryableReason('ambiguous_jobposting'),false);
console.log('GEMINI_PROGRESS_CURSOR_TEST_PASS');
