// Standardized options for new signup fields

export const BUYER_TYPE_OPTIONS = [
  {
    value: 'privateEquity',
    label: 'Private Equity',
    description: 'Investment funds focused on acquiring and growing companies'
  },
  {
    value: 'corporate',
    label: 'Corporate Development (Strategic)',
    description: 'Corporate buyers seeking strategic acquisitions'
  },
  {
    value: 'familyOffice',
    label: 'Family Office',
    description: 'Private wealth management offices making direct investments'
  },
  {
    value: 'independentSponsor',
    label: 'Independent Sponsor',
    description: 'Deal-by-deal investment professionals'
  },
  {
    value: 'searchFund',
    label: 'Search Fund',
    description: 'Entrepreneur-led acquisition vehicles'
  },
  {
    value: 'individual',
    label: 'Individual Investor',
    description: 'High-net-worth individuals making personal investments'
  },
  {
    value: 'advisor',
    label: 'Advisor / Banker',
    description: 'Investment bankers and M&A advisors'
  },
  {
    value: 'businessOwner',
    label: 'Business Owner / Operator',
    description: 'Current operators exploring add-on or platform acquisitions'
  }
] as const;

// Private Equity specific options
export const DEPLOYING_CAPITAL_OPTIONS = [
  { value: 'actively_deploying', label: 'Actively deploying' },
  { value: 'between_funds', label: 'Between funds / raising' }
] as const;

// Corporate Development options
export const DEAL_SIZE_BAND_OPTIONS = [
  { value: 'sub_25m', label: 'Sub-$25M' },
  { value: '25_100m', label: '$25–100M' },
  { value: '100m_plus', label: '$100M+' }
] as const;

export const INTEGRATION_PLAN_OPTIONS = [
  { value: 'brand_tuck_in', label: 'Brand tuck-in (same BU)' },
  { value: 'product_capability', label: 'Product/Capability extension' },
  { value: 'geographic_expansion', label: 'Geographic expansion' },
  { value: 'standalone_subsidiary', label: 'Standalone subsidiary/new brand' },
  { value: 'asset_carve_in', label: 'Asset carve-in' },
  { value: 'not_sure', label: 'Not sure yet' },
  { value: 'other', label: 'Other' }
] as const;

export const CORPDEV_INTENT_OPTIONS = [
  { value: 'actively_evaluating', label: 'Actively evaluating add-ons now' },
  { value: 'opportunistic', label: 'Opportunistic / monitoring' }
] as const;

// Family Office options
export const DISCRETION_TYPE_OPTIONS = [
  { value: 'discretionary', label: 'Discretionary' },
  { value: 'advisory_only', label: 'Advisory-only' }
] as const;

// Independent Sponsor options
export const COMMITTED_EQUITY_BAND_OPTIONS = [
  { value: '0_1m', label: '$0–1M' },
  { value: '1_5m', label: '$1–5M' },
  { value: '5_20m', label: '$5–20M' },
  { value: '20_50m', label: '$20–50M' },
  { value: '50m_plus', label: '$50M+' }
] as const;

export const EQUITY_SOURCE_OPTIONS = [
  { value: 'named_lps', label: 'Named LPs committed' },
  { value: 'soft_circled', label: 'Soft-circled LPs' },
  { value: 'family_office', label: 'Family office partners' },
  { value: 'self_funded', label: 'Self-funded' },
  { value: 'deal_by_deal', label: 'Deal-by-deal SPV' },
  { value: 'other', label: 'Other' }
] as const;

export const DEPLOYMENT_TIMING_OPTIONS = [
  { value: 'actively_deploying', label: 'Actively deploying this quarter' },
  { value: 'opportunistic', label: 'Opportunistic / monitoring' }
] as const;

// Search Fund options
export const SEARCH_TYPE_OPTIONS = [
  { value: 'traditional', label: 'Traditional (committed investors)' },
  { value: 'self_funded', label: 'Self-funded' }
] as const;

export const ACQ_EQUITY_BAND_OPTIONS = [
  { value: '0_1m', label: '$0–1M' },
  { value: '1_3m', label: '$1–3M' },
  { value: '3_5m', label: '$3–5M' },
  { value: '5_10m', label: '$5–10M' },
  { value: '10m_plus', label: '$10M+' }
] as const;

export const FINANCING_PLAN_OPTIONS = [
  { value: 'equity_only', label: 'Equity only' },
  { value: 'equity_sba', label: 'Equity + SBA/Bank debt' },
  { value: 'equity_seller', label: 'Equity + Seller note' },
  { value: 'equity_bank_seller', label: 'Equity + Bank + Seller note' }
] as const;

export const SEARCH_STAGE_OPTIONS = [
  { value: 'launching', label: 'Launching (0–3 mo)' },
  { value: 'actively_searching', label: 'Actively searching' },
  { value: 'under_loi', label: 'Under LOI' },
  { value: 'in_diligence', label: 'In diligence' }
] as const;

// Advisor/Banker options
export const ON_BEHALF_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' }
] as const;

export const BUYER_ROLE_OPTIONS = [
  { value: 'pe', label: 'PE' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'independent_sponsor', label: 'Independent Sponsor/Search' },
  { value: 'other', label: 'Other (please specify)' }
] as const;

// Business Owner options
export const OWNER_TIMELINE_OPTIONS = [
  { value: 'now', label: 'Now' },
  { value: '3_6_months', label: '3–6 months' },
  { value: '6_12_months', label: '6–12 months' },
  { value: '12_plus_months', label: '12+ months' },
  { value: 'exploring', label: 'Just exploring' }
] as const;

// Individual Investor options
export const INDIVIDUAL_FUNDING_SOURCE_OPTIONS = [
  { value: 'personal_savings', label: 'Personal savings' },
  { value: 'sba_bank', label: 'SBA/Bank' },
  { value: 'partners_investors', label: 'Partners/Investors' },
  { value: 'other', label: 'Other' }
] as const;

export const USES_BANK_FINANCE_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure' }
] as const;

export const MAX_EQUITY_TODAY_OPTIONS = [
  { value: 'under_250k', label: '<$250K' },
  { value: '250_500k', label: '$250–500K' },
  { value: '500k_1m', label: '$500K–$1M' },
  { value: '1_2m', label: '$1–2M' },
  { value: '2m_plus', label: '$2M+' }
] as const;

// New Step 4 fields
export const DEAL_INTENT_OPTIONS = [
  { value: 'primarily_addons', label: 'Primarily add-ons' },
  { value: 'platform_and_addons', label: 'Platform and add-ons' },
  { value: 'platform_only', label: 'Platform only' }
] as const;

// Deal sourcing methods (multi-select)
export const DEAL_SOURCING_METHOD_OPTIONS = [
  { value: 'in_house_bd', label: 'In-house BD team' },
  { value: 'brokers_bankers', label: 'Brokers / Bankers (inbound)' },
  { value: 'databases', label: 'Databases (Grata, PitchBook, etc.)' },
  { value: 'proprietary_outreach', label: 'Proprietary outreach' },
  { value: 'buy_side_firms', label: 'Buy-side advisory firms' },
  { value: 'not_actively_sourcing', label: 'Not actively sourcing yet' }
] as const;

// Target acquisition volume (dropdown)
export const TARGET_ACQUISITION_VOLUME_OPTIONS = [
  { value: 'exploring', label: 'Exploring opportunities' },
  { value: '1_2', label: '1–2 deals' },
  { value: '3_5', label: '3–5 deals' },
  { value: '6_10', label: '6–10 deals' },
  { value: '10_plus', label: '10+ deals' }
] as const;