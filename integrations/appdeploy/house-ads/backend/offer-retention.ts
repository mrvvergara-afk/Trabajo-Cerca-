type Offer = Record<string,unknown>;
const RETENTION_DAY=86400000;

// An explicit closing date always wins, even when it is months away.
// Original-source age triggers verification; it is not an invented closing date.
export function confirmedOfferDeadline(item:Offer):number | null {
  const explicit=Date.parse(String(item.sourceValidThrough || ''));
  if (Number.isFinite(explicit)) return explicit;
  const expiry=Date.parse(String(item.expiresAt || ''));
  const published=Date.parse(String(item.sourcePublishedAt || ''));
  if (Number.isFinite(expiry) && (!Number.isFinite(published) || Math.abs(expiry-published-45*RETENTION_DAY)>=1000)) return expiry;
  return null;
}

export function offerRetentionReason(item:Offer,now=Date.now()):string | null {
  if (item.active!==true) return item.closureReason ? String(item.closureReason) : 'source_record_inactive';
  const deadline=confirmedOfferDeadline(item);
  if (deadline!==null && deadline<now) return 'confirmed_application_deadline_elapsed';
  if (item.kind==='job_offer' && (item.verified!==true || item.review===true)) return 'approval_or_quality_review_required';
  const published=Date.parse(String(item.sourcePublishedAt||''));
  if(deadline===null&&Number.isFinite(published)&&now-published>45*RETENTION_DAY&&offerRecheckDue(item,now))return 'source_revalidation_required';
  return null;
}

export function offerRecheckDue(item:Offer,now=Date.now()) {
  if (item.kind!=='job_offer') return false;
  const times=[item.lastVerifiedAt,item.externalVerifiedAt,item.verifiedAt].map(x=>Date.parse(String(x||''))).filter(Number.isFinite);
  const checked=times.length?Math.max(...times):NaN;
  return !Number.isFinite(checked) || checked>now || now-checked>RETENTION_DAY;
}

export function offerFirstVisibleAt(item:Offer) {
  const value=Date.parse(String(item.firstPublishedAt || item.createdAt || ''));
  return Number.isFinite(value) ? value : null;
}
