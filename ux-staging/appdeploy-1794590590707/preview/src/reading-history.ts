export const READING_KEY='tc-reading-v1';
export const READING_RETENTION=90*86400000;
export const READING_MAX=2000;
export type ReadingHistory={version:1;known:boolean;previousVisitAt:number|null;read:Record<string,number>};
type StorageLike={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
const validId=(id:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(id);
export function cleanHistory(value:unknown,now=Date.now()):ReadingHistory {
 const data=value as Partial<ReadingHistory>|null;
 if(data?.version!==1)return {version:1,known:false,previousVisitAt:null,read:{}};
 const read=Object.fromEntries(Object.entries(data.read&&typeof data.read==='object'?data.read:{}).filter(([id,time])=>validId(id)&&typeof time==='number'&&Number.isFinite(time)&&time<=now&&time>=now-READING_RETENTION).sort((a,b)=>b[1]-a[1]).slice(0,READING_MAX));
 const visit=typeof data.previousVisitAt==='number'&&data.previousVisitAt<=now&&data.previousVisitAt>=now-READING_RETENTION?data.previousVisitAt:null;
 return {version:1,known:visit!==null||Object.keys(read).length>0,previousVisitAt:visit,read};
}
export function loadReading(storage:StorageLike,now=Date.now()) {try{return cleanHistory(JSON.parse(storage.getItem(READING_KEY)||'null'),now);}catch{return cleanHistory(null,now);}}
export function saveReading(storage:StorageLike,history:ReadingHistory,now=Date.now()) {const next=cleanHistory({...history,previousVisitAt:now},now);try{storage.setItem(READING_KEY,JSON.stringify(next));}catch{/* Device storage can be unavailable; the UI retains session state. */}return next;}
export function markReading(history:ReadingHistory,id:string,now=Date.now()):ReadingHistory {return validId(id)?cleanHistory({...history,read:{...history.read,[id]:now}},now):history;}
