/**
 * Shared anonymization utilities for marketplace listings and teasers.
 *
 * Provides post-processing functions to strip leaked state names,
 * location-identifying patterns, and other anonymity breaches from
 * AI-generated content.
 */

// Canonical state-to-region mappings — must match deal-to-listing-anonymizer.ts
export const STATE_NAMES: Record<string, string> = {
  'Alabama': 'Southeast', 'Alaska': 'Northwest', 'Arizona': 'Mountain West',
  'Arkansas': 'South Central', 'California': 'West Coast', 'Colorado': 'Mountain West',
  'Connecticut': 'New England', 'Delaware': 'Mid-Atlantic', 'Florida': 'Southeast',
  'Georgia': 'Southeast', 'Hawaii': 'Pacific', 'Idaho': 'Mountain West',
  'Illinois': 'Midwest', 'Indiana': 'Midwest', 'Iowa': 'Midwest',
  'Kansas': 'Great Plains', 'Kentucky': 'Southeast', 'Louisiana': 'South Central',
  'Maine': 'New England', 'Maryland': 'Mid-Atlantic', 'Massachusetts': 'New England',
  'Michigan': 'Midwest', 'Minnesota': 'Great Plains', 'Mississippi': 'Southeast',
  'Missouri': 'Great Plains', 'Montana': 'Mountain West', 'Nebraska': 'Great Plains',
  'Nevada': 'Mountain West', 'New Hampshire': 'New England', 'New Jersey': 'Mid-Atlantic',
  'New Mexico': 'Mountain West', 'New York': 'Mid-Atlantic', 'North Carolina': 'Southeast',
  'North Dakota': 'Great Plains', 'Ohio': 'Midwest', 'Oklahoma': 'South Central',
  'Oregon': 'West Coast', 'Pennsylvania': 'Mid-Atlantic', 'Rhode Island': 'New England',
  'South Carolina': 'Southeast', 'South Dakota': 'Great Plains', 'Tennessee': 'Southeast',
  'Texas': 'South Central', 'Utah': 'Mountain West', 'Vermont': 'New England',
  'Virginia': 'Southeast', 'Washington': 'West Coast', 'West Virginia': 'Mid-Atlantic',
  'Wisconsin': 'Midwest', 'Wyoming': 'Mountain West',
};

export const STATE_ABBREVS: Record<string, string> = {
  'AL': 'Southeast', 'AK': 'Northwest', 'AZ': 'Mountain West', 'AR': 'South Central',
  'CA': 'West Coast', 'CO': 'Mountain West', 'CT': 'New England', 'DE': 'Mid-Atlantic',
  'FL': 'Southeast', 'GA': 'Southeast', 'HI': 'Pacific', 'ID': 'Mountain West',
  'IL': 'Midwest', 'IN': 'Midwest', 'IA': 'Midwest', 'KS': 'Great Plains',
  'KY': 'Southeast', 'LA': 'South Central', 'ME': 'New England', 'MD': 'Mid-Atlantic',
  'MA': 'New England', 'MI': 'Midwest', 'MN': 'Great Plains', 'MS': 'Southeast',
  'MO': 'Great Plains', 'MT': 'Mountain West', 'NE': 'Great Plains', 'NV': 'Mountain West',
  'NH': 'New England', 'NJ': 'Mid-Atlantic', 'NM': 'Mountain West', 'NY': 'Mid-Atlantic',
  'NC': 'Southeast', 'ND': 'Great Plains', 'OH': 'Midwest', 'OK': 'South Central',
  'OR': 'West Coast', 'PA': 'Mid-Atlantic', 'RI': 'New England', 'SC': 'Southeast',
  'SD': 'Great Plains', 'TN': 'Southeast', 'TX': 'South Central', 'UT': 'Mountain West',
  'VT': 'New England', 'VA': 'Southeast', 'WA': 'West Coast', 'WV': 'Mid-Atlantic',
  'WI': 'Midwest', 'WY': 'Mountain West',
};

/**
 * Post-process AI-generated text to strip leaked state names and
 * location-identifying patterns that could compromise anonymity.
 */
export function sanitizeAnonymityBreaches(text: string): string {
  let result = text;

  // Replace full state names with regional descriptors
  for (const [state, region] of Object.entries(STATE_NAMES)) {
    const escaped = state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), region);
  }

  // Replace specific location counts per region (e.g. "Two South Central locations" -> "several locations in one region")
  // Per-region counts combined with region names can narrow down the specific business
  const regionNames = 'South Central|Southeast|Midwest|Mid-Atlantic|West Coast|Mountain West|New England|Pacific|Northwest';
  result = result.replace(
    new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(${regionNames})\\s+(location|store|shop|office|branch|site|facilit)`, 'gi'),
    'several $3',
  );

  // Replace "both {Region} locations" pattern
  result = result.replace(
    new RegExp(`\\bboth\\s+(${regionNames})\\s+(location|store|shop|office|branch|site|facilit)`, 'gi'),
    'the $2',
  );

  return result;
}
