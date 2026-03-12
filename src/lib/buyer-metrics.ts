import { BuyerType, User } from '@/types';
import { parseCurrency, formatCurrency, formatRevenueRange } from './currency-utils';
import { processUrl } from './url-utils';
import { getRelevantFieldsForBuyerType } from './buyer-type-fields';

/**
 * Format financial values that are entered as raw numbers but represent millions
 * Users enter "46" to mean "$46M" based on placeholder text
 * Also handles cases where values are already in millions (like 5,000,000 -> $5M)
 */
function formatFinancialMillions(value: string | number | string[]): string {
  if (!value) return '';
  
  // Handle array format for investment_size
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  
  const numericValue = typeof value === 'number' ? value : parseFloat(value.toString().replace(/,/g, ''));
  if (isNaN(numericValue)) return '';
  
  // If the value is 1,000,000 or more, it's likely already the full amount - convert to millions
  if (numericValue >= 1000000) {
    const millions = numericValue / 1000000;
    return `$${millions.toFixed(millions % 1 === 0 ? 0 : 1)}M`;
  }
  
  // If the value is less than 1000, assume it's in millions already
  if (numericValue < 1000) {
    return `$${numericValue.toFixed(numericValue % 1 === 0 ? 0 : 1)}M`;
  }
  
  // For values between 1000-999999, treat as thousands and convert to millions
  const millions = numericValue / 1000;
  return `$${millions.toFixed(millions % 1 === 0 ? 0 : 1)}M`;
}

// Buyer tier system (1-5, where 1 is highest priority)
export type BuyerTier = 1 | 2 | 3 | 4 | 5;

export interface BuyerMetric {
  label: string;
  value: string;
  isPrimary?: boolean;
  isClickable?: boolean;
  href?: string;
  completeness?: 'complete' | 'partial' | 'missing';
}

export interface BuyerTierInfo {
  tier: BuyerTier;
  badge: string;
  color: string;
  description: string;
}

/**
 * Determine buyer tier based on type and financial metrics
 */
export function getBuyerTier(user: User | null): BuyerTierInfo {
  if (!user?.buyer_type) {
    return { tier: 5, badge: '5', color: 'text-muted-foreground', description: 'No type specified' };
  }

  const buyerType = user.buyer_type as BuyerType;
  
  // Parse financial metrics for tier determination
  const aum = parseCurrency(user.aum || '0');
  const fundSize = parseCurrency(user.fund_size || '0');
  const maxFinancial = Math.max(aum, fundSize);

  switch (buyerType) {
    case 'private_equity':
      if (maxFinancial >= 1000000000) { // $1B+
        return { tier: 1, badge: '🏆', color: 'text-emerald-600', description: 'Premier PE ($1B+)' };
      } else if (maxFinancial >= 200000000) { // $200M+
        return { tier: 1, badge: '1', color: 'text-emerald-600', description: 'Tier 1 PE' };
      }
      return { tier: 1, badge: '1', color: 'text-emerald-500', description: 'Private Equity' };
      
    case 'family_office':
      if (maxFinancial >= 1000000000) { // $1B+
        return { tier: 2, badge: '🏆', color: 'text-blue-600', description: 'Premier Family Office ($1B+)' };
      }
      return { tier: 2, badge: '2', color: 'text-blue-600', description: 'Family Office' };
      
    case 'independent_sponsor':
      return { tier: 2, badge: '2', color: 'text-purple-600', description: 'Independent Sponsor' };
      
    case 'corporate':
      return { tier: 3, badge: '3', color: 'text-amber-600', description: 'Corporate' };
      
    case 'advisor': // legacy
      return { tier: 4, badge: '4', color: 'text-teal-600', description: 'Advisor/Banker' };
      
    case 'search_fund':
      return { tier: 4, badge: '4', color: 'text-orange-600', description: 'Search Fund' };
      
    case 'business_owner':
      return { tier: 5, badge: '5', color: 'text-gray-600', description: 'Business Owner' };
      
    case 'individual_buyer':
      return { tier: 5, badge: '5', color: 'text-gray-600', description: 'Individual' };
      
    default:
      return { tier: 5, badge: '5', color: 'text-muted-foreground', description: 'Unknown' };
  }
}

/**
 * Get primary metrics to display for each buyer type
 */
