// Extract website URL from internal_deal_memo_link
export const extractWebsiteFromMemo = (memoLink: string | null | undefined): string | null => {
  if (!memoLink) return null;

  // Skip SharePoint/OneDrive links
  if (memoLink.includes('sharepoint.com') || memoLink.includes('onedrive')) {
    return null;
  }

  // Handle "Website: https://..." format
  const websiteMatch = memoLink.match(/Website:\s*(https?:\/\/[^\s]+)/i);
  if (websiteMatch) return websiteMatch[1];

  // Handle direct URL (not SharePoint)
  if (memoLink.match(/^https?:\/\/[a-zA-Z0-9]/) && !memoLink.includes('sharepoint')) {
    return memoLink;
  }

  // Handle domain-only format (e.g., "pragra.io")
  if (memoLink.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/)) {
    return `https://${memoLink}`;
  }

  return null;
};

// Get effective website - prefer website field, fallback to extracted from memo
export const getEffectiveWebsite = (
  deal: { website?: string | null; internal_deal_memo_link?: string | null } | null,
): string | null => {
  if (deal?.website) return deal.website;
  return extractWebsiteFromMemo(deal?.internal_deal_memo_link);
};

// Calculate data completeness
export const calculateDataCompleteness = (
  deal: {
    title?: string | null;
    location?: string | null;
    revenue?: number | null;
    ebitda?: number | null;
    category?: string | null;
    executive_summary?: string | null;
    service_mix?: string[] | null;
    geographic_states?: string[] | null;
  } | null,
  effectiveWebsite: string | null,
): number => {
  if (!deal) return 0;

  const fields = [
    deal.title,
    deal.location,
    deal.revenue,
    deal.ebitda,
    deal.category,
    effectiveWebsite,
    deal.executive_summary,
    deal.service_mix,
    deal.geographic_states,
  ];

  const filledFields = fields.filter((f) => f !== null && f !== undefined && f !== '').length;
  return Math.round((filledFields / fields.length) * 100);
};

export const formatCurrency = (value: number | null): string => {
  if (value === null || value === undefined) return 'Not specified';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
};
