import type {RouterResponse} from '@appdeploy/sdk';
export const API_SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
});
// Covers router errors and denied requests as well as successful JSON responses.
// This does not claim control over the hosting layer's HTML/static response headers.
export function withSecurityHeaders(response:RouterResponse):RouterResponse {
  const protectedKeys=new Set([...Object.keys(API_SECURITY_HEADERS),'X-Robots-Tag'].map(k=>k.toLowerCase()));
  const headers=Object.fromEntries(Object.entries(response.headers||{}).filter(([key])=>!protectedKeys.has(key.toLowerCase())));
  if(response.statusCode>=400||!Object.keys(headers).some(k=>k.toLowerCase()==='cache-control'))headers['Cache-Control']='no-store';
  return {...response,headers:{...headers,...API_SECURITY_HEADERS,'X-Robots-Tag':'noindex, nofollow'}};
}
