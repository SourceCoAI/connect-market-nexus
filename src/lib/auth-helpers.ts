import { User, ApprovalStatus, BuyerType } from '@/types';

// Extended User type with data quality flag
export interface UserWithDataIssues extends User {
  _hasDataIssues?: boolean;
  _dataIssues?: string[];
}

/**
 * Safely parse JSON, returning fallback on failure
 */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Safely convert to array, handling various input types
 */
function safeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    if (value === '') return [];
    // Try JSON parse first
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to treating as comma-separated
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * Creates a User object from profile data.
 * NEVER THROWS - always returns a valid User object.
 * Sets _hasDataIssues flag if data was malformed.
 */
export function createUserObject(profile: Record<string, unknown>): UserWithDataIssues {
  const issues: string[] = [];

  // Handle completely invalid input - return minimal user
  if (!profile) {
    return createMinimalUser(
      'unknown-' + Date.now(),
      '',
      issues.concat(['Profile was null/undefined']),
    );
  }

  if (!profile.id) {
    return createMinimalUser(
      'unknown-' + Date.now(),
      (profile.email as string) || '',
      issues.concat(['Profile missing ID']),
    );
  }

  // Track any parsing issues
  let businessCategories: string[] = [];
  try {
    businessCategories = safeArray(profile.business_categories);
  } catch (e) {
    issues.push('Failed to parse business_categories');
    businessCategories = [];
  }

  let dealSourcingMethods: string[] = [];
  try {
    dealSourcingMethods = safeArray(profile.deal_sourcing_methods);
  } catch (e) {
    issues.push('Failed to parse deal_sourcing_methods');
    dealSourcingMethods = [];
  }

  const user: UserWithDataIssues = {
    id: profile.id as string,
    email: (profile.email as string) || '',
    first_name: (profile.first_name as string) || '',
    last_name: (profile.last_name as string) || '',
    company: (profile.company as string) || (profile.company_name as string) || '',
    website: (profile.website as string) || '',
    phone_number: (profile.phone_number as string) || '',
    additional_phone_numbers: safeArray(profile.additional_phone_numbers),
    role: 'buyer' as const,
    email_verified: Boolean(profile.email_verified === true),
    approval_status: (profile.approval_status || 'pending') as ApprovalStatus,
    is_admin: Boolean(profile.is_admin === true),
    buyer_type: (profile.buyer_type || 'corporate') as BuyerType,
    created_at: (profile.created_at as string) || new Date().toISOString(),
    updated_at: (profile.updated_at as string) || new Date().toISOString(),
    company_name: (profile.company_name as string) || (profile.company as string) || '',
    estimated_revenue: (profile.estimated_revenue as string) || '',
    fund_size: (profile.fund_size as string) || '',
    investment_size: safeArray(profile.investment_size),
    aum: (profile.aum as string) || '',
    is_funded: (profile.is_funded as string) || '',
    funded_by: (profile.funded_by as string) || '',
    target_company_size: (profile.target_company_size as string) || '',
    funding_source: (profile.funding_source as string) || '',
    needs_loan: (profile.needs_loan as string) || '',
    ideal_target: (profile.ideal_target as string) || '',
    bio: (profile.bio as string) || '',
    linkedin_profile: (profile.linkedin_profile as string) || '',
    ideal_target_description: (profile.ideal_target_description as string) || '',
    business_categories: businessCategories,
    target_locations: safeArray(profile.target_locations),
    revenue_range_min: (profile.revenue_range_min as string) || undefined,
    revenue_range_max: (profile.revenue_range_max as string) || undefined,
    specific_business_search: (profile.specific_business_search as string) || '',
    onboarding_completed: Boolean(profile.onboarding_completed),
    job_title: (profile.job_title as string) || '',

    // Fee agreement tracking fields
    fee_agreement_signed: Boolean(profile.fee_agreement_signed),
    fee_agreement_signed_at: (profile.fee_agreement_signed_at as string) || undefined,
    fee_agreement_email_sent: Boolean(profile.fee_agreement_email_sent),
    fee_agreement_email_sent_at: (profile.fee_agreement_email_sent_at as string) || undefined,

    // NDA tracking fields
    nda_signed: Boolean(profile.nda_signed),
    nda_signed_at: (profile.nda_signed_at as string) || undefined,
    nda_email_sent: Boolean(profile.nda_email_sent),
    nda_email_sent_at: (profile.nda_email_sent_at as string) || undefined,

    // All comprehensive buyer-specific fields
    // Private Equity
    deploying_capital_now: (profile.deploying_capital_now as string) || '',
    // Corporate Development
    owning_business_unit: (profile.owning_business_unit as string) || '',
    deal_size_band: (profile.deal_size_band as string) || '',
    buyer_org_url: (profile.buyer_org_url as string) || '',
    integration_plan: safeArray(profile.integration_plan),
    corpdev_intent: (profile.corpdev_intent as string) || '',
    // Family Office
    discretion_type: (profile.discretion_type as string) || '',
    // Independent Sponsor
    committed_equity_band: (profile.committed_equity_band as string) || '',
    equity_source: safeArray(profile.equity_source),
    deployment_timing: (profile.deployment_timing as string) || '',
    target_deal_size_min: (profile.target_deal_size_min as number) || undefined,
    target_deal_size_max: (profile.target_deal_size_max as number) || undefined,
    geographic_focus: safeArray(profile.geographic_focus),
    industry_expertise: safeArray(profile.industry_expertise),
    deal_structure_preference: (profile.deal_structure_preference as string) || '',
    permanent_capital: (profile.permanent_capital as boolean) || undefined,
    operating_company_targets: safeArray(profile.operating_company_targets),
    flex_subxm_ebitda: (profile.flex_subxm_ebitda as boolean) ?? undefined,
    flex_subXm_ebitda: (profile.flex_subxm_ebitda as boolean) ?? undefined,
    // Search Fund
    search_type: (profile.search_type as string) || '',
    acq_equity_band: (profile.acq_equity_band as string) || '',
    financing_plan: safeArray(profile.financing_plan),
    search_stage: (profile.search_stage as string) || '',
    flex_sub2m_ebitda: (profile.flex_sub2m_ebitda as boolean) || undefined,
    // Advisor/Banker
    on_behalf_of_buyer: (profile.on_behalf_of_buyer as string) || '',
    buyer_role: (profile.buyer_role as string) || '',
    // Business Owner
    owner_timeline: (profile.owner_timeline as string) || '',
    owner_intent: (profile.owner_intent as string) || '',
    // Individual Investor
    uses_bank_finance: (profile.uses_bank_finance as string) || '',
    max_equity_today_band: (profile.max_equity_today_band as string) || '',
    // Additional comprehensive fields
    mandate_blurb: (profile.mandate_blurb as string) || '',
    portfolio_company_addon: (profile.portfolio_company_addon as string) || '',
    backers_summary: (profile.backers_summary as string) || '',
    anchor_investors_summary: (profile.anchor_investors_summary as string) || '',

    // Missing fields that weren't being mapped
    deal_intent: (profile.deal_intent as string) || '',
    exclusions: safeArray(profile.exclusions),
    include_keywords: safeArray(profile.include_keywords),

    // Referral source tracking (Step 3)
    referral_source: (profile.referral_source as string) || undefined,
    referral_source_detail: (profile.referral_source_detail as string) || undefined,

    // Deal sourcing questions (Step 3)
    deal_sourcing_methods: dealSourcingMethods,
    target_acquisition_volume: (profile.target_acquisition_volume as string) || undefined,

    // Buyer Quality Score fields
    buyer_quality_score: (profile.buyer_quality_score as number) ?? null,
    buyer_tier: (profile.buyer_tier as number) ?? null,
    platform_signal_detected: Boolean(profile.platform_signal_detected),
    platform_signal_source: (profile.platform_signal_source as string) || null,
    buyer_quality_score_last_calculated:
      (profile.buyer_quality_score_last_calculated as string) || null,
    admin_tier_override: (profile.admin_tier_override as number) ?? null,
    admin_override_note: (profile.admin_override_note as string) || null,

    // Data quality flags
    _hasDataIssues: issues.length > 0,
    _dataIssues: issues.length > 0 ? issues : undefined,

    get firstName() {
      return this.first_name;
    },
    get lastName() {
      return this.last_name;
    },
    get phoneNumber() {
      return this.phone_number;
    },
    get isAdmin() {
      return this.is_admin;
    },
    get buyerType() {
      return this.buyer_type;
    },
    get emailVerified() {
      return this.email_verified;
    },
    get isApproved() {
      return this.approval_status === 'approved';
    },
    get createdAt() {
      return this.created_at;
    },
    get updatedAt() {
      return this.updated_at;
    },
  };

  return user;
}

