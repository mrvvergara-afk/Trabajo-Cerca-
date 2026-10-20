type VisibleItem={kind:string;createdAt:string;firstPublishedAt?:string;workCommunes:string[];review?:boolean};
type InventorySummary={totalJobOffers:number;recentJobOffers7d?:number;recentJobOffers24h?:number;communeStats:Record<string,{jobs:number;newJobs7d?:number;newJobs24h:number}>};
const PRESENTATION_DAY=86400000;

export function recentInApp(item:VisibleItem,now=Date.now(),days=7) {
  const first=Date.parse(item.firstPublishedAt || item.createdAt);
  return item.kind==='job_offer' && !item.review && Number.isFinite(first) && first<=now && first>=now-days*PRESENTATION_DAY;
}

// Counts come from the complete immutable feed, never the loaded card page or
// the sum of communes (an offer can belong to more than one commune).
export function publishedInventoryCounts(summary:InventorySummary,place='Todas') {
  const selected=place==='Todas' ? null : summary.communeStats[place];
  return {total:place==='Todas' ? summary.totalJobOffers : selected?.jobs ?? 0,
    recent7d:place==='Todas' ? summary.recentJobOffers7d ?? null : selected?.newJobs7d ?? null,
    recent24h:place==='Todas' ? summary.recentJobOffers24h ?? null : selected?.newJobs24h ?? 0};
}
