export const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return "-";
  // Values >= 100000 are stored as raw integers (e.g., 5000000 = $5M)
  if (value >= 100000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1_000).toFixed(0)}K`;
  // Small values (< 1000) are likely already in millions (e.g., 20 = $20M from CSV)
  if (value >= 1) return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}M`;
  return `$${value}`;
};

export const normalizeCompanyName = (name: string) => {
  return name
    .replace(/,?\s*\b(LLC|L\.L\.C\.|Ltd\.?|Limited|Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company|LP|L\.P\.|LLP|L\.L\.P\.|P\.?C\.?|PLLC|P\.?A\.?|DBA|d\/b\/a)\b\.?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const getDomain = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace("www.", "");
  } catch {
    return null;
  }
};