/**
 * Creates a minimal valid User object for error cases
 */
function createMinimalUser(id: string, email: string, issues: string[]): UserWithDataIssues {
  return {
    id,
    email,
    first_name: '',
    last_name: '',
    company: '',
    website: '',
    phone_number: '',
    additional_phone_numbers: [],
    role: 'buyer' as const,
    email_verified: false,
    approval_status: 'pending' as ApprovalStatus,
    is_admin: false,
    buyer_type: 'individual' as BuyerType,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _hasDataIssues: true,
    _dataIssues: issues,
    get firstName() {
      return this.first_name;
    },
    get lastName() {
      return this.last_name;
    },
    get phoneNumber() {
      return this.phone_number;
    },
    get isAdmin() {
      return this.is_admin;
    },
    get buyerType() {
      return this.buyer_type;
    },
    get emailVerified() {
      return this.email_verified;
    },
    get isApproved() {
      return this.approval_status === 'approved';
    },
    get createdAt() {
      return this.created_at;
    },
    get updatedAt() {
      return this.updated_at;
    },
  };
}

export function isUserAdmin(user: User | null): boolean {
  if (!user) return false;
  return user.is_admin === true;
}

export function getUserDisplayName(user: User | null): string {
  if (!user) return 'Unknown User';
  if (user.first_name && user.last_name) {
    return `${user.first_name} ${user.last_name}`;
  }
  if (user.first_name) return user.first_name;
  if (user.last_name) return user.last_name;
  return user.email || 'Unknown User';
}

