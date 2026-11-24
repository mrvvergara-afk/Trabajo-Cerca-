type Lanes<T> = {fast:T[]; document:T[]; recovery:T[]};

export function selectRescueBatch<T>(lanes:Lanes<T>, limit:number,
    isRecheck:(item:T)=>boolean):T[] {
  const order=[lanes.fast,lanes.document,lanes.recovery];
  const reserve=[Math.ceil(limit/2),Math.floor(limit/4)];
  const quotas=[...reserve,limit-reserve[0]-reserve[1]];
  const fresh=order.map(lane=>lane.filter(item=>!isRecheck(item)));
  const rechecks=order.map(lane=>lane.filter(isRecheck));
  const selected=fresh.flatMap((lane,i)=>lane.splice(0,quotas[i]));
  for(const lane of [...fresh,...rechecks])selected.push(...lane.slice(0,Math.max(0,limit-selected.length)));
  return selected;
}
