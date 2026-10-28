import { db } from '@appdeploy/sdk';
import { currentPublicFeedManifest } from './public-feed';
import { publicFeedIdentity } from './public-source-adapters';
import { offerFingerprint, listingFingerprints } from './offer-identity';
import type { PublicVerification } from './public-source-verifier';

export class PublicationReviewRequired extends Error {
  reason:string;
  constructor(reason:string) {super(reason);this.name='PublicationReviewRequired';this.reason=reason;}
}
export async function assertDistinctPublicOffer(offer:PublicVerification) {
  const fingerprint=offerFingerprint(offer.title,offer.company,offer.work_commune);
  if (!fingerprint) throw new PublicationReviewRequired('identity_fields_missing');
  const snapshot=await currentPublicFeedManifest();
  if (!snapshot) return;
  const identity=publicFeedIdentity(offer.url!);
  // New page metadata narrows reads. Legacy pages are checked without assuming absence.
  const legacy=snapshot.manifest.pages.filter(p=>!p.semanticKeys);
  if (legacy.length>20) throw new PublicationReviewRequired('legacy_identity_index_requires_incremental_reconciliation');
  const pages=snapshot.manifest.pages.filter(p=>!p.semanticKeys || p.semanticKeys.includes(fingerprint));
  for (const page of pages) {
    const [leaf]=await db.get<{entries:Array<{item:Record<string,unknown>}>}>('public_feed_versions',[page.id],{consistent:true});
    if (!leaf) throw new Error('Public identity check incomplete; source retained');
    for (const {item} of leaf.entries) {
      if (publicFeedIdentity(String(item.url||''))===identity) continue;
      if (listingFingerprints(item).includes(fingerprint)) {
        // Similarity is not proof that distinct requisitions are the same job.
        // Preserve both source identities for review instead of silently merging.
        throw new PublicationReviewRequired('possible_republication_requires_distinct_requisition_evidence');
      }
    }
  }
}
