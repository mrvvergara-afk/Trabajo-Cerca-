/** Optional short-lived cache: ONLY approved external Radar jobs.
 * Never saves service profiles, direct postings, contact details or visitor identity.
 * Every app launch revalidates against the authoritative feed. */
const KEY='tc_public_verified_radar_v1';
const FIELDS=['id','kind','origin','title','company','workLocation','workCommunes','recruitmentZones','recruitmentCommunes',
 'area','status','date','until','vacancies','applicationUrl','source','sourceDomain','sourcePublishedAt','url',
 'salary','tags','visual','icon','portalPlace','review','verified','createdAt','firstPublishedAt',
 'lastVerifiedAt','externalVerifiedAt','verifiedAt','verificationMethod','verificationReason','active'] as const;
export function readPublicJobCache<T>():{items:T[];summary:Record<string,unknown>}|null{
 try{
  const d=JSON.parse(localStorage.getItem(KEY)||'null');
  if(!d||d.v!==1||!Number.isFinite(d.at)||d.at>Date.now()||Date.now()-d.at>2*3600000
    ||!Array.isArray(d.items)||d.items.length>1200||!d.summary)return null;
  const items=d.items.filter((r:Record<string,unknown>)=>r.kind==='job_offer'&&r.origin==='radar'
    &&r.verified===true&&r.review===false&&typeof r.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(r.id));
  return items.length?{items,summary:d.summary}:null;
 }catch{return null;}
}
export function writePublicJobCache(rows:Record<string,unknown>[],summary:Record<string,unknown>){
 try{
  const items=rows.filter(x=>x.kind==='job_offer'&&x.origin==='radar'&&x.verified===true&&x.review===false)
   .slice(0,1200).map(row=>{
    const safe:Record<string,unknown>={note:'',apply:''};
    for(const key of FIELDS)if(row[key]!==undefined)safe[key]=row[key];
    return safe;
   });
  if(!items.length)return;
  const totals:Record<string,unknown>={};
  for(const key of ['totalItems','totalJobOffers','totalVerifiedJobOffers','totalProvisionalJobOffers','recentJobOffers7d','recentJobOffers24h','communeStats','kindStats'])totals[key]=summary[key];
  const raw=JSON.stringify({v:1,at:Date.now(),items,summary:totals});
  if(raw.length<600000)localStorage.setItem(KEY,raw);
 }catch{}
}