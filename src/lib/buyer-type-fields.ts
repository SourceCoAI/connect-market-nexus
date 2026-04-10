import { BuyerType } from '@/types';

// Map canonical snake_case DB values to camelCase keys used in BUYER_TYPE_FIELD_MAPPINGS
const CANONICAL_TO_CAMEL: Record<string, string> = {
  private_equity: 'privateEquity',
  family_office: 'familyOffice',
  search_fund: 'searchFund',
  independent_sponsor: 'independentSponsor',
  individual_buyer: 'individual',
  corporate: 'corporate',
};

/** Normalize a buyer type to the camelCase key used in field mappings */
const normalizeBuyerType = (bt: string): string => CANONICAL_TO_CAMEL[bt] || bt;

// Define exactly which fields should be shown for each buyer type based on signup flow
export const BUYER_TYPE_FIELD_MAPPINGS = {
  basic: [
    'first_name',
    'last_name', 
    'email',
    'phone_number',
    'additional_phone_numbers',
    'company',
    'website',
    'linkedin_profile',
    'job_title',
  ],
  profile: [
    'bio',
    'ideal_target_description',
    'business_categories',
    'target_locations',
    'specific_business_search',
    'deal_intent',
    'exclusions',
    'include_keywords',
  ],
  // Revenue ranges shown for all except privateEquity in signup
  revenue: [
    'revenue_range_min',
    'revenue_range_max',
  ],
  // Buyer-specific fields based on actual signup form
  corporate: [
    'estimated_revenue',
    'owning_business_unit',
    'deal_size_band',
    'integration_plan',
    'corpdev_intent',
  ],
  privateEquity: [
    'fund_size',
    'investment_size', 
    'aum',
    'portfolio_company_addon',
    'deploying_capital_now',
  ],
  familyOffice: [
    'fund_size',
    'investment_size',
    'aum',
    'discretion_type',
    'permanent_capital',
    'operating_company_targets',
  ],
  searchFund: [
    'search_type',
    'acq_equity_band',
    'financing_plan',
    'flex_sub2m_ebitda',
    'anchor_investors_summary',
    'search_stage',
    // Legacy fields for compatibility
    'is_funded',
    'funded_by',
    'target_company_size',
  ],
  individual: [
    'funding_source',
    'needs_loan',
    'ideal_target',
    'max_equity_today_band',
    'uses_bank_finance',
  ],
  independentSponsor: [
    'committed_equity_band',
    'equity_source',
    'flex_subxm_ebitda',
    'backers_summary',
    'deployment_timing',
    'deal_structure_preference',
    'target_deal_size_min',
    'target_deal_size_max',
  ],
  advisor: [
    'on_behalf_of_buyer',
    'buyer_role',
    'buyer_org_url',
    'mandate_blurb',
  ],
  businessOwner: [
    'owner_intent',
    'owner_timeline',
  ],
  admin: [
    // Admin users have no specific buyer fields
  ],
} as const;

// Get all relevant fields for a specific buyer type
export const getRelevantFieldsForBuyerType = (buyerType: BuyerType | 'admin'): string[] => {
  // Admin users only need basic fields
  if (buyerType === 'admin') {
    return [...BUYER_TYPE_FIELD_MAPPINGS.basic];
  }
  
  const normalized = normalizeBuyerType(buyerType);
  const buyerSpecificFields = BUYER_TYPE_FIELD_MAPPINGS[normalized as keyof typeof BUYER_TYPE_FIELD_MAPPINGS] || [];

  return [
    ...BUYER_TYPE_FIELD_MAPPINGS.basic,
    ...BUYER_TYPE_FIELD_MAPPINGS.profile,
    // Add revenue ranges for all except privateEquity and independentSponsor
    ...(normalized !== 'privateEquity' && normalized !== 'independentSponsor' ? BUYER_TYPE_FIELD_MAPPINGS.revenue : []),
    ...buyerSpecificFields,
  ];
};

// Get buyer-specific financial fields only
export const getBuyerSpecificFields = (buyerType: BuyerType | 'admin'): string[] => {
  if (buyerType === 'admin') return [];
  const normalized = normalizeBuyerType(buyerType);
  return [...(BUYER_TYPE_FIELD_MAPPINGS[normalized as keyof typeof BUYER_TYPE_FIELD_MAPPINGS] || [])];
};

// Check if a field is relevant for a buyer type
export const isFieldRelevantForBuyerType = (fieldKey: string, buyerType: BuyerType | 'admin'): boolean => {
  const relevantFields = getRelevantFieldsForBuyerType(buyerType);
  return relevantFields.includes(fieldKey);
};

