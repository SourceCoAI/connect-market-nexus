/**
 * Shared utility: derives the {{buyer_ref}} merge variable based on buyer type.
 *
 * Uses canonical buyer_type values (private_equity, corporate, etc.).
 * Used by all three push-buyer-to-* edge functions.
 * Always returns a non-empty string — never undefined or null.
 */
export function deriveBuyerRef(buyerType: string | null, platformName: string | null): string {
  const normalized = buyerType?.toLowerCase().trim() || '';

  if (normalized === 'private_equity' || normalized === 'pe_firm') {
    if (platformName && platformName.trim().length > 0) {
      return `your ${platformName.trim()} platform`;
    }
    return 'your portfolio';
  }
  if (normalized === 'independent_sponsor') return 'your deal pipeline';
  if (normalized === 'family_office') return 'your acquisition criteria';
  if (normalized === 'individual_buyer') return 'your search';
  if (normalized === 'corporate' || normalized === 'strategic') return 'your growth strategy';
  return 'your investment criteria';
}
