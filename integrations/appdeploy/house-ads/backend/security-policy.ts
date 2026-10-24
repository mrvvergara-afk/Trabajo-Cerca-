import { randomBytes } from 'node:crypto';
import { fetchPublicPage } from './public-source-http';
import { publicSourceAdapter } from './public-source-adapters';

export const SECURITY_POLICY = Object.freeze({
  paidProviders: false,
  remoteAi: false,
  externalAnalytics: false,
  manualOperations: false,
});

export function denyRemoteCapabilities<T extends object>(capabilities:T):T {
  return new Proxy(capabilities, {
    get() {
      return async () => { throw new Error('remote_capability_disabled_by_security_policy'); };
    },
  });
}

export async function checkedLegacyFetch(input:RequestInfo | URL, init?:RequestInit):Promise<Response> {
  const method = init?.method || (input instanceof Request ? input.method : 'GET');
  if (method.toUpperCase() !== 'GET') {
    throw new Error('outbound_method_disabled_by_security_policy');
  }
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const result = await fetchPublicPage(url, publicSourceAdapter(url) ? url : undefined);
  if (result.error) return new Response('', { status:503 });
  return new Response(result.raw, {
    status:result.status || 503,
    headers:{ 'content-type':result.mime || 'text/plain' },
  });
}

export function opaqueOwnerToken() {
  return randomBytes(32).toString('base64url');
}

