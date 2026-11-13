import assert from "node:assert/strict";
import { isTransientDbError, safeDbWrite, withDbRetry } from "./db-resilience.ts";

const noSleep = async (_ms: number) => {};
let calls = 0;
const value = await withDbRetry(async () => {
  calls += 1;
  if (calls < 3) throw new Error("AppDatabaseGatewayUnavailable");
  return "ok";
}, { attempts: 4, baseMs: 1, sleep: noSleep, label: "test" });
assert.equal(value, "ok");
assert.equal(calls, 3);

let validationCalls = 0;
await assert.rejects(
  withDbRetry(async () => {
    validationCalls += 1;
    throw new Error("invalid_payload");
  }, { attempts: 4, sleep: noSleep }),
  /invalid_payload/,
);
assert.equal(validationCalls, 1, "validation errors must not be retried");

let exhaustion = 0;
await assert.rejects(
  withDbRetry(async () => {
    exhaustion += 1;
    const error = new Error("gateway down");
    (error as { status?: number }).status = 503;
    throw error;
  }, { attempts: 3, baseMs: 1, sleep: noSleep }),
  /gateway down/,
);
assert.equal(exhaustion, 3);

assert.equal(isTransientDbError({ status: 503 }), true);
assert.equal(isTransientDbError(new Error("AppDatabaseGatewayUnavailable")), true);
assert.equal(isTransientDbError(new Error("duplicate_id")), false);

const safe = await safeDbWrite(async () => {
  throw new Error("AppDatabaseGatewayUnavailable");
}, { attempts: 2, baseMs: 1, sleep: noSleep });
assert.equal(safe.ok, false);

console.log("DB_RESILIENCE_TESTS_OK");