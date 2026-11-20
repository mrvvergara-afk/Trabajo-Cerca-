// One unauthenticated public read. Never writes or prints customer information.
const url = 'https://api-v2.appdeploy.ai/app/trabajo-cerca-lab-aislado-xirg9w/api/listings?limit=1';
const response = await fetch(url, { method: 'GET', cache: 'no-store',
  headers: { Accept: 'application/json' }, redirect: 'error',
  signal: AbortSignal.timeout(10000) });
const body = await response.text();
let code = 'unknown';
try {
  const json = JSON.parse(body);
  const raw = json?.code ?? json?.error?.code ??
    json?.error ?? json?.reason ?? json?.message;
  if (typeof raw === 'string') code = raw.replace(/[^a-zA-Z0-9_ -]/g, '').slice(0, 70);
} catch {
  if (/credit|quota|billing|payment/i.test(body)) code = 'credit_or_billing_message';
  else if (/rate.limit|exceed/i.test(body)) code = 'rate_limit_message';
  else code = 'non_json';
}
console.log('LAB_EDGE_DIAGNOSTIC', JSON.stringify({
  status: response.status,
  code,
  retryAfter: response.headers.get('retry-after') || null,
  contentType: response.headers.get('content-type') || null,
}));
// A response other than 200 is a real blocker, not a reason to bypass authorization tests.
if (response.status !== 200) process.exitCode = 1;
