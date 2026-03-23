/**
 * Shared Geography Module for Deal Enrichment
 * Centralizes state normalization and local context detection per spec.
 */

// Complete US state mapping (canonical source for all edge functions)
export const STATE_MAPPINGS: Record<string, string> = {
  // Full names to codes
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  
  // Canadian provinces (full names to codes)
  'alberta': 'AB', 'british columbia': 'BC', 'manitoba': 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', 'newfoundland': 'NL', 'nova scotia': 'NS',
  'northwest territories': 'NT', 'nunavut': 'NU', 'ontario': 'ON',
  'prince edward island': 'PE', 'quebec': 'QC', 'saskatchewan': 'SK', 'yukon': 'YT',
  
  // Canadian province codes (passthrough)
  'ab': 'AB', 'bc': 'BC', 'mb': 'MB', 'nb': 'NB', 'nl': 'NL', 'ns': 'NS',
  'nt': 'NT', 'nu': 'NU', 'on': 'ON', 'pe': 'PE', 'qc': 'QC', 'sk': 'SK', 'yt': 'YT',
  // Already-valid codes (passthrough)
  'al': 'AL', 'ak': 'AK', 'az': 'AZ', 'ar': 'AR', 'ca': 'CA', 'co': 'CO',
  'ct': 'CT', 'de': 'DE', 'fl': 'FL', 'ga': 'GA', 'hi': 'HI', 'id': 'ID',
  'il': 'IL', 'in': 'IN', 'ia': 'IA', 'ks': 'KS', 'ky': 'KY', 'la': 'LA',
  'me': 'ME', 'md': 'MD', 'ma': 'MA', 'mi': 'MI', 'mn': 'MN', 'ms': 'MS',
  'mo': 'MO', 'mt': 'MT', 'ne': 'NE', 'nv': 'NV', 'nh': 'NH', 'nj': 'NJ',
  'nm': 'NM', 'ny': 'NY', 'nc': 'NC', 'nd': 'ND', 'oh': 'OH', 'ok': 'OK',
  'or': 'OR', 'pa': 'PA', 'ri': 'RI', 'sc': 'SC', 'sd': 'SD', 'tn': 'TN',
  'tx': 'TX', 'ut': 'UT', 'vt': 'VT', 'va': 'VA', 'wa': 'WA', 'wv': 'WV',
  'wi': 'WI', 'wy': 'WY', 'dc': 'DC',
};

// Set of valid 2-letter US state codes (derived from STATE_MAPPINGS, US-only)
export const VALID_US_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY','PR','GU','VI','AS','MP',
]);

// State code to full name (canonical, US + DC)
export const STATE_CODE_TO_NAME: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington D.C.',
  // Canadian provinces
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
};

// Reverse: full state name to code
export const STATE_NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_CODE_TO_NAME).map(([code, name]) => [name, code]),
);

// State code to anonymous regional descriptor (for anonymization in teasers/listings)
export const STATE_CODE_TO_REGION: Record<string, string> = {
  AL: 'Southeast', AK: 'Pacific Northwest', AZ: 'Southwest', AR: 'South Central',
  CA: 'West Coast', CO: 'Mountain West', CT: 'New England', DE: 'Mid-Atlantic',
  FL: 'Southeast', GA: 'Southeast', HI: 'Pacific', ID: 'Mountain West',
  IL: 'Midwest', IN: 'Midwest', IA: 'Midwest', KS: 'Great Plains',
  KY: 'Southeast', LA: 'Gulf Coast', ME: 'New England', MD: 'Mid-Atlantic',
  MA: 'New England', MI: 'Great Lakes', MN: 'Upper Midwest', MS: 'Gulf Coast',
  MO: 'Great Plains', MT: 'Mountain West', NE: 'Great Plains', NV: 'Mountain West',
  NH: 'New England', NJ: 'Mid-Atlantic', NM: 'Southwest', NY: 'Mid-Atlantic',
  NC: 'Southeast', ND: 'Upper Midwest', OH: 'Great Lakes', OK: 'South Central',
  OR: 'Pacific Northwest', PA: 'Mid-Atlantic', RI: 'New England', SC: 'Southeast',
  SD: 'Upper Midwest', TN: 'Southeast', TX: 'South Central', UT: 'Mountain West',
  VT: 'New England', VA: 'Mid-Atlantic', WA: 'Pacific Northwest', WV: 'Mid-Atlantic',
  WI: 'Great Lakes', WY: 'Mountain West', DC: 'Mid-Atlantic',
  // Canadian provinces
  AB: 'Western Canada', BC: 'Western Canada', MB: 'Central Canada',
  NB: 'Atlantic Canada', NL: 'Atlantic Canada', NS: 'Atlantic Canada',
  NT: 'Northern Canada', NU: 'Northern Canada', ON: 'Central Canada',
  PE: 'Atlantic Canada', QC: 'Central Canada', SK: 'Western Canada',
  YT: 'Northern Canada',
};

