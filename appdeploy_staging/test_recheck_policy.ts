import assert from "node:assert/strict";
import { bcCheckLimit, pruneResolved, recheckSlots } from "./recheck-policy.ts";

assert.equal(recheckSlots(0), 0);
assert.equal(recheckSlots(2), 2);
assert.equal(recheckSlots(20), 4);
assert.equal(recheckSlots(144), 8);
assert.equal(recheckSlots(144, 6), 4);

assert.equal(bcCheckLimit(0), 0);
assert.equal(bcCheckLimit(1), 1);
assert.equal(bcCheckLimit(100), 12);
assert.equal(bcCheckLimit(100, 40), 24);

const resolved: Record<string, { state: string }> = {};
for (let i = 0; i < 20; i += 1) resolved["closed" + i] = { state: "closed" };
for (let i = 0; i < 5; i += 1) resolved["pending" + i] = { state: "needs_source_evidence" };
resolved["blocked0"] = { state: "blocked" };
const pruned = pruneResolved(resolved, 10);
assert.equal(Object.keys(pruned).filter((key) => key.startsWith("pending")).length, 5);
assert.equal(Object.keys(pruned).filter((key) => key.startsWith("blocked")).length, 1);
assert.equal(Object.keys(pruned).filter((key) => key.startsWith("closed")).length, 10);

console.log("RECHECK_POLICY_TESTS_OK");