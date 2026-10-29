import {processAdminReviewBatch,confirmAdminReviewPublications,isAdminVerificationSlot} from './radar-admin-verification';
import {withSecurityHeaders} from './security-headers';
import {COMMERCIAL_PLACES} from '../shared/commercial-policy';
import {ownedPublicationPatch} from '../shared/owned-publication';
import { advertisingCatalog, saveHouseConfiguration, uploadHouseCreative, houseClientEvent, houseDashboard, houseConversion, trialApplications, activateFreeTrial, commercialAdmin, commercialCampaigns, publicPromotion, commercialInventory, commercialClientEvent, commercialMetrics } from './house-marketing';
import { db, router, json, error, secrets, storage, ai, notifications, requireAuth, requireAdminEmailAllowlist } from '@appdeploy/sdk';
import { adminBackupPage } from './admin-backup';
import { importReview, listReview, decideReview } from './radar-review-inbox';
import {importMotorCGitHubOidc} from './motor-c-github-import';
import { checkOneReview } from './radar-review-check';
import { enqueueAdminReviewedOffer, readAdminReviewPublicationStatus } from './radar-review-queue';
import { confirmedOfferDeadline, offerRetentionReason, offerRecheckDue } from './offer-retention';
import { advancePublicFeed, readPublicFeedPage, readStagedPublicFeedPage, readPublicFeedItem, readPublicFeedSummary, publicFeedProgress, trackedFeedAdd, trackedFeedUpdate, trackedFeedDelete } from './public-feed';
import { isOriginalVerificationSlot } from './verification-schedule';
import { readLocalSourceEvidence } from './local-source-evidence';
import { captionSocialFinding, socialPosterFinding, originalSocialDate, prepareSocialEvidence, socialSourceDate, socialVerificationBlock, sameSocialPost, type SocialEvidence } from './social-evidence';
import { storeSocialFindings, hydrateSocialFindings } from './social-evidence-store';
import { socialExplicitClosure } from './social-evidence';
import { checkSocialApplication } from './social-application';
import { publicSourceAdapter, publicJobExclusion } from './public-source-adapters';
import { knownFirstPublication } from './first-publication';
import { evaluatePublicJob, type PublicVerification } from './public-source-verifier';
import { fetchPublicPage } from './public-source-http';
import { freePublicSourceStatus, runFreePublicSources, verifiedPublicRecord, type FreeSource } from './free-public-sources';
import {shadowPdfBatch} from './shadow-pdf';
export {motorBIndependentHandler} from './motor-b-independent';
export {motorCIndependentHandler} from './motor-c-independent';
import {publishQualifiedShadowOffers} from './shadow-publish';
import { pullRadarBatch, confirmRadarPublications, externalRadarStatus, revalidateLocalContactOffers, type VerifiedOffer } from './radar-ingestion';
import { revalidateReviewedDocuments, documentRevalidationStatus } from './document-revalidation';
import { reviewedReceiver } from './reviewed-receiver';
import { SECURITY_POLICY, denyRemoteCapabilities, checkedLegacyFetch, opaqueOwnerToken } from './security-policy';
import { publicQuota } from './security-quota';

const guardedAi = denyRemoteCapabilities(ai);
const fetch = checkedLegacyFetch;


type SeedJob = {
  title: string;
  company: string;
  place: string;
  recruit: string;
  area: string;
  status: 'Nueva' | 'Activa' | 'Por vencer';
  date: string;
  until?: string;
  vacancies?: number;
  apply: 'Sencilla' | 'Intermedia' | 'Extensa';
  source: string;
  sourceDomain: string;
  url?: string;
  note: string;
  salary?: string;
  tags: string[];
  visual: string;
  icon: string;
  portalPlace?: string;
  evidence?: string;
  contact?: string;
  contactLabel?: string;
  review?: boolean;
};

type ListingRecord = {
  seedKey?: string;
  kind: 'job_offer' | 'worker_available' | 'worker_need' | 'service_request' | 'candidate';
  origin: 'radar' | 'direct' | 'community';
  title: string;
  company: string;
  workLocation: string;
  workCommunes: string[];
  recruitmentZones: string[];
  recruitmentCommunes: string[];
  area: string;
  status: string;
  date: string;
  until?: string;
  expiresAt?: string;
  vacancies?: number;
  apply?: string;
  source: string;
  sourceDomain: string;
  discoveredBy?: string;
  sourcePublishedAt?: string;
  url?: string;
  note: string;
  salary?: string;
  tags: string[];
  visual: string;
  icon: string;
  portalPlace?: string;
  evidence?: string;
  evidenceImagePath?: string;
  review: boolean;
  verified: boolean;
  verificationCheckedAt?: string;
  verificationReason?: string;
  verificationMethod?: string;
  verificationVersion?: string;
  enrichmentCheckedAt?: string;
  radarJobId?: string;
  verifiedAt?: string;
  firstVerifiedAt?: string;
  lastVerifiedAt?: string;
  lastSeenAt?: string;
  evidenceSources?: string[];
  active: boolean;
  createdAt: string;
  contact?: string;
  contactLabel?: string;
  ownerToken?: string;
  socialEvidence?: SocialEvidence;
  sourceValidThrough?:string | null;
  validityMethod?:string;
};

type SourceRecord = {
  key: string;
  name: string;
  family: string;
  mode: 'public_scan' | 'discovery' | 'community';
  status: 'automatic' | 'active' | 'limited';
  scanUrl?: string;
  priority?: 'A+' | 'A' | 'B' | 'C' | 'D';
  cadenceHours?: number;
  territories: string[];
  note: string;
  active: boolean;
  updatedAt: string;
};

type SourceAudit = {
  sourceKey: string;
  checkedAt: string;
  status: 'ok' | 'blocked' | 'error';
  linksSeen: number;
  candidatesFound: number;
  newCandidates: number;
  refreshedExisting?: number;
  skippedUnchanged?: number;
  message?: string;
};

type SourceScanState = {
  id?: string;
  sourceKey: string;
  fingerprint: string;
  lastCheckedAt: string;
  lastChangedAt: string;
  lastLinksSeen: number;
  lastCandidatesFound: number;
};

type GrowthCampaign = {
  businessName: string;
  category: string;
  headline: string;
  detail: string;
  communes: string[];
  url?: string;
  startAt: string;
  endAt: string;
  status: 'active' | 'paused';
  label: 'Publicidad local' | 'Patrocinado';
  priority: number;
  createdAt: string;
};

type AdvertiserLead = {
  businessName: string;
  commune: string;
  category: string;
  presence: string;
  contact: string;
  note: string;
  source: 'self_service';
  status: 'new';
  createdAt: string;
};

type SocialDraft = {
  sourceId: string;
  place: string;
  title: string;
  text: string;
  channel: 'facebook_instagram';
  status: 'draft';
  createdAt: string;
};

type NotificationPreference = {
  id?: string;
  userId: string;
  communes: string[];
  keywords: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};