// Pure progress policy for the bounded Gemini-to-admin-review connector.
// Incomplete dedup scans expire after 24 hours; keep their batch scheduled
// at the next cron instead of restarting after a full 43-item rotation.
const RETRYABLE_REASONS = new Set([
  'duplicate_check_in_progress',
  'public_duplicate_catalog_unavailable',
  'public_duplicate_page_unavailable',
  'duplicate_scan_concurrent_change',
]);
export function geminiRetryableReason(reason:string):boolean {
  return RETRYABLE_REASONS.has(reason);
}
export function nextGeminiVerifyCursor(start:number, selected:number, total:number, reasons:readonly string[],previousHolds=0):number {
  if(!total)return 0;
  if(previousHolds<2 && reasons.some(geminiRetryableReason))return start;
  return start+selected<total?start+selected:0;
}


export function geminiCursorForSnapshot(
  expectedSha:string, savedSha:unknown, offset:unknown, count:number
):number {
  if (expectedSha!==savedSha || !count) return 0;
  const position=typeof offset==='number'?offset:0;
  return Number.isSafeInteger(position) && position>=0 && position<count ? position : 0;
}