// Major city to state mapping for local context detection
export const CITY_TO_STATE: Record<string, string> = {
  // Major metros
  'new york': 'NY', 'nyc': 'NY', 'manhattan': 'NY', 'brooklyn': 'NY',
  'los angeles': 'CA', 'la': 'CA', 'san francisco': 'CA', 'sf': 'CA', 'san diego': 'CA',
  'silicon valley': 'CA', 'san jose': 'CA', 'oakland': 'CA', 'sacramento': 'CA',
  'chicago': 'IL', 'houston': 'TX', 'dallas': 'TX', 'dfw': 'TX', 'austin': 'TX',
  'san antonio': 'TX', 'fort worth': 'TX',
  'phoenix': 'AZ', 'scottsdale': 'AZ', 'tucson': 'AZ',
  'philadelphia': 'PA', 'philly': 'PA', 'pittsburgh': 'PA',
  'miami': 'FL', 'orlando': 'FL', 'tampa': 'FL', 'jacksonville': 'FL', 'ft lauderdale': 'FL',
  'atlanta': 'GA', 'savannah': 'GA',
  'boston': 'MA', 'cambridge': 'MA',
  'seattle': 'WA', 'tacoma': 'WA', 'spokane': 'WA',
  'denver': 'CO', 'boulder': 'CO', 'colorado springs': 'CO',
  'detroit': 'MI', 'ann arbor': 'MI', 'grand rapids': 'MI',
  'minneapolis': 'MN', 'twin cities': 'MN', 'st paul': 'MN', 'saint paul': 'MN',
  'portland': 'OR', // Could be ME too, but OR is more common
  'las vegas': 'NV', 'vegas': 'NV', 'reno': 'NV',
  'charlotte': 'NC', 'raleigh': 'NC', 'durham': 'NC',
  'nashville': 'TN', 'memphis': 'TN', 'knoxville': 'TN',
  'new orleans': 'LA', 'baton rouge': 'LA',
  'st louis': 'MO', 'saint louis': 'MO', 'kansas city': 'MO',
  'indianapolis': 'IN', 'indy': 'IN',
  'columbus': 'OH', 'cleveland': 'OH', 'cincinnati': 'OH',
  'baltimore': 'MD', 'washington dc': 'DC', 'dc': 'DC',
  'salt lake city': 'UT', 'slc': 'UT',
  'milwaukee': 'WI', 'madison': 'WI',
  'omaha': 'NE', 'lincoln': 'NE',
  'richmond': 'VA', 'virginia beach': 'VA', 'norfolk': 'VA',
  'providence': 'RI',
  'hartford': 'CT', 'new haven': 'CT',
  'albuquerque': 'NM', 'santa fe': 'NM',
  'boise': 'ID',
  'anchorage': 'AK',
  'honolulu': 'HI',
  'birmingham': 'AL', 'montgomery': 'AL',
  'little rock': 'AR',
  'des moines': 'IA',
  'wichita': 'KS',
  'louisville': 'KY', 'lexington': 'KY',
  'bangor': 'ME', 'portland me': 'ME',
  'jackson': 'MS',
  'billings': 'MT',
  'manchester': 'NH',
  'trenton': 'NJ', 'newark': 'NJ', 'jersey city': 'NJ',
  'buffalo': 'NY', 'rochester': 'NY', 'syracuse': 'NY', 'albany': 'NY',
  'fargo': 'ND',
  'oklahoma city': 'OK', 'tulsa': 'OK',
  'charleston': 'SC', 'columbia': 'SC',
  'sioux falls': 'SD',
  'burlington': 'VT',
  'charleston wv': 'WV',
  'cheyenne': 'WY',
};

