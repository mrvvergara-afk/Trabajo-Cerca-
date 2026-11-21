/**
 * Independent AppDeploy API health watchdog. Zero writes to AppDeploy.
 * GitHub issue #95 is updated ONLY when two consecutive samples agree.
 */
import { pathToFileURL } from 'node:url';

const APP_API = 'https://api-v2.appdeploy.ai/app/';
export const HEALTH_ISSUE = 95;
export const ENVIRONMENTS = Object.freeze({
  laboratorio: 'trabajo-cerca-lab-aislado-xirg9w',
  oficial: 'trabajo-cerca-laboratorio-3ojgro',
});
export function classifyHttp(httpStatus, json) {
  if (httpStatus === 200 && json && typeof json === 'object' &&
      Array.isArray(json.items)) return { state: 'HEALTHY', code: 'OK', httpStatus };
  if (httpStatus === 402) {
    const code = typeof json?.code === 'string' &&
      /^[A-Z_]{3,70}$/.test(json.code) ? json.code : 'HTTP_402';
    return { state: 'DEGRADED', code, httpStatus };
  }
  return { state: 'DEGRADED', code: httpStatus === 0
    ? 'CONNECTION_FAILURE' : 'HTTP_' + httpStatus, httpStatus };
}
export function stableState(first, second) {
  const keys = Object.keys(ENVIRONMENTS);
  if (keys.some(key => !first[key] || !second[key])) return 'INCONCLUSIVE';
  const unchanged = keys.every(key => first[key].state === second[key].state);
  if (!unchanged) return 'INCONCLUSIVE';
  return keys.every(key => first[key].state === 'HEALTHY') ? 'HEALTHY' : 'DEGRADED';
}
async function probe(appId, request) {
  const url = APP_API + appId + '/api/listings?limit=1';
  try {
    const response = await request(url, {
      method: 'GET', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json', 'User-Agent': 'TrabajoCercaAvailabilityWatch/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    const raw = await response.text();
    let json = null;
    if (raw.length < 180000) {
      try { json = JSON.parse(raw); } catch { /* no unsafe content logged */ }
    }
    return classifyHttp(response.status, json);
  } catch {
    return classifyHttp(0, null);
  }
}
export async function sample(request = fetch) {
  const keys = Object.entries(ENVIRONMENTS);
  const results = await Promise.all(keys.map(([,id]) => probe(id, request)));
  return Object.fromEntries(keys.map(([name], i) => [name, results[i]]));
}
export function summarize(first, second, state) {
  const out = {};
  for (const key of Object.keys(ENVIRONMENTS)) {
    out[key] = { httpStatus: second[key].httpStatus, code: second[key].code,
      persistent: first[key].httpStatus === second[key].httpStatus &&
        first[key].code === second[key].code };
  }
  return { state, sampledAt: new Date().toISOString(), environments: out,
    note: 'La disponibilidad HTTP no equivale a saldo o cuota suficiente de créditos.' };
}
async function githubRequest(repo, token, path, method = 'GET', payload) {
  const response = await fetch('https://api.github.com/repos/' + repo + path, {
    method, headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(14000),
  });
  if (!response.ok) throw Error('GitHub health issue update failed: HTTP ' + response.status);
  return response.status === 204 ? null : response.json();
}
export async function synchronizeIssue({ repo, token, report }) {
  if (report.state === 'INCONCLUSIVE')
    return { changed: false, reason: 'samples_disagreed' };
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo) || !token)
    throw Error('Missing GitHub repository or token');
  const path = '/issues/' + HEALTH_ISSUE;
  const issue = await githubRequest(repo, token, path);
  const previous = /<!-- TC_HEALTH_STATE:(UNKNOWN|HEALTHY|DEGRADED) -->/
    .exec(issue.body || '')?.[1] || 'UNKNOWN';
  if (previous === report.state) return { changed: false, previous, current: report.state };
  const marker = '<!-- TC_HEALTH_STATE:' + report.state + ' -->';
  const body = (issue.body || '').replace(
    /<!-- TC_HEALTH_STATE:(UNKNOWN|HEALTHY|DEGRADED) -->/, marker
  );
  if (!body.includes(marker)) throw Error('Health issue state marker missing');
  await githubRequest(repo, token, path, 'PATCH', { body });
  const statusText = report.state === 'HEALTHY'
    ? '✅ Disponibilidad recuperada'
    : '⚠️ Incidencia de disponibilidad';
  const summary = Object.entries(report.environments)
    .map(([key, value]) => key + ': HTTP ' + value.httpStatus +
      ' (' + value.code + ')')
    .join(' · ');
  await githubRequest(repo, token, path + '/comments', 'POST', {
    body: statusText + '\n\n' + summary + '\n\nComprobación: ' +
      report.sampledAt +
      '\n\nSolo sondeo público; no hay medición directa del saldo de créditos.',
  });
  return { changed: true, previous, current: report.state };
}
export async function run({ request = fetch, pause = ms => new Promise(r => setTimeout(r, ms)),
  repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN } = {}) {
  const a = await sample(request);
  await pause(12000);
  const b = await sample(request);
  const state = stableState(a, b);
  const report = summarize(a, b, state);
  console.log('TC_PLATFORM_HEALTH', JSON.stringify(report));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      '### Trabajo Cerca — disponibilidad AppDeploy',
      '**' + report.state + '**',
      ...Object.entries(report.environments).map(([key, info]) =>
        '- ' + key + ': HTTP ' + info.httpStatus + ', ' + info.code),
      'Saldo de créditos: no disponible desde este monitor.',
      '',
    ].join('\n') + '\n');
  }
  if (state === 'INCONCLUSIVE')
    return { report, issue: { changed: false, reason: 'inconclusive' } };
  const issue = await synchronizeIssue({ repo, token, report });
  console.log('TC_HEALTH_ISSUE_UPDATE', JSON.stringify(issue));
  return { report, issue };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await run();
