import { db, secrets } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { importReview } from './radar-review-inbox';

const REPO = 'mrvvergara-afk/radar-laboral-motor-c.';
const PATH = 'output/review_queue.json';
const STATUS_ID = 'current';
type Status = { at: string; state: string; githubSha?: string; inserted?: number; duplicates?: number; rejected?: number; detail?: string };
export async function pullMotorCFromGitHub(): Promise<Status> {
  const at = new Date().toISOString();
  let result: Status = { at, state: 'not_started' };
  try {
    const names = await secrets.listSecretNames();
    if (!names.includes('MOTOR_C_GITHUB_READ_TOKEN')) {
      result = { at, state: 'missing_github_read_token' };
    } else {
      const token = await secrets.readSecret('MOTOR_C_GITHUB_READ_TOKEN');
      const url = 'https://api.github.com/repos/' + REPO + '/contents/' + PATH + '?ref=main';
      const response = await fetch(url, {
        headers: {
          authorization: 'Bearer ' + token,
          accept: 'application/vnd.github+json',
          'user-agent': 'TrabajoCerca-MotorC-Pull/1.0',
          'x-github-api-version': '2022-11-28',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) {
        result = { at, state: 'github_http_error', detail: 'http_' + response.status };
      } else {
        const data = await response.json() as { content?: unknown; encoding?: unknown; sha?: unknown; size?: unknown };
        if (data.encoding !== 'base64' || typeof data.content !== 'string' || typeof data.sha !== 'string' ||
            !/^[a-f0-9]{40}$/.test(data.sha) || typeof data.size !== 'number' || data.size > 200000) {
          result = { at, state: 'invalid_github_file_metadata' };
        } else {
          const raw = Buffer.from(data.content.replace(/\s/g, ''), 'base64');
          if (raw.length > 200000 || raw.length !== data.size) {
            result = { at, state: 'github_file_size_mismatch' };
          } else {
            const parsed: unknown = JSON.parse(raw.toString('utf8'));
            const obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
              ? parsed as Record<string, unknown> : {};
            const items = obj.items;
            if (!Array.isArray(items) || items.length > 500 ||
                !items.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
              result = { at, state: 'invalid_review_queue' };
            } else {
              let inserted = 0, duplicates = 0, rejected = 0;
              for (let i = 0; i < items.length; i += 35) {
                const outcome = await importReview({ items: items.slice(i, i + 35) });
                inserted += outcome.inserted;
                duplicates += outcome.duplicates;
                rejected += outcome.rejected;
              }
              result = { at, state: 'import_completed', githubSha: data.sha, inserted, duplicates, rejected };
            }
          }
        }
      }
    }
  } catch (cause) {
    result = { at, state: 'pull_error', detail: cause instanceof Error ? cause.name : 'unknown_error' };
  }
  await db.tx.update('motor_c_github_pull_latest', [{ id: STATUS_ID, record: result }]);
  console.warn('MOTOR_C_GITHUB_PULL ' + JSON.stringify(result));
  return result;
}
