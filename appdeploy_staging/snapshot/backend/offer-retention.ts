type Offer = Record<string,unknown>;
const RETENTION_DAY=86400000;
// An explicit closing date always wins, even when it is months away.
// Sin cierre explícito, la antigüedad NO es cierre: conservar la oferta y marcarla para revalidación.
export function confirmedOfferDeadline(item:Offer):number | null {
  const explicit=Date.parse(String(item.sourceValidThrough || ''));
  if (Number.isFinite(explicit)) return explicit;
  // Legacy editions generated expiresAt at 20, 30 or 45 days. This is
  // NOT evidence of an employer deadline; only explicit source evidence counts.
  const expiry=Date.parse(String(item.expiresAt || ''));
  if(Number.isFinite(expiry) && (item.validityMethod==='explicit_deadline' ||
      item.origin==='community'))return expiry;
  return null;
}

export function offerRetentionReason(item:Offer,now=Date.now()):string | null {
  if (item.active!==true) return item.closureReason ? String(item.closureReason) : 'source_record_inactive';
  const deadline=confirmedOfferDeadline(item);
  if (deadline!==null && deadline<now) return 'application_window_elapsed';
  // Publication age is never proof of closure. Keep undated jobs visible
  // until an explicit employer deadline or a confirmed closure is recorded.
  if (item.kind==='job_offer' && (item.verified!==true || item.review===true)) return 'approval_or_quality_review_required';
  return null;
}

export function offerRecheckDue(item:Offer,now=Date.now()) {
  if (item.kind!=='job_offer') return false;
  const checked=Date.parse(String(item.lastVerifiedAt || item.externalVerifiedAt || item.verifiedAt || ''));
  return !Number.isFinite(checked) || checked>now || now-checked>RETENTION_DAY;
}

export function offerFirstVisibleAt(item:Offer) {
  const value=Date.parse(String(item.firstPublishedAt || item.createdAt || ''));
  return Number.isFinite(value) ? value : null;
}
