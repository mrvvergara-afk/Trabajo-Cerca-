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
export function nextGeminiVerifyCursor(start:number, selected:number, total:number, reasons:readonly string[]):number {
  if(!total)return 0;
  if(reasons.some(geminiRetryableReason))return start;
  return start+selected<total?start+selected:0;
}
