import { db } from '@appdeploy/sdk';
import { hydrateSocialFindings } from './social-evidence-store';

type Stored = Record<string, unknown>;
const SOCIAL_HOSTS = new Set(['facebook.com','www.facebook.com','m.facebook.com','instagram.com','www.instagram.com']);
const PAGE_SIZE = 3;
const FINDINGS_PER_RUN = 20;

function text(value:unknown, length=1000) {
  return typeof value === 'string' ? value.slice(0, length) : '';
}

function sourceUrl(value:unknown, media=false) {
  if (typeof value !== 'string' || value.length > 4000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if ([...url.searchParams.keys()].some(key => /^(access_token|api_key|apikey|token)$/i.test(key))) return null;
    if (media ? !/\.(fbcdn\.net|cdninstagram\.com)$/.test(url.hostname) : !SOCIAL_HOSTS.has(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

function count(value:unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function finding(value:unknown) {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Stored : {};
  return {
    postUrl:sourceUrl(row.postUrl), postDate:text(row.postDate, 100) || null,
    mediaUrl:sourceUrl(row.mediaUrl, true), medium:text(row.medium, 30),
    title:text(row.title, 300), company:text(row.company, 300), commune:text(row.commune, 300),
    contact:text(row.contact, 600), deadline:text(row.deadline, 150),
    requirements:text(row.requirements, 1000), text:text(row.text, 6000),
    textTruncated:row.textTruncated===true || text(row.text,10000).length>6000,
    textOriginalLength:count(row.textOriginalLength),
    transcriptionAvailable:typeof row.transcriptionAvailable==='boolean' ? row.transcriptionAvailable : null,
  };
}

// Reads only evidence already captured by the existing workers. Never invokes a provider or writes.
export async function readLocalSourceEvidence(cursor?:string) {
  if (cursor && (cursor.length > 4096 || /[\r\n]/.test(cursor))) throw new Error('Invalid local evidence cursor');
  const rows = await db.list<Stored>('social_capture_runs', { limit:PAGE_SIZE, ...(cursor ? { nextToken:cursor } : {}) });
  const references=rows.items.flatMap(row=>(Array.isArray(row.findings)?row.findings:[]).slice(0,FINDINGS_PER_RUN)) as Stored[];
  const full=await hydrateSocialFindings(references);
  let at=0;
  const items = rows.items.map(row => {
    const all = Array.isArray(row.findings) ? row.findings : [];
    return {
      id:row.id, sourceKey:text(row.sourceKey, 100), sourceName:text(row.sourceName, 300),
      sourceUrl:sourceUrl(row.sourceUrl), territory:text(row.territory, 300), status:text(row.status, 80),
      capturedAt:text(row.createdAt, 100) || null, processedAt:text(row.processedAt, 100) || null,
      posts:count(row.posts), postCursor:count(row.postCursor), mediaCursor:count(row.mediaCursor),
      images:count(row.images), imagesRead:count(row.imagesRead), jobNotices:count(row.jobNotices),
      textPostsRead:count(row.textPostsRead), findingsKnown:Array.isArray(row.findings),
      findingsTotal:Array.isArray(row.findings) ? all.length : null,
      findingsTruncated:all.length > FINDINGS_PER_RUN, findings:full.slice(at,at+=Math.min(all.length,FINDINGS_PER_RUN)).map(finding),
    };
  });
  return {
    schema:'trabajo-cerca.existing-local-evidence.v1', readOnly:true, providerCalls:0,
    coverage:'one_bounded_page_of_existing_captures', pageSize:PAGE_SIZE,
    nextCursor:rows.nextToken ?? null, hasMore:Boolean(rows.nextToken), items,
    stats:{ runsReturned:items.length, findingsReturned:items.reduce((sum,row) => sum + row.findings.length, 0) },
    checkedAt:new Date().toISOString(),
  };
}