// Regional patterns
export const REGIONAL_PATTERNS: { pattern: RegExp; states: string[] }[] = [
  { pattern: /\b(tri-state|tristate)\b/i, states: ['NY', 'NJ', 'CT'] },
  { pattern: /\bnew england\b/i, states: ['MA', 'CT', 'RI', 'VT', 'NH', 'ME'] },
  { pattern: /\b(southeast|south east)\b/i, states: ['FL', 'GA', 'SC', 'NC', 'TN', 'AL', 'MS', 'LA'] },
  { pattern: /\b(southwest|south west)\b/i, states: ['AZ', 'NM', 'TX', 'OK'] },
  { pattern: /\b(northwest|north west|pacific northwest|pnw)\b/i, states: ['WA', 'OR', 'ID'] },
  { pattern: /\b(midwest|mid-west)\b/i, states: ['IL', 'IN', 'MI', 'OH', 'WI', 'MN', 'IA', 'MO', 'KS', 'NE', 'SD', 'ND'] },
  { pattern: /\b(mountain west)\b/i, states: ['CO', 'UT', 'WY', 'MT', 'ID', 'NV'] },
  { pattern: /\b(gulf coast)\b/i, states: ['TX', 'LA', 'MS', 'AL', 'FL'] },
  { pattern: /\b(east coast)\b/i, states: ['ME', 'NH', 'MA', 'RI', 'CT', 'NY', 'NJ', 'DE', 'MD', 'VA', 'NC', 'SC', 'GA', 'FL'] },
  { pattern: /\b(west coast)\b/i, states: ['CA', 'OR', 'WA'] },
];

/**
 * Normalize a single state input to a 2-letter code
 */
export function normalizeState(input: string): string | null {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase();
  return STATE_MAPPINGS[cleaned] || null;
}

/**
 * Normalize an array of states, returning only valid 2-letter codes
 */
export function normalizeStates(states: string[]): string[] {
  if (!states || !Array.isArray(states)) return [];
  
  const normalized = new Set<string>();
  
  for (const state of states) {
    const code = normalizeState(state);
    if (code) {
      normalized.add(code);
    }
  }
  
  return Array.from(normalized).sort();
}

/**
 * Extract state codes from text using local context detection
 * Handles "near Orlando" -> FL, "serving the Dallas area" -> TX
 */
export function extractStatesFromText(text: string): string[] {
  if (!text) return [];
  
  const found = new Set<string>();
  const lowerText = text.toLowerCase();
  
  // Check for regional patterns first
  for (const { pattern, states } of REGIONAL_PATTERNS) {
    if (pattern.test(text)) {
      states.forEach(s => found.add(s));
    }
  }
  
  // Check for city mentions
  for (const [city, state] of Object.entries(CITY_TO_STATE)) {
    // Match city with word boundaries
    const cityPattern = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (cityPattern.test(lowerText)) {
      found.add(state);
    }
  }
  
  // Check for state name/code mentions
  for (const [name, code] of Object.entries(STATE_MAPPINGS)) {
    // Only match full state names (not 2-letter codes which could be false positives)
    if (name.length > 2) {
      const statePattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (statePattern.test(lowerText)) {
        found.add(code);
      }
    }
  }
  
  // Also match 2-letter codes when preceded by comma or state-like context
  const stateCodePattern = /(?:,\s*|\bstate\s+)([A-Z]{2})\b/gi;
  let match;
  while ((match = stateCodePattern.exec(text)) !== null) {
    const code = match[1].toUpperCase();
    if (STATE_MAPPINGS[code.toLowerCase()]) {
      found.add(code);
    }
  }
  
  return Array.from(found).sort();
}

/**
 * Merge new states with existing states, deduplicating
 */
export function mergeStates(existing: string[] | null | undefined, newStates: string[] | null | undefined): string[] {
  const merged = new Set<string>();
  
  if (existing && Array.isArray(existing)) {
    normalizeStates(existing).forEach(s => merged.add(s));
  }
  
  if (newStates && Array.isArray(newStates)) {
    normalizeStates(newStates).forEach(s => merged.add(s));
  }
  
  return Array.from(merged).sort();
}

/**
 * Get US state code from address
 */
export function extractStateFromAddress(address: string): string | null {
  if (!address) return null;
  
  // Try matching "City, ST" or "City, ST ZIP" pattern
  const pattern = /,\s*([A-Z]{2})(?:\s+\d{5})?(?:\s|$)/i;
  const match = address.match(pattern);
  
  if (match) {
    const code = match[1].toUpperCase();
    if (STATE_MAPPINGS[code.toLowerCase()]) {
      return code;
    }
  }
  
  // Fall back to text extraction
  const states = extractStatesFromText(address);
  return states.length > 0 ? states[0] : null;
}