export function getPrimaryMetrics(user: User | null): BuyerMetric[] {
  if (!user?.buyer_type) return [];

  const buyerType = user.buyer_type as BuyerType;
  const metrics: BuyerMetric[] = [];

  // Job title (always show if available)
  if (user.job_title) {
    metrics.push({
      label: 'Job Title',
      value: user.job_title,
      completeness: 'complete'
    });
  }

  // Company name and website (always show if available)
  if (user.company) {
    const hasWebsite = user.website && user.website.trim() !== '';
    metrics.push({
      label: 'Company',
      value: user.company,
      isClickable: !!hasWebsite,
      href: hasWebsite ? processUrl(user.website) : undefined,
      completeness: 'complete'
    });
  }

  // LinkedIn (always valuable for validation)
  if (user.linkedin_profile) {
    let linkedinUrl: string | undefined;
    try {
      const candidateUrl = user.linkedin_profile.startsWith('http')
        ? user.linkedin_profile
        : `https://linkedin.com/in/${user.linkedin_profile}`;
      const parsed = new URL(candidateUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        linkedinUrl = parsed.href;
      }
    } catch {
      // Invalid URL — don't construct a link
    }
    metrics.push({
      label: 'LinkedIn',
      value: 'Profile',
      isClickable: !!linkedinUrl,
      href: linkedinUrl,
      completeness: 'complete'
    });
  }

  // Type-specific metrics
  switch (buyerType) {
    case 'private_equity':
      // Priority: AUM → Fund Size → Investment Size
      if (user.aum) {
        metrics.push({
          label: 'AUM',
          value: formatFinancialMillions(user.aum),
          isPrimary: true,
          completeness: 'complete'
        });
      } else if (user.fund_size) {
        metrics.push({
          label: 'Fund Size',
          value: formatFinancialMillions(user.fund_size),
          isPrimary: true,
          completeness: 'complete'
        });
      } else if (user.investment_size) {
        metrics.push({
          label: 'Investment Size',
          value: formatFinancialMillions(user.investment_size),
          isPrimary: true,
          completeness: 'partial'
        });
      }
      break;

    case 'family_office':
      // Show AUM → Investment Size → Revenue Targets
      if (user.aum) {
        metrics.push({
          label: 'AUM',
          value: formatFinancialMillions(user.aum),
          isPrimary: true,
          completeness: 'complete'
        });
      } else if (user.fund_size) {
        metrics.push({
          label: 'Fund Size',
          value: formatFinancialMillions(user.fund_size),
          isPrimary: true,
          completeness: 'complete'
        });
      }
      if (user.investment_size) {
        metrics.push({
          label: 'Investment Size',
          value: formatFinancialMillions(user.investment_size),
          completeness: 'complete'
        });
      }
      if (user.revenue_range_min || user.revenue_range_max) {
        metrics.push({
          label: 'Revenue Target',
          value: formatRevenueRange(user.revenue_range_min, user.revenue_range_max),
          completeness: 'complete'
        });
      }
      break;

    case 'independent_sponsor':
      if (user.committed_equity_band) {
        metrics.push({
          label: 'Committed Equity',
          value: user.committed_equity_band,
          isPrimary: true,
          completeness: 'complete'
        });
      }
      if (Array.isArray(user.equity_source) && user.equity_source.length > 0) {
        metrics.push({
          label: 'Equity Sources',
          value: user.equity_source.join(', '),
          completeness: 'complete'
        });
      }
      if (user.target_deal_size_min || user.target_deal_size_max) {
        metrics.push({
          label: 'Target Deal Size',
          value: formatFinancialRange(user.target_deal_size_min || 0, user.target_deal_size_max || 0),
          completeness: 'complete'
        });
      }
      if (user.backers_summary) {
        metrics.push({
          label: 'Backers',
          value: user.backers_summary,
          completeness: 'partial'
        });
      }
      break;

    case 'corporate':
      // Display Company Revenue → Target Range → Company Link
      if (user.estimated_revenue) {
        metrics.push({
          label: 'Company Revenue',
          value: formatFinancialMillions(user.estimated_revenue),
          isPrimary: true,
          completeness: 'complete'
        });
      }
      if (user.revenue_range_min || user.revenue_range_max) {
        metrics.push({
          label: 'Target Range',
          value: formatRevenueRange(user.revenue_range_min, user.revenue_range_max),
          completeness: 'complete'
        });
      }
      break;

    case 'advisor': // legacy
      if (user.on_behalf_of_buyer) {
        metrics.push({
          label: 'On Behalf Of',
          value: user.on_behalf_of_buyer,
          isPrimary: true,
          completeness: 'complete'
        });
      }
      if (user.buyer_role) {
        metrics.push({
          label: 'Role',
          value: user.buyer_role,
          completeness: 'complete'
        });
      }
      if (user.buyer_org_url) {
        metrics.push({
          label: 'Org Website',
          value: 'Visit',
          isClickable: true,
          href: processUrl(user.buyer_org_url),
          completeness: 'complete'
        });
      }
      if (user.mandate_blurb) {
        metrics.push({
          label: 'Mandate',
          value: user.mandate_blurb,
          completeness: 'partial'
        });
      }
      break;

    case 'search_fund':
      // Highlight Funding Status → Funded By → Target Size
      if (user.is_funded) {
        metrics.push({
          label: 'Funding Status',
          value: user.is_funded === 'yes' ? 'Funded' : 'Unfunded',
          isPrimary: true,
          completeness: 'complete'
        });
      }
      if (user.funded_by && user.is_funded === 'yes') {
        metrics.push({
          label: 'Funded By',
          value: user.funded_by,
          completeness: 'complete'
        });
      }
      if (user.target_company_size) {
        metrics.push({
          label: 'Target Size',
          value: user.target_company_size,
          completeness: 'complete'
        });
      }
      break;

    case 'business_owner':
      if (user.owner_intent) {
        metrics.push({
          label: 'Intent',
          value: user.owner_intent,
          isPrimary: true,
          completeness: 'complete'
        });
      }
      if (user.owner_timeline) {
        metrics.push({
          label: 'Timeline',
          value: user.owner_timeline,
          completeness: 'complete'
        });
      }
      if (user.revenue_range_min || user.revenue_range_max) {
        metrics.push({
          label: 'Target Range',
          value: formatRevenueRange(user.revenue_range_min, user.revenue_range_max),
          completeness: 'complete'
        });
      }
      break;

    case 'individual_buyer':
      // Show Funding Source → SBA Needs → Target Range
      if (user.funding_source) {
        metrics.push({
          label: 'Funding Source',
          value: user.funding_source,
          isPrimary: true,
          completeness: 'complete'
        });
      }
      if (user.needs_loan) {
        metrics.push({
          label: 'SBA/Bank Loan',
          value: user.needs_loan === 'yes' ? 'Required' : 'Not needed',
          completeness: 'complete'
        });
      }
      if (user.revenue_range_min || user.revenue_range_max) {
        metrics.push({
          label: 'Target Range',
          value: formatRevenueRange(user.revenue_range_min, user.revenue_range_max),
          completeness: 'complete'
        });
      }
      break;
  }

  // Show deal intent if specified
  if (user.deal_intent) {
    metrics.push({
      label: 'Deal Intent',
      value: user.deal_intent.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
      isPrimary: false,
      isClickable: false
    });
  }

  // Show exclusions if specified (first 2)
  if (user.exclusions && user.exclusions.length > 0) {
    const exclusionsText = user.exclusions.slice(0, 2).join(', ') + (user.exclusions.length > 2 ? '...' : '');
    metrics.push({
      label: 'Exclusions',
      value: exclusionsText,
      isPrimary: false,
      isClickable: false
    });
  }

  // Show keywords if specified
  if (user.include_keywords && user.include_keywords.length > 0) {
    const keywordsText = user.include_keywords.slice(0, 2).join(', ') + (user.include_keywords.length > 2 ? '...' : '');
    metrics.push({
      label: 'Keywords',
      value: keywordsText,
      isPrimary: false,
      isClickable: false
    });
  }

  return metrics;
}

