/** Aggregate only validated, nonduplicated laboratory counters. */
export function commercialTotals(rows:unknown[],complete:boolean){
 const unique=new Map<string,{impression:number;click:number}>();
 let valid=true;
 for(const row of rows){
  if(!row||typeof row!=='object'){valid=false;continue;}
  const r=row as Record<string,unknown>;
  if(typeof r.id!=='string'||!r.id||typeof r.impression!=='number'||!Number.isSafeInteger(r.impression)||r.impression<0||typeof r.click!=='number'||!Number.isSafeInteger(r.click)||r.click<0){valid=false;continue;}
  const old=unique.get(r.id);
  if(old&&(old.impression!==r.impression||old.click!==r.click)){valid=false;continue;}
  unique.set(r.id,{impression:r.impression,click:r.click});
 }
 let impressions=0,clicks=0;
 for(const r of unique.values()){impressions+=r.impression;clicks+=r.click;}
 const reliable=valid&&unique.size>0&&Number.isSafeInteger(impressions)&&Number.isSafeInteger(clicks);
 return {complete:complete&&valid,records:unique.size,impressions:reliable?impressions:null,clicks:reliable?clicks:null,ctr:reliable&&impressions>0?clicks/impressions*100:null};
}
