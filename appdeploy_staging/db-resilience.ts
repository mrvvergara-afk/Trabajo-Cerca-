/**
 * Bounded retry for AppDeploy SDK database calls.
 *
 * The platform can return AppDatabaseGatewayUnavailable / HTTP 503 during
 * transient gateway failures.  Retrying is only safe for idempotent operations:
 * deterministic record IDs, updates, deletes, reads and transactions whose
 * writes use deterministic IDs.  Never blind-retry an auto-ID insert.
 */

export type DbOperation<T> = () => Promise<T>;

export type RetryOptions = {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  label?: string;
  sleep?: (ms: number) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
};

const TRANSIENT =
  /AppDatabaseGatewayUnavailable|(?:^|\D)503(?:\D|$)|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|gateway timeout|temporarily unavailable|service unavailable/i;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message + " " + String((error as { code?: unknown }).code ?? "");
  if (error && typeof error === "object") {
    const item = error as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown };
    return [item.message, item.code, item.status, item.statusCode].filter(Boolean).join(" ");
  }
  return String(error ?? "");
}

export function isTransientDbError(error: unknown): boolean {
  const text = messageOf(error);
  if (TRANSIENT.test(text)) return true;
  if (error && typeof error === "object") {
    const item = error as { code?: unknown; status?: unknown; statusCode?: unknown };
    if (Number(item.status) === 503 || Number(item.statusCode) === 503 || String(item.code) === "503") return true;
  }
  return false;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withDbRetry<T>(operation: DbOperation<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.trunc(options.attempts ?? 5));
  const baseMs = Math.max(1, Math.trunc(options.baseMs ?? 500));
  const maxMs = Math.max(baseMs, Math.trunc(options.maxMs ?? 8000));
  const sleep = options.sleep ?? defaultSleep;
  const shouldRetry = options.shouldRetry ?? isTransientDbError;
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      last = error;
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      const exponential = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const delay = exponential + Math.floor(Math.random() * Math.max(1, Math.floor(baseMs / 2)));
      console.warn("DB_GATEWAY_RETRY " + JSON.stringify({
        label: options.label ?? "db",
        attempt,
        attempts,
        delayMs: delay,
        error: messageOf(error).slice(0, 220),
      }));
      await sleep(delay);
    }
  }
  throw last;
}

/** Status writes must never turn a recoverable bridge error into an HTTP 503. */
export async function safeDbWrite<T>(operation: DbOperation<T>, options: RetryOptions = {}):
  Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await withDbRetry(operation, options) };
  } catch (error) {
    console.warn("DB_GATEWAY_WRITE_UNPERSISTED " + JSON.stringify({
      label: options.label ?? "db-write",
      error: messageOf(error).slice(0, 240),
    }));
    return { ok: false, error: messageOf(error).slice(0, 240) };
  }
}