// Sourcing & Discovery fields (applies to all buyer types)
export const SOURCING_FIELDS = [
  'first_external_referrer',
  'first_blog_landing',
  'first_seen_at',
  'first_utm_source',
  'referral_source',
  'referral_source_detail',
  'deal_sourcing_methods',
  'target_acquisition_volume',
] as const;

// Field display labels
export const FIELD_LABELS = {
  bio: 'About Me',
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone_number: 'Phone',
  additional_phone_numbers: 'Additional Phone Numbers',
  company: 'Company',
  website: 'Website',
  linkedin_profile: 'LinkedIn',
  ideal_target_description: 'Target Description',
  business_categories: 'Business Categories',
  target_locations: 'Target Locations',
  specific_business_search: 'Specific Search',
  revenue_range_min: 'Min Revenue',
  revenue_range_max: 'Max Revenue',
  estimated_revenue: 'Estimated Revenue',
  fund_size: 'Fund Size',
  investment_size: 'Investment Size',
  aum: 'Assets Under Management',
  job_title: 'Job Title',
  portfolio_company_addon: 'Portfolio Company Add-on',
  deploying_capital_now: 'Deploying Capital',
  owning_business_unit: 'Business Unit',
  deal_size_band: 'Deal Size',
  integration_plan: 'Integration Plan',
  corpdev_intent: 'Speed/Intent',
  discretion_type: 'Decision Authority',
  permanent_capital: 'Permanent Capital',
  operating_company_targets: 'Operating Companies',
  committed_equity_band: 'Committed Equity',
  equity_source: 'Equity Source',
  flex_subxm_ebitda: 'Flexible on Size (<$1M EBITDA)',
  backers_summary: 'Backers',
  deployment_timing: 'Readiness Window',
  search_type: 'Search Type',
  acq_equity_band: 'Acquisition Equity',
  financing_plan: 'Financing Plan',
  flex_sub2m_ebitda: 'Flexible on Size',
  anchor_investors_summary: 'Anchor Investors',
  search_stage: 'Search Stage',
  on_behalf_of_buyer: 'On Behalf of Buyer',
  buyer_role: 'Buyer Role',
  buyer_org_url: 'Buyer Organization',
  mandate_blurb: 'Mandate',
  owner_intent: 'Intent',
  owner_timeline: 'Timeline',
  max_equity_today_band: 'Max Equity Today',
  uses_bank_finance: 'Uses Bank Finance',
  is_funded: 'Funding Status',
  funded_by: 'Funded By',
  target_company_size: 'Target Company Size',
  funding_source: 'Funding Source',
  needs_loan: 'SBA/Bank Loan',
  ideal_target: 'Ideal Target',
  target_deal_size_min: 'Min Deal Size',
  target_deal_size_max: 'Max Deal Size',
  geographic_focus: 'Geographic Focus',
  industry_expertise: 'Industry Expertise',
  deal_structure_preference: 'Deal Structure Preference',
  deal_intent: 'Deal Intent',
  exclusions: 'Hard Exclusions',
  include_keywords: 'Keywords',
  // Sourcing & Discovery labels
  referral_source: 'How They Found Us',
  referral_source_detail: 'Referral Details',
  deal_sourcing_methods: 'Deal Sourcing Methods',
  target_acquisition_volume: 'Target Acquisitions (12mo)',
  // First-touch cross-domain attribution labels
  first_external_referrer: 'Original Discovery Source',
  first_blog_landing: 'Blog Entry Page',
  first_seen_at: 'First Seen',
  first_utm_source: 'First UTM Source',
} as const;

// Get field categories for organization
export const getFieldCategories = (buyerType: BuyerType | 'admin') => {
  // Admin users only show contact information
  if (buyerType === 'admin') {
    return {
      'Contact Information': BUYER_TYPE_FIELD_MAPPINGS.basic.filter(field => 
        ['first_name', 'last_name', 'email', 'phone_number', 'additional_phone_numbers', 'company', 'job_title', 'website', 'linkedin_profile'].includes(field)
      ),
    };
  }

  return {
    'Contact Information': BUYER_TYPE_FIELD_MAPPINGS.basic.filter(field =>
      ['first_name', 'last_name', 'email', 'phone_number', 'additional_phone_numbers', 'company', 'job_title', 'website', 'linkedin_profile'].includes(field)
    ),
    'Business Profile': [
      ...BUYER_TYPE_FIELD_MAPPINGS.profile,
      ...(normalizeBuyerType(buyerType) !== 'privateEquity' && normalizeBuyerType(buyerType) !== 'independentSponsor' ? BUYER_TYPE_FIELD_MAPPINGS.revenue : []),
    ],
    'Financial Information': getBuyerSpecificFields(buyerType),
    'Sourcing & Discovery': [...SOURCING_FIELDS],
  };
};