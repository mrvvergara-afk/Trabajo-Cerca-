/** Pure capacity policy for reverification and fast B/C queues. */

export function recheckSlots(backlog: number, maxReviews = 10): number {
  if (!Number.isFinite(backlog) || backlog <= 0) return 0;
  const reserveForNewLeads = 2;
  const capacity = Math.max(0, maxReviews - reserveForNewLeads);
  if (backlog > 50) return Math.min(8, capacity);
  if (backlog > 10) return Math.min(4, capacity);
  return Math.min(2, capacity);
}

export function bcCheckLimit(pending: number, configured = 12): number {
  if (!Number.isFinite(pending) || pending <= 0) return 0;
  return Math.min(Math.max(1, Math.trunc(configured)), 24, Math.trunc(pending));
}

/**
 * Keep unresolved decisions forever; prune only terminal decisions.
 * The old unconditional 180-entry trim could erase a pending case and make it
 * reappear as new work later.
 */
export function pruneResolved<T extends { state?: string }>(resolved: Record<string, T>, maxTerminal = 1000): Record<string, T> {
  const entries = Object.entries(resolved);
  const unresolved = entries.filter(([, value]) => value.state === "blocked" || value.state === "needs_source_evidence");
  const terminal = entries.filter(([, value]) => !(value.state === "blocked" || value.state === "needs_source_evidence"));
  const keep = terminal.length > maxTerminal ? terminal.slice(terminal.length - maxTerminal) : terminal;
  return Object.fromEntries([...unresolved, ...keep]);
}