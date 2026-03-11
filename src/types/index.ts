// ── Core domain types ────────────────────────────────────────────────
// This barrel file is the single import point for shared application types.

export type UserRole = 'admin' | 'buyer';

/** Internal team role for admin-panel access control. */
export type TeamRole = 'owner' | 'admin' | 'moderator' | 'viewer';

/**
 * Marketplace signup buyer type — camelCase values stored in the profiles table.
 * NOTE: The remarketing/buyers table uses the canonical snake_case BuyerType
 * defined in src/types/remarketing.ts and src/types/status-enums.ts.
 * A future migration should align profiles.buyer_type to the canonical enum.
 */
export type SignupBuyerType =
  | 'corporate'
  | 'privateEquity'
  | 'familyOffice'
  | 'searchFund'
  | 'individual'
  | 'independentSponsor'
  | 'advisor'
  | 'businessOwner';

/** @deprecated Use SignupBuyerType (marketplace) or BuyerType from @/types/remarketing (canonical). */
export type BuyerType = SignupBuyerType;

/** @deprecated Import ApprovalStatus from '@/types/status-enums' instead. */
import type { ApprovalStatus } from './status-enums';
export type { ApprovalStatus } from './status-enums';

export type ListingStatus = 'active' | 'inactive';

/**
 * Simplified connection request status for marketplace-facing code.
 * The canonical 5-value type is ConnectionRequestStatus from status-enums.ts.
 */
export type ConnectionRequestStatus = 'pending' | 'approved' | 'rejected';

/** Severity levels used by the error handling subsystem. */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/** JSON-compatible value (mirrors Supabase Json type). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Generic async operation result wrapper. */
export interface AsyncResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
}

/** Metadata record that avoids bare `any`. */
export type Metadata = Record<string, unknown>;

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  website: string;
  phone_number: string;
  role: UserRole;
  /** Internal team role fetched from user_roles table. */
  team_role?: TeamRole;
  email_verified: boolean;
  approval_status: ApprovalStatus;
  is_admin: boolean;
  buyer_type: BuyerType;
  created_at: string;
  updated_at: string;
  // Additional fields from profiles table
  company_name?: string;
  estimated_revenue?: string;
  fund_size?: string;
  investment_size?: string | string[];
  aum?: string;
  is_funded?: string;
  funded_by?: string;
  target_company_size?: string;
  funding_source?: string;
  needs_loan?: string;
  ideal_target?: string;
  bio?: string;
  // New buyer profile fields
  linkedin_profile?: string;
  ideal_target_description?: string;
  business_categories?: string[];
  target_locations?: string[] | string;
  revenue_range_min?: string;
  revenue_range_max?: string;
  specific_business_search?: string;
  onboarding_completed?: boolean;

  // Independent sponsor specific fields
  target_deal_size_min?: number;
  target_deal_size_max?: number;
  geographic_focus?: string[];
  industry_expertise?: string[];
  deal_structure_preference?: string;

  // New common fields
  job_title?: string;

  // Private Equity fields
  portfolio_company_addon?: string;
  deploying_capital_now?: string;

  // Corporate Development fields
  owning_business_unit?: string;
  deal_size_band?: string;
  integration_plan?: string[];
  corpdev_intent?: string;

  // Family Office fields
  discretion_type?: string;
  permanent_capital?: boolean;
  operating_company_targets?: string[];

  // Independent Sponsor fields (enhanced)
  committed_equity_band?: string;
  equity_source?: string[];
  // Canonical DB column name
  flex_subxm_ebitda?: boolean;
  /** @deprecated Use flex_subxm_ebitda instead */
  flex_subXm_ebitda?: boolean;
  backers_summary?: string;
  deployment_timing?: string;

  // Search Fund fields (redesigned)
  search_type?: string;
  acq_equity_band?: string;
  financing_plan?: string[];
  flex_sub2m_ebitda?: boolean;
  anchor_investors_summary?: string;
  search_stage?: string;

  // Advisor/Banker fields
  on_behalf_of_buyer?: string;
  buyer_role?: string;
  buyer_org_url?: string;
  mandate_blurb?: string;

  // Business Owner fields
  owner_intent?: string;
  owner_timeline?: string;

  // Individual Investor fields (enhanced)
  max_equity_today_band?: string;
  uses_bank_finance?: string;

  // New Step 4 fields
  deal_intent?: string;
  exclusions?: string[];
  include_keywords?: string[];

  // Referral source tracking (How did you hear about us?)
  referral_source?: string;
  referral_source_detail?: string;

  // Deal sourcing questions (stored as jsonb in DB)
  deal_sourcing_methods?: string[] | unknown;
  target_acquisition_volume?: string;

  // First-touch cross-domain attribution (permanent, from user_journeys)
  first_external_referrer?: string;
  first_blog_landing?: string;
  first_seen_at?: string;
  first_utm_source?: string;

  // Additional investment criteria fields
  company_type?: string;
  years_in_business?: number;
  preferred_entry_strategy?: string;
  preferred_deal_structure?: string;
  willing_to_relocate?: boolean;
  partner_in_operations?: boolean;
  ownership_status?: string;
  interest_in_franchises?: boolean;
  search_fund_status?: string;
  add_on_only?: boolean;
  platform_only?: boolean;
  additional_thesis_details?: string;
  ebitda_min?: string;
  ebitda_max?: string;

  // Fee agreement tracking
  fee_agreement_signed?: boolean;
  fee_agreement_signed_at?: string;
  fee_agreement_email_sent?: boolean;
  fee_agreement_email_sent_at?: string;

  // NDA tracking
  nda_signed?: boolean;
  nda_signed_at?: string;
  nda_email_sent?: boolean;
  nda_email_sent_at?: string;

  // Buyer Quality Score fields
  buyer_quality_score?: number | null;
  buyer_tier?: number | null; // 1 = Platform+Add-On, 2 = Committed Capital, 3 = Indep. Sponsor/Search, 4 = Unverified
  platform_signal_detected?: boolean;
  platform_signal_source?: string | null;
  buyer_quality_score_last_calculated?: string | null;
  admin_tier_override?: number | null;
  admin_override_note?: string | null;

  // Computed properties (aliases for snake_case properties)
  readonly firstName: string;
  readonly lastName: string;
  readonly phoneNumber: string;
  readonly isAdmin: boolean;
  readonly buyerType: BuyerType;
  readonly emailVerified: boolean;
  readonly isApproved: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Listing {
  id: string;
  title: string;
  categories: string[]; // Array of categories
  category: string; // Keep for backward compatibility
  acquisition_type?: 'add_on' | 'platform' | string | null;
  executive_summary?: string | null;
  location: string;
  revenue: number;
  ebitda: number;
  description: string;
  description_html?: string;
  description_json?: Record<string, unknown>;
  hero_description?: string | null;
  tags: string[];
  owner_notes?: string;
  files?: string[];
  created_at: string;
  updated_at: string;
  image_url?: string | null;
  status: ListingStatus;
  status_tag?: string | null;

  // Buyer visibility control
  visible_to_buyer_types?: string[] | null;

  // Internal admin fields
  deal_identifier?: string | null;
  internal_company_name?: string | null;
  internal_primary_owner?: string | null; // Deprecated - use primary_owner_id
  primary_owner_id?: string | null; // UUID reference to profiles table
  internal_salesforce_link?: string | null;
  internal_deal_memo_link?: string | null;
  internal_contact_info?: string | null;
  internal_notes?: string | null;

  // Employee information
  full_time_employees?: number;
  part_time_employees?: number;

  // Enhanced metrics
  custom_metric_label?: string | null;
  custom_metric_value?: string | null;
  custom_metric_subtitle?: string | null;
  metric_3_type?: 'employees' | 'custom';
  metric_3_custom_label?: string | null;
  metric_3_custom_value?: string | null;
  metric_3_custom_subtitle?: string | null;
  metric_4_type?: string | null;
  metric_4_custom_label?: string | null;
  metric_4_custom_value?: string | null;
  metric_4_custom_subtitle?: string | null;
  revenue_metric_subtitle?: string | null;
  ebitda_metric_subtitle?: string | null;
  presented_by_admin_id?: string | null;

  // Structured business details (buyer-visible)
  geographic_states?: string[] | null;
  services?: string[] | null;
  number_of_locations?: number | null;
  customer_types?: string | null;
  revenue_model?: string | null;
  business_model?: string | null;
  growth_trajectory?: string | null;

  // Seller/deal context fields
  ownership_structure?: string | null;
  management_depth?: string | null;
  seller_motivation?: string | null;
  timeline_preference?: string | null;
  seller_involvement_preference?: string | null;
  cash_flow?: number | null;
  custom_sections?: Array<{ title: string; description: string }> | null;

  // Computed properties (aliases for snake_case properties)
  readonly ownerNotes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly multiples?: {
    revenue: string;
    value: string;
  };
  readonly revenueFormatted?: string;
  readonly ebitdaFormatted?: string;
}