/**
 * Get data completeness score (0-100)
 */
export function getDataCompleteness(user: User | null): number {
  if (!user) return 0;

  const requiredFields = ['company', 'buyer_type'];
  const importantFields = ['linkedin_profile', 'website'];
  
  let score = 0;
  let total = requiredFields.length + importantFields.length;

  // Check required fields (weight: 2x)
  requiredFields.forEach(field => {
    if (user[field as keyof User]) {
      score += 2;
    }
    total += 1; // Add extra weight
  });

  // Check important fields (weight: 1x)
  importantFields.forEach(field => {
    if (user[field as keyof User]) {
      score += 1;
    }
  });

  // Check buyer-specific fields
  const buyerType = user.buyer_type as BuyerType;
  switch (buyerType) {
    case 'private_equity':
    case 'family_office':
      if (user.aum || user.fund_size) score += 3;
      if (user.investment_size) score += 1;
      total += 4;
      break;
    case 'corporate':
      if (user.estimated_revenue) score += 2;
      total += 2;
      break;
    case 'independent_sponsor':
      if (user.committed_equity_band || (Array.isArray(user.equity_source) && user.equity_source.length > 0)) score += 2;
      if (user.target_deal_size_min || user.target_deal_size_max) score += 1;
      total += 3;
      break;
    case 'advisor': // legacy
      if (user.on_behalf_of_buyer && user.buyer_role) score += 2;
      if (user.buyer_org_url) score += 1;
      total += 3;
      break;
    case 'search_fund':
      if (user.is_funded) score += 2;
      if (user.target_company_size) score += 1;
      total += 3;
      break;
    case 'business_owner':
      if (user.owner_intent) score += 2;
      if (user.owner_timeline) score += 1;
      total += 3;
      break;
    case 'individual_buyer':
      if (user.funding_source) score += 2;
      total += 2;
      break;
  }

  return Math.round((score / total) * 100);
}

