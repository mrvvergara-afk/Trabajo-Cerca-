/** Bounded, deterministic rotation. A source must not endlessly re-read its first page. */
export function rotateIndex<T>(items:ReadonlyArray<T>, limit:number, attempts:number) {
  if (!Number.isSafeInteger(limit) || limit<1 || limit>1000) throw new Error('invalid_index_limit');
  if (!Number.isSafeInteger(attempts) || attempts<0) throw new Error('invalid_index_attempt');
  const total=items.length;
  const offset=total ? (attempts*limit)%total : 0;
  const selected:T[]=[];
  for(let index=0;index<Math.min(limit,total);index++){
    selected.push(items[(offset+index)%total]);
  }
  return {items:selected,total,offset,partial:total>limit};
}
