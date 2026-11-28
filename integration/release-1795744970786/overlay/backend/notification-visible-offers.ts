import { createHash } from 'node:crypto';
import { publicFeedIdentity } from './public-source-adapters';

type VisibleJob = {
  id?: string;
  url?: string;
  documentUnitKey?: string;
  documentUnitVerified?: boolean;
  firstVerifiedAt?: string;
  verifiedAt?: string;
  createdAt: string;
};
export type NotificationObservations = Record<string, number>;

export function observeVisibleJobs<T extends VisibleJob>(
  visible: T[], previous: NotificationObservations | undefined, now: number, floor: number,
) {
  const history = new Map(Object.entries(previous ?? {}).filter(([, at]) => at >= floor && at <= now));
  const offers: Array<{ item: T; at: number }> = [];
  const seen = new Set<string>();
  for (const item of visible) {
    const documentKey = item.documentUnitVerified === true ? item.documentUnitKey : undefined;
    const identity = (item.url && publicFeedIdentity(item.url, documentKey)) || item.id;
    if (!identity) continue;
    const key = createHash('sha256').update(identity).digest('hex').slice(0, 32);
    if (seen.has(key)) continue;
    seen.add(key);

    const legacyTime = Date.parse(item.firstVerifiedAt || item.verifiedAt || item.createdAt);
    // Existing catalog entries keep their previous notification eligibility on migration.
    const at = previous && Object.hasOwn(previous, key)
      ? previous[key]
      : previous ? now : Number.isFinite(legacyTime) && legacyTime >= floor && legacyTime <= now ? legacyTime : 0;
    history.set(key, at);
    if (at >= floor && at <= now) offers.push({ item, at });
  }
  if (history.size > 6000) throw new Error('Notification observations exceed the storage limit');
  return { observations: Object.fromEntries(history), offers };
}
