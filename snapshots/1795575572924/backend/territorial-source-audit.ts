import { readPublicFeedPage } from './public-feed';

// Read-only audit of visible Purén listings. No database mutation, no
// automatic archival, and no personal contact fields in diagnostics.
export async function diagnosePurenPublishedJobs() {
  let cursor: string | undefined;
  const seen = new Set<string>();
  const listed: Array<Record<string,unknown>> = [];
  let pages = 0;
  let complete = false;
  for (let step = 0; step < 18; step++) {
    const page = await readPublicFeedPage(cursor);
    if (!page || !Array.isArray(page.items)) break;
    pages++;
    for (const row of page.items) {
      if (row.kind !== 'job_offer' ||
          !Array.isArray(row.workCommunes) ||
          !row.workCommunes.includes('Purén') ||
          typeof row.id !== 'string' || seen.has(row.id)) continue;
      seen.add(row.id);
      if (listed.length >= 45) continue;
      listed.push({
        id: row.id,
        title: String(row.title||'').slice(0,115),
        company: String(row.company||'').slice(0,70),
        workLocation: String(row.workLocation||'').slice(0,100),
        workCommunes: row.workCommunes,
        sourceUrl: String(row.url||'').slice(0,190),
        verified: row.verified===true,
        origin: row.origin,
      });
    }
    if (!page.nextCursor || page.hasMore === false) {
      complete = true;
      break;
    }
    if (cursor === page.nextCursor) break;
    cursor = page.nextCursor;
  }
  const result = {
    run: 'puren-location-audit-20261121',
    checkedAt: new Date().toISOString(),
    pages, complete, totalPuren:seen.size, sampled:listed,
    mutation:false,
  };
  console.warn('PUREN_PUBLIC_SOURCE_AUDIT '+JSON.stringify(result));
  return result;
}
