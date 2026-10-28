type Item = { id:string; [key:string]:unknown };
type Page = { items:Item[]; nextCursor?:string | null; totalItems?:number; totalJobOffers?:number; complete?:boolean; degraded?:boolean };
type Read = (path:string) => Promise<{ data:Page }>;

// Read every page through the frontend SDK; finding expected IDs is not a stop condition.
export async function readFeedInventory(read:Read, maxPages=100) {
  const items:Item[] = [];
  const ids = new Set<string>(), cursors = new Set<string>();
  let cursor:string | undefined, pagesRead=0, totalItems:number | undefined;
  let totalJobOffers:number | undefined;
  try {
    if (!Number.isInteger(maxPages) || maxPages<1 || maxPages>100) throw new Error('invalid_limit');
    while (pagesRead<maxPages) {
      const suffix=cursor ? '&cursor='+encodeURIComponent(cursor) : '';
      const { data }=await read('/api/listings?fresh=1'+suffix);
      if (!Array.isArray(data.items)) throw new Error('invalid_items');
      if (data.complete===false || data.degraded) throw new Error('partial_public_catalog');
      if (pagesRead===0) { totalItems=data.totalItems;totalJobOffers=data.totalJobOffers; }
      pagesRead++;
      for (const item of data.items) {
        if (typeof item.id!=='string' || !item.id || ids.has(item.id)) throw new Error('duplicate_or_invalid_id');
        ids.add(item.id);
        const { id,kind,title,company,source,workLocation,workCommunes,date,createdAt,url,verified,review,
          sourcePublishedAt,sourceValidThrough,expiresAt,applicationUrl,applicationMethod,firstPublishedAt,lastVerifiedAt,externalVerifiedAt,revalidationDue,active,closureReason }=item;
        items.push({ id,kind,title,company,source,workLocation,workCommunes,date,createdAt,url,verified,review,
          sourcePublishedAt,sourceValidThrough,expiresAt,applicationUrl,applicationMethod,firstPublishedAt,lastVerifiedAt,externalVerifiedAt,revalidationDue,active,closureReason });
      }
      if (!data.nextCursor) {
        if (totalItems!==undefined && (!Number.isSafeInteger(totalItems) || totalItems!==items.length)) throw new Error('incomplete_count');
        return { items,pagesRead,totalItems,totalJobOffers,complete:true,error:null };
      }
      if (typeof data.nextCursor!=='string' || cursors.has(data.nextCursor)) throw new Error('repeated_or_invalid_cursor');
      cursors.add(data.nextCursor);cursor=data.nextCursor;
    }
    throw new Error('page_limit_reached');
  } catch {
    return { items,pagesRead,totalItems,totalJobOffers,complete:false,error:'No se pudo completar la lectura de todas las páginas del feed.' };
  }
}