export interface ConnectionRequest {
  id: string;
  user_id: string;
  listing_id: string;
  status: ConnectionRequestStatus;
  admin_comment?: string;
  user_message?: string;
  created_at: string;
  updated_at: string;
  listing?: Partial<Listing>;
}

export interface FilterOptions {
  category?: string;
  location?: string;
  revenueMin?: number;
  revenueMax?: number;
  ebitdaMin?: number;
  ebitdaMax?: number;
  search?: string;
  status?: string;
  page?: number;
  perPage?: number;
}

export interface PaginationState {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
}

// ── Re-exports from sibling type modules ─────────────────────────────
export type {
  AdminListing,
  CreateListingData,
  AdminConnectionRequest,
  AdminStats,
  AdminActivity,
} from './admin';
export type {
  AnalyticsEvent,
  FeedbackAnalytics,
  DailyTrend,
  TopUser,
  MarketplaceAnalytics,
  TestResult,
  AnalyticsHealth,
} from './analytics';
export type { NonMarketplaceUser, NonMarketplaceUserFilters } from './non-marketplace-user';
export type { Transcript, WebhookConfig, WebhookDelivery, TranscriptHealth } from './transcript';
export type {
  ListingPipelineStatus,
  ConnectionRequestStatus as FullConnectionRequestStatus,
  IntroductionStatus as FullIntroductionStatus,
  MemoStatus,
  MarketplaceListingStatus,
  EnrichmentJobStatus,
  BuyerTypeEnum,
  GlobalActivityStatus,
} from './status-enums';
export {
  LISTING_PIPELINE_STATUSES,
  CONNECTION_REQUEST_STATUSES,
  INTRODUCTION_STATUSES,
  MEMO_STATUSES,
  MARKETPLACE_LISTING_STATUSES,
  ENRICHMENT_JOB_STATUSES,
  BUYER_TYPE_ENUMS,
  GLOBAL_ACTIVITY_STATUSES,
} from './status-enums';
