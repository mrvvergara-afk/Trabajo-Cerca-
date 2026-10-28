import { createHash } from 'node:crypto';
const fold=(s:unknown)=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function offerFingerprint(title:unknown,company:unknown,commune:unknown) {
  const values=[title,company,commune].map(fold);
  return values.every(Boolean)?createHash('sha256').update(values.join('\n')).digest('hex'):null;
}
export function listingFingerprints(item:Record<string,unknown>) {
  if(item.kind!=='job_offer')return [];
  const communes=Array.isArray(item.workCommunes)?item.workCommunes:[item.workLocation];
  return communes.map(t=>offerFingerprint(item.title,item.company,t)).filter((x):x is string=>Boolean(x));
}
