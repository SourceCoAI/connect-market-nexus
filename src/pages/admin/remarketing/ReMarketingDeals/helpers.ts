import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { createElement } from 'react';

export const extractWebsiteFromMemo = (memoLink: string | null): string | null => {
  if (!memoLink) return null;
  if (memoLink.includes('sharepoint.com') || memoLink.includes('onedrive')) return null;
  const websiteMatch = memoLink.match(/Website:\s*(https?:\/\/[^\s]+)/i);
  if (websiteMatch) return websiteMatch[1];
  if (memoLink.match(/^https?:\/\/[a-zA-Z0-9]/) && !memoLink.includes('sharepoint'))
    return memoLink;
  if (memoLink.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/)) return `https://${memoLink}`;
  return null;
};

export const getEffectiveWebsite = (listing: {
  website?: string | null;
  internal_deal_memo_link?: string | null;
}): string | null => {
  if (listing.website) return listing.website;
  return extractWebsiteFromMemo(listing.internal_deal_memo_link ?? null);
};

export const formatGeographyBadges = (states: string[] | null): string | null => {
  if (!states || states.length === 0) return null;
  if (states.length <= 3) return states.join(', ');
  return `${states.slice(0, 2).join(', ')} +${states.length - 2}`;
};

export const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '\u2014';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
};

export const formatWebsiteDomain = (website: string | null) => {
  if (!website) return null;
  return website
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
};

export const getScoreTrendIcon = (score: number) => {
  if (score >= 75) return createElement(TrendingUp, { className: 'h-3.5 w-3.5 text-green-500' });
  if (score >= 55) return createElement(Minus, { className: 'h-3.5 w-3.5 text-yellow-500' });
  return createElement(TrendingDown, { className: 'h-3.5 w-3.5 text-red-500' });
};