export function getUserInitials(user: User | null): string {
  if (!user) return 'U';
  const firstName = user.first_name || '';
  const lastName = user.last_name || '';
  return (
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() ||
    user.email?.charAt(0).toUpperCase() ||
    'U'
  );
}

export function validateUserData(user: User): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!user.id) errors.push('User ID is required');
  if (!user.email) errors.push('Email is required');
  if (!user.first_name) errors.push('First name is required');
  if (!user.last_name) errors.push('Last name is required');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (user.email && !emailRegex.test(user.email)) {
    errors.push('Invalid email format');
  }

  const validStatuses: ApprovalStatus[] = ['pending', 'approved', 'rejected'];
  if (!validStatuses.includes(user.approval_status)) {
    errors.push('Invalid approval status');
  }

  const validBuyerTypes: string[] = [
    // Canonical snake_case (DB)
    'private_equity',
    'corporate',
    'family_office',
    'independent_sponsor',
    'search_fund',
    'individual_buyer',
    // Legacy camelCase (signup form + pre-migration profiles)
    'privateEquity',
    'familyOffice',
    'searchFund',
    'individual',
    'independentSponsor',
    'advisor',
    'businessOwner',
  ];
  if (!validBuyerTypes.includes(user.buyer_type)) {
    errors.push('Invalid buyer type');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Nuclear simplification: Remove all localStorage cleanup functions
// Let Supabase handle all session management
export async function cleanupAuthState(): Promise<void> {
  // Nuclear auth cleanup - let Supabase handle everything
}
