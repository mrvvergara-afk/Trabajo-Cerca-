import { createHash, timingSafeEqual } from 'node:crypto';

// High-entropy bearer tokens never need to be stored in plaintext.
// Legacy laboratory records remain manageable until removed by their owners.
export type OwnerCredential = { ownerHash?:string; ownerToken?:string };
export function ownerTokenDigest(token:string):string {
  return createHash('sha256').update('trabajo-cerca:publication-owner:v1:\0'+token).digest('hex');
}
export function mayManagePublication(record:OwnerCredential, candidate:unknown):boolean {
  if(typeof candidate!=='string'||candidate.length<12||candidate.length>180)return false;
  const digest=record.ownerHash || (record.ownerToken ? ownerTokenDigest(record.ownerToken) : '');
  if(!/^[a-f0-9]{64}$/.test(digest))return false;
  return timingSafeEqual(Buffer.from(digest,'hex'),Buffer.from(ownerTokenDigest(candidate),'hex'));
}
