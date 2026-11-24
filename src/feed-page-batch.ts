type Page<T> = {
  items: T[];
  nextCursor?: string | null;
  degraded?: boolean;
  feedRebuilding?: boolean;
};
/** Read the immutable feed using ONLY the cursor supplied by the server.
 * Never speculate about page indices: snapshots may have missing or uneven pages.
 * Preserve a bounded traversal and fail closed on cycles or degraded responses.
 */
export async function readRemaining<T>(
  cursor: string,
  _total: number,
  _size: number,
  read: (cursor: string) => Promise<Page<T>>,
  alive: () => boolean
): Promise<T[]> {
  // Treat every pagination cursor as opaque; never manufacture a next page.
  const verify = (r: Page<T>): T[] => {
    if (
      !alive() ||
      !r ||
      !Array.isArray(r.items) ||
      r.degraded ||
      r.feedRebuilding
    )
      throw Error('Incomplete public job inventory');
    return r.items;
  };
  // Only the last verified response may authorize another request.
  const items: T[] = [];
  const visited = new Set<string>();
  let next: string | null = cursor;
  for (let page = 0; next && page < 60; page++) {
    if (!alive() || visited.has(next)) throw Error('Public feed interrupted');
    visited.add(next);
    const r = await read(next);
    items.push(...verify(r));
    next = r.nextCursor || null;
    if (next) await new Promise(resolve => setTimeout(resolve, 140));
  }
  if (next) throw Error('Public feed page bound reached');
  return items;
}
