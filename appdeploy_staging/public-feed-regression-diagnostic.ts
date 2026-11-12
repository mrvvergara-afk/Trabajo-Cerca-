/**
 * Read-only diagnostics for a verified job missing from a proposed public-feed manifest.
 * Staging module: AppDeploy's active backend is NOT automatically synchronized with GitHub.
 * Never include private notes or personal contact information in logs.
 */
export type FeedDiagnosticSource = {
  kind?: unknown; verified?: unknown; review?: unknown; active?: unknown;
  workCommunes?: unknown; sourcePublishedAt?: unknown; date?: unknown;
  firstPublishedAt?: unknown; url?: unknown; sourceValidThrough?: unknown;
  closureReason?: unknown;
};
export function missingApprovedJobDiagnostic(
  key: string,
  source: FeedDiagnosticSource | null | undefined,
  now: number,
) {
  const deadline = Date.parse(String(source?.sourceValidThrough ?? ''));
  const confirmedClosure = /confirmed|explicit|administrative|owner_request/.test(
    String(source?.closureReason ?? ''),
  );
  return {
    key,
    sourceExists: Boolean(source),
    approved: source?.verified === true && source?.review !== true,
    active: source?.active === true,
    jobOffer: source?.kind === 'job_offer',
    workCommunesArray: Array.isArray(source?.workCommunes),
    workCommunesCount: Array.isArray(source?.workCommunes) ? source.workCommunes.length : 0,
    datePresent: Boolean(source?.sourcePublishedAt || source?.date || source?.firstPublishedAt),
    urlPresent: Boolean(source?.url),
    deadlineExpired: Number.isFinite(deadline) && deadline < now,
    confirmedClosure,
  };
}
