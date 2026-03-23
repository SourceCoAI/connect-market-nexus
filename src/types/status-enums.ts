/**
 * Centralized status enum definitions for all core entities.
 *
 * These are the canonical status types for the platform.
 * Import from here rather than defining inline status strings.
 */

// ── Listing Pipeline ─────────────────────────────────────────────────
export type ListingPipelineStatus =
  | 'lead'
  | 'qualified'
  | 'engaged'
  | 'active'
  | 'marketplace'
  | 'closed';

export const LISTING_PIPELINE_STATUSES: readonly ListingPipelineStatus[] = [
  'lead',
  'qualified',
  'engaged',
  'active',
  'marketplace',
  'closed',
] as const;

// ── Connection Requests ──────────────────────────────────────────────
export type ConnectionRequestStatus =
  | 'pending'
  | 'approved'
  | 'notified'
  | 'reviewed'
  | 'converted'
  | 'rejected';

export const CONNECTION_REQUEST_STATUSES: readonly ConnectionRequestStatus[] = [
  'pending',
  'approved',
  'notified',
  'reviewed',
  'converted',
  'rejected',
] as const;

// ── Buyer Introductions ─────────────────────────────────────────────
export type IntroductionStatus =
  | 'need_to_show_deal'
  | 'outreach_initiated'
  | 'meeting_scheduled'
  | 'not_a_fit'
  | 'fit_and_interested'
  | 'deal_created';

export const INTRODUCTION_STATUSES: readonly IntroductionStatus[] = [
  'need_to_show_deal',
  'outreach_initiated',
  'meeting_scheduled',
  'not_a_fit',
  'fit_and_interested',
  'deal_created',
] as const;

// ── Memo Status ──────────────────────────────────────────────────────
export type MemoStatus = 'draft' | 'review' | 'approved' | 'rejected';

export const MEMO_STATUSES: readonly MemoStatus[] = [
  'draft',
  'review',
  'approved',
  'rejected',
] as const;

// ── Marketplace Listing Status ───────────────────────────────────────
export type MarketplaceListingStatus = 'draft' | 'active' | 'paused' | 'closed';

export const MARKETPLACE_LISTING_STATUSES: readonly MarketplaceListingStatus[] = [
  'draft',
  'active',
  'paused',
  'closed',
] as const;

// ── Enrichment Job Status ────────────────────────────────────────────
export type EnrichmentJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export const ENRICHMENT_JOB_STATUSES: readonly EnrichmentJobStatus[] = [
  'pending',
  'processing',
  'completed',
  'failed',
] as const;

// ── User Approval Status ─────────────────────────────────────────────
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  'pending',
  'approved',
  'rejected',
] as const;

// ── Global Activity Queue ────────────────────────────────────────────
export type GlobalActivityStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const GLOBAL_ACTIVITY_STATUSES: readonly GlobalActivityStatus[] = [
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
] as const;
