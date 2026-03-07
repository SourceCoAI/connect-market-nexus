/**
 * Shared utility: derives the {{buyer_ref}} merge variable based on buyer type.
 *
 * Used by all three push-buyer-to-* edge functions.
 * Always returns a non-empty string — never undefined or null.
 */
export function deriveBuyerRef(buyerType: string | null, platformName: string | null): string {
  if (buyerType === 'pe_firm') {
    if (platformName && platformName.trim().length > 0) {
      return `your ${platformName.trim()} platform`;
    }
    return 'your portfolio';
  }
  if (buyerType === 'independent_sponsor') return 'your deal pipeline';
  if (buyerType === 'family_office') return 'your acquisition criteria';
  if (buyerType === 'individual_buyer') return 'your search';
  if (buyerType === 'strategic') return 'your growth strategy';
  return 'your investment criteria';
}
