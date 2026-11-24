import {createHash} from 'node:crypto';

const TRACKERS=new Set(['fbclid','gclid','msclkid','igshid','mc_cid','mc_eid']);

/**
 * Stable identity for individual vacancy links.
 * Keeps job-id query parameters; discards fragments, www and campaign tracking.
 * Mirrors automation/chatgpt_extraction_contract.py.
 */
export function canonicalSourceUrl(input:string):string{
  if(typeof input!=='string'||input.length>700||input.trim()!==input||/\s/.test(input))throw Error('invalid_source_url');
  const url=new URL(input);
  if(url.protocol!=='https:'||url.username||url.password||(!url.hostname.includes('.'))||
     (url.port&&url.port!=='443'))throw Error('invalid_source_url');
  const host=url.hostname.toLowerCase().replace(/^www\./,'');
  if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal'))throw Error('unsafe_source_url');
  const path=url.pathname.replace(/\/+$/,'')||'/';
  const args=[...url.searchParams.entries()]
    .filter(([key])=>!key.toLowerCase().startsWith('utm_')&&!TRACKERS.has(key.toLowerCase()))
    .sort(([ak,av],[bk,bv])=>ak<bk?-1:ak>bk?1:av<bv?-1:av>bv?1:0);
  const query=new URLSearchParams(args).toString();
  return 'https://'+host+path+(query?'?'+query:'');
}

export function canonicalSourceHash(raw:string):string{
  return createHash('sha256').update(canonicalSourceUrl(raw),'utf8').digest('hex');
}