/**
 * Handle missing data with consistent messaging
 */
export function handleMissingData(value: string | null | undefined, _label: string): string {
  if (!value || value.trim() === '') {
    return 'Not disclosed';
  }
  return value;
}

/**
 * Format financial range for display
 */
export function formatFinancialRange(min?: string | number | null, max?: string | number | null): string {
  if (!min && !max) return 'Not specified';
  
  const formatValue = (val: string | number | null | undefined) => {
    if (!val) return 'Any';
    if (typeof val === 'string') {
      // If it's already a labeled range token like "$5M - $10M", "Under $1M", or "Over $50M", show it as-is
      if (/under\s*\$|over\s*\$|\$\s*\d|m|b|\s-\s/i.test(val)) {
        return val;
      }
    }
    const parsed = typeof val === 'number' ? val : parseCurrency(val);
    return formatCurrency(parsed);
  };
  const minFormatted = formatValue(min);
  const maxFormatted = formatValue(max);
  
  if (min && max) {
    return `${minFormatted} - ${maxFormatted}`;
  } else if (min) {
    return `${minFormatted}+`;
  } else if (max) {
    return `Up to ${maxFormatted}`;
  }
  
  return 'Not specified';
}

/**
 * Centralized profile completion logic
 * Returns detailed completion information for strict profile validation
 */
export function getProfileCompletionDetails(user: User | null): {
  percentage: number;
  isComplete: boolean;
  requiredFields: string[];
  missingFields: string[];
  missingFieldLabels: string[];
} {
  if (!user) {
    return {
      percentage: 0,
      isComplete: false,
      requiredFields: [],
      missingFields: [],
      missingFieldLabels: [],
    };
  }

  const relevantFields = getRelevantFieldsForBuyerType(user.buyer_type || 'individual');
  const optionalFields = ['website', 'linkedin_profile'];
  const requiredFields = relevantFields.filter(f => !optionalFields.includes(f));

  const isCompleteField = (key: string) => {
    const value = user[key as keyof User];
    if (key === 'business_categories' || key === 'target_locations') {
      return Array.isArray(value) && value.length > 0;
    }
    return value !== null && value !== undefined && value !== '';
  };

  const missingFields = requiredFields.filter(key => !isCompleteField(key));
  const completedRequired = requiredFields.length - missingFields.length;
  const percentage = requiredFields.length > 0
    ? Math.round((completedRequired / requiredFields.length) * 100)
    : 100;

  // Import field labels from buyer-type-fields if available, or use simple formatting
  const formatFieldLabel = (key: string): string => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return {
    percentage,
    isComplete: percentage === 100,
    requiredFields,
    missingFields,
    missingFieldLabels: missingFields.map(formatFieldLabel),
  };
}

// Legacy function - kept for backward compatibility
// NOTE: For user-facing completeness percentages, use getProfileCompletionDetails instead
// This function uses weighted heuristics and is primarily for credibility signals
export function getStrictProfileCompletion(user: User | null): { percentage: number; isComplete: boolean } {
  const details = getProfileCompletionDetails(user);
  return {
    percentage: details.percentage,
    isComplete: details.isComplete,
  };
}
