import { Buffer } from 'node:buffer';
import { publicPublisher, safePublicUrl, samePublicJob } from './public-source-adapters';
import { checkPublicRobots } from './public-robots';

export type PublicPage = { url:string; status:number; raw:string; mime:string; bytes:number; retryAfter?:string|null; error?:string };

type PublicResponse = {url:string; response:Response} | {url:string; status:number; error:string};

export async function openPublicResponse(value:string, signal:AbortSignal, accept:string, expectedJob?:string):Promise<PublicResponse> {
  const clean = safePublicUrl(value), publisher = publicPublisher(value);
  if (!clean || !publisher) return { url:value,status:0,error:'publisher_not_allowed' };
  if (new URL(clean).protocol !== 'https:') return { url:value,status:0,error:'https_required' };
  let current = clean;
  try {
    for (let redirect=0;redirect<4;redirect++) {
      const policy=await checkPublicRobots(current);
      if (!policy.allowed) return {url:current,status:0,error:policy.error||'robots_policy_unavailable'};
      const response = await fetch(current,{ headers:{ 'user-agent':'TrabajoCercaPublic/1.0',accept },redirect:'manual',signal });
      if ([301,302,303,307,308].includes(response.status)) {
        const next = safePublicUrl(response.headers.get('location') || '',current);
        await response.body?.cancel();
        if (!next || new URL(next).protocol !== 'https:' || publicPublisher(next)?.group !== publisher.group || (expectedJob && !samePublicJob(expectedJob,next))) return { url:current,status:response.status,error:'redirect_identity_unconfirmed' };
        current = next;continue;
      }
      return {url:current,response};
    }
    return {url:current,status:0,error:'redirect_budget_exhausted'};
  } catch {
    return {url:current,status:0,error:signal.aborted?'source_timeout':'source_unavailable'};
  }
}

export async function fetchPublicPage(value:string, expectedJob?:string):Promise<PublicPage> {
  const signal=AbortSignal.timeout(6500);
  const opened=await openPublicResponse(value,signal,'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml',expectedJob);
  if ('error' in opened) return {...opened,raw:'',mime:'',bytes:0};
  const {url:current,response}=opened;
  try {
    const mime = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (response.status!==200) { await response.body?.cancel();return { url:current,status:response.status,raw:'',mime,bytes:0,retryAfter:response.headers.get('retry-after') }; }
    if (!['text/html','application/xhtml+xml','application/rss+xml','application/atom+xml','application/xml','text/xml'].includes(mime)) {
      await response.body?.cancel();return { url:current,status:200,raw:'',mime,bytes:0,error:'document_requires_local_reader' };
    }
    const reader = response.body?.getReader();
    const parts:Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes>600000) { await reader.cancel();return { url:current,status:200,raw:'',mime,bytes,error:'source_byte_budget_exceeded' }; }
        parts.push(chunk.value);
      }
    } else {
      const raw = new Uint8Array(await response.arrayBuffer());bytes = raw.byteLength;
      if (bytes>600000) return { url:current,status:200,raw:'',mime,bytes,error:'source_byte_budget_exceeded' };
      parts.push(raw);
    }
    const buffer=Buffer.concat(parts);
    const declared=(response.headers.get('content-type') || '').match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1]?.toLowerCase();
    const meta=buffer.subarray(0,4096).toString('ascii').match(/charset\s*=\s*["']?([a-z0-9_-]+)/i)?.[1]?.toLowerCase();
    const encoding=declared || meta || 'utf-8';
    if (!['utf-8','utf8','iso-8859-1','latin1','windows-1252'].includes(encoding)) return { url:current,status:200,raw:'',mime,bytes,error:'source_encoding_unsupported' };
    const raw=new TextDecoder(encoding==='utf8'?'utf-8':encoding).decode(buffer);
    const accessText=raw.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ');
    if (/verify you are human|unusual traffic|verificaci[oó]n requerida|tr[aá]fico inusual|verifica si realmente|no (?:es|eres) un robot/i.test(accessText)) {
      return {url:current,status:200,raw,mime,bytes,error:'public_access_challenge'};
    }
    return { url:current,status:200,raw,mime,bytes };
  } catch {
    return { url:current,status:0,raw:'',mime:'',bytes:0,error:signal.aborted?'source_timeout':'source_unavailable' };
  }
}